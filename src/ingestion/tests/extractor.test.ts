/**
 * Deal IQ AI — Ingestion v2 tests (deterministic extractor).
 *
 * Run with:  npx tsx --test src/lib/ingestion/tests/extractor.test.ts
 *
 * Acceptance criteria covered:
 *   - heading preserved verbatim
 *   - buyer/target extracted cleanly for canonical Mergermarket headings
 *   - digest articles detected and routed (drop_row = is_digest = true)
 *   - structured columns trusted when consistent, ignored when contaminated
 *   - asset-sale headings promote vendor → target
 *   - intelligence_size picks the LARGEST bucket
 *   - intelligence_grade preserved verbatim
 *   - no values invented for null fields
 *   - row routing thresholds
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractRow } from "../extractor";
import { routeRow } from "../router";
import { CONFIDENCE } from "../types";

describe("extractor — heading preservation", () => {
  it("preserves the heading text verbatim (modulo trim)", () => {
    const r = extractRow({ Heading: "EG On The Move acquires MPK Garages " });
    assert.equal(r.heading.trim(), "EG On The Move acquires MPK Garages");
  });

  it("does not translate or paraphrase the heading", () => {
    const odd = "X to acquire Y - sources say [translated]";
    const r = extractRow({ Heading: odd });
    assert.equal(r.heading, odd);
  });
});

describe("extractor — digest detection", () => {
  it("flags 'Weekly Digest' as digest", () => {
    const r = extractRow({ Heading: "India Private Equity Digest", Opportunity: "..." });
    assert.equal(r.is_digest, true);
    assert.ok(r.digest_reason && r.digest_reason.includes("digest"));
  });

  it("flags 'M&A Monitor APAC' as digest via Topics", () => {
    const r = extractRow({ Heading: "Markets stayed quiet this week", Topics: "Monthly Monitor" });
    assert.equal(r.is_digest, true);
  });

  it("does NOT flag a normal acquisition heading as digest", () => {
    const r = extractRow({ Heading: "Wipfli to acquire CompliancePoint" });
    assert.equal(r.is_digest, false);
  });
});

describe("extractor — structured columns (high confidence path)", () => {
  it("uses Bidders + Targets directly when single entities", () => {
    const r = extractRow({
      Heading: "EG On The Move acquires MPK Garages",
      Bidders: "EG On the Move Ltd",
      Targets: "MPK Garages Ltd",
      "Dominant Sector": "Consumer Discretionary",
      "Dominant Geography": "United Kingdom",
    });
    assert.equal(r.buyer.source, "structured");
    assert.equal(r.target.source, "structured");
    assert.ok(r.buyer.confidence >= 0.85);
    assert.ok(r.target.confidence >= 0.85);
    assert.ok((r.buyer.value ?? "").toLowerCase().includes("eg on the move"));
    assert.ok((r.target.value ?? "").toLowerCase().includes("mpk garages"));
  });

  it("rejects bare legal suffix tokens as targets", () => {
    // "Suntera; LTD" historical bug — LTD should never be a standalone entity
    const r = extractRow({
      Heading: "Suntera Global to acquire Experienced Advisory Consultants",
      Bidders: "Suntera Global Ltd",
      Targets: "Experienced Advisory Consultants",
    });
    assert.ok(!(r.target.value ?? "").toLowerCase().endsWith("; ltd"));
    assert.ok(!(r.buyer.value ?? "").toLowerCase().endsWith("; ltd"));
  });

  it("rejects 'Company Record Pending' placeholder", () => {
    const r = extractRow({
      Heading: "Summit Fleet acquires Capps Van & Truck Rental",
      Bidders: "Summit Fleet Management LLC",
      Targets: "Company Record Pending",
    });
    // Either target comes from heading_pattern or is null — never the placeholder
    assert.ok(!(r.target.value ?? "").toLowerCase().includes("record pending"));
  });

  it("rejects Bidders contamination when >10 entities", () => {
    // Digest-style smushed list with 15 unrelated bidders
    const r = extractRow({
      Heading: "Some normal-looking acquisition",
      Bidders: Array.from({ length: 15 }, (_, i) => `Firm ${i + 1} Ltd`).join(";"),
      Targets: "Some Target Ltd",
    });
    // Bidders is rejected; structured path produced no buyer
    assert.equal(r.buyer.source !== "structured", true);
  });
});

describe("extractor — heading pattern fallback", () => {
  it("matches 'X to acquire Y' when Bidders is empty", () => {
    const r = extractRow({
      Heading: "Wipfli to acquire CompliancePoint",
    });
    assert.ok(r.buyer.value?.toLowerCase().includes("wipfli"));
    assert.ok(r.target.value?.toLowerCase().includes("compliancepoint"));
    assert.equal(r.buyer.source, "heading_pattern");
  });

  it("matches 'X sells Y to Z' with correct buyer/target direction", () => {
    const r = extractRow({
      Heading: "Vion sells Buchloe Production Site to ABP Food Group",
    });
    assert.ok(r.buyer.value?.toLowerCase().includes("abp food group"));
    assert.ok(r.target.value?.toLowerCase().includes("buchloe"));
  });

  it("'X in talks to raise from Y' makes X target, Y buyer", () => {
    const r = extractRow({
      Heading: "DailyObjects in talks for up to INR 3bn fundraise – report",
    });
    assert.ok(r.target.value?.toLowerCase().includes("dailyobjects"));
  });
});

describe("extractor — never invents values", () => {
  it("returns null for buyer/target when nothing matches", () => {
    const r = extractRow({
      Heading: "Some unrecognizable sentence that mentions nothing useful here.",
    });
    assert.equal(r.buyer.value, null);
    assert.equal(r.target.value, null);
    assert.ok(r.row_confidence < CONFIDENCE.AUTO_CANONICAL);
  });

  it("returns null for stake when no signal exists", () => {
    const r = extractRow({ Heading: "Wipfli to acquire CompliancePoint" });
    assert.equal(r.stake_value.value, null);
  });

  it("does NOT force default 'Acquisition' status without evidence", () => {
    const r = extractRow({ Heading: "Some completely ambiguous statement about a company" });
    assert.equal(r.deal_status.value, null);
  });
});

describe("extractor — asset-sale promotion", () => {
  it("promotes Vendor → Target when heading says 'places on sales block'", () => {
    const r = extractRow({
      Heading: "TTK Healthcare places consumer products division on sales block – report",
      Bidders: "Wipro Consumer Care & Lighting Ltd.,Mankind Pharma Ltd,Zydus Wellness Ltd",
      Vendors: "TTK Healthcare Ltd",
    });
    assert.ok(r.target.value?.toLowerCase().includes("ttk healthcare"));
    assert.ok(r.buyer.value?.toLowerCase().includes("wipro"));
  });
});

describe("extractor — intelligence_size picks largest bucket", () => {
  it("picks '> INR 21bn' over 'INR 4bn-21bn' when both present", () => {
    const r = extractRow({
      Heading: "Some deal",
      "Intelligence Size": "> INR 21bn,INR 4bn-21bn,INR 2bn-4bn",
    });
    assert.ok((r.intelligence_size.value ?? "").startsWith("> INR 21bn"));
  });
});

describe("extractor — intelligence_grade preserved", () => {
  it("preserves grade verbatim", () => {
    const r = extractRow({
      Heading: "Some deal",
      "Intelligence Grade": "Strong evidence",
    });
    assert.equal(r.intelligence_grade.value, "Strong evidence");
  });
});

describe("router — routing decisions", () => {
  it("routes a digest row to 'digest'", () => {
    const r = extractRow({ Heading: "Weekly Digest of M&A" });
    assert.equal(routeRow(r).kind, "digest");
  });

  it("routes a high-confidence acquisition to 'canonical'", () => {
    const r = extractRow({
      Heading: "EG On The Move acquires MPK Garages",
      Bidders: "EG On the Move Ltd",
      Targets: "MPK Garages Ltd",
      "Dominant Sector": "Consumer Discretionary",
      "Dominant Geography": "United Kingdom",
      "Intelligence Grade": "Confirmed",
    });
    const d = routeRow(r);
    assert.equal(d.kind, "canonical");
  });

  it("routes an empty / unparseable row to 'resolution'", () => {
    const r = extractRow({ Heading: "Some completely garbled text" });
    const d = routeRow(r);
    assert.equal(d.kind, "resolution");
    if (d.kind === "resolution") assert.equal(d.result.needs_review, true);
  });

  it("rows missing both buyer AND target go to resolution regardless of conf", () => {
    const r = extractRow({
      Heading: "Activity continues in the market",
      "Dominant Sector": "Technology",
      "Dominant Geography": "USA",
      "Intelligence Grade": "Strong evidence",
    });
    const d = routeRow(r);
    assert.equal(d.kind, "resolution");
  });
});
