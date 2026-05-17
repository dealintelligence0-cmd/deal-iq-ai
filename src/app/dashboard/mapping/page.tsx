



"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GitMerge,
  Loader2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { parseStoredUpload } from "@/lib/supabase/parse-storage";
import {
  FIELD_DEFS,
  autoMap,
  applyMapping,
  missingRequired,
  type FieldMapping,
} from "@/lib/mapping";
import { cleanseBatch, type RawDeal } from "@/lib/cleansing/engine";
import { ingestRows } from "@/lib/cleansing/orchestrator";
import { normalizeSourceRow } from "@/lib/data/pipeline";
import MappingGrid from "@/components/mapping/MappingGrid";
import TemplateBar, { type Template } from "@/components/mapping/TemplateBar";

type UploadRow = {
  id: string;
  file_name: string;
  storage_path: string;
  row_count: number;
  status: string;
  metadata: { headers?: string[] } | null;
};

type LoadedFile = {
  uploadId: string;
  fileName: string;
  headers: string[];
  rows: Record<string, unknown>[];
};

export default function MappingPage() {
  const supabase = createClient();
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState<LoadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [mapping, setMapping] = useState<FieldMapping | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [savingTpl, setSavingTpl] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const [{ data: upData }, { data: tplData }] = await Promise.all([
        supabase
          .from("uploads")
          .select("id,file_name,storage_path,row_count,status,metadata")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("mapping_templates")
          .select("id,name,mapping_json")
          .order("updated_at", { ascending: false }),
      ]);

      setUploads((upData ?? []) as UploadRow[]);
      setTemplates(
        (tplData ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          mapping: t.mapping_json as FieldMapping,
        }))
      );
      setLoading(false);
    })();
  }, [supabase]);

  const selectedRows = useMemo(
    () => uploads.filter((u) => selected.has(u.id)),
    [uploads, selected]
  );

  // ✅ required for MappingGrid headers prop
  const mergedHeaders = useMemo(() => {
    const set = new Set<string>();
    loaded.forEach((f) => f.headers.forEach((h) => set.add(h)));
    return Array.from(set);
  }, [loaded]);

  const totalRows = useMemo(
    () => loaded.reduce((s, f) => s + f.rows.length, 0),
    [loaded]
  );

  async function parseSelectedFiles() {
    if (selectedRows.length === 0) return;
    setParsing(true);
    setToast(null);

    try {
      const parsed: LoadedFile[] = [];
      for (const u of selectedRows) {
        const out = await parseStoredUpload(u.storage_path, u.file_name);
        parsed.push({
          uploadId: u.id,
          fileName: u.file_name,
          headers: out.headers,
          rows: out.rows,
        });
      }

      setLoaded(parsed);

      const unionHeaders = Array.from(new Set(parsed.flatMap((p) => p.headers)));
      const initial = autoMap(unionHeaders);
      setMapping(initial);
      setToast({ type: "ok", msg: `Loaded ${parsed.length} file(s). Auto-mapped columns.` });
    } catch (e: any) {
      setToast({ type: "err", msg: e?.message ?? "Failed to parse selected files." });
    } finally {
      setParsing(false);
    }
  }

  async function saveTemplate(name: string) {
    if (!mapping) return;
    setSavingTpl(true);
    setToast(null);
    const { error } = await supabase
      .from("mapping_templates")
      .insert({ name, mapping_json: mapping });
    setSavingTpl(false);

    if (error) {
      setToast({ type: "err", msg: error.message });
      return;
    }

    const { data } = await supabase
      .from("mapping_templates")
      .select("id,name,mapping_json")
      .order("updated_at", { ascending: false });

    setTemplates(
      (data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        mapping: t.mapping_json as FieldMapping,
      }))
    );
    setToast({ type: "ok", msg: `Saved template "${name}"` });
  }

  async function runImport() {
    if (!mapping || loaded.length === 0) return;
    setImporting(true);
    setToast(null);

    const missing = missingRequired(mapping);
    if (missing.length) {
      const labels = FIELD_DEFS.filter((d) => missing.includes(d.key)).map((d) => d.label);
      setToast({ type: "err", msg: `Missing required mappings: ${labels.join(", ")}` });
      setImporting(false);
      return;
    }

    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");

      let totalInserted = 0;
      let totalDupes = 0;
      let totalBlanks = 0;
      let totalExceptions = 0;

      for (const f of loaded) {
        // v3: route through orchestrator first. For intelligence feeds (Mergermarket
        // shape), this produces clean buyer/target/value/status. For other CSVs, it
        // falls back to the legacy column-mapping behavior.
        const { kept, dropped, feed_mode } = ingestRows(f.rows, f.fileName);
        totalBlanks += dropped.length;

        let mapped: Record<string, unknown>[];
        let legacyResults: Awaited<ReturnType<typeof cleanseBatch>>["results"] | null = null;
        if (feed_mode) {
          // Intelligence-feed path: build the mapped rows from the orchestrator's
          // clean output, using the orchestrator's already-cleaned buyer/target/etc.
          // We do NOT re-run applyMapping/cleanseBatch on these — that's what
          // contaminated the buyer/target columns previously.
          mapped = kept.map((d) => ({
            deal_date: d.deal_date,
            heading: d.heading,
            buyer: d.buyer,
            target: d.target,
            sector: d.sector,
            country: d.country,
            deal_type: d.deal_type,
            value_raw: d.value_raw,
            stake_percent: d.stake_percent,
            status: d.status,
            notes: d.notes,
            source_file: d.source_file,
            parse_confidence: d.parse_confidence,
            parse_path: d.parse_path,
            is_digest: d.is_digest,
            needs_review: d.needs_review,
            deal_value_usd_m: d.deal_value_usd_m,
            size_bucket: d.size_bucket,
            vendor: d.vendor,
            intelligence_type: d.intelligence_type,
          }));
        } else {
          // Legacy path: original applyMapping → cleanseBatch chain
          const legacyMapped = applyMapping(f.rows, mapping, f.fileName) as RawDeal[];
          const { results, duplicatesRemoved } = cleanseBatch(legacyMapped);
          legacyResults = results;
          totalDupes += duplicatesRemoved;
          mapped = results.map((r) => ({
            ...r.cleaned,
            source_file: f.fileName,
            parse_confidence: null,
            parse_path: "legacy",
            is_digest: false,
            needs_review: false,
            deal_value_usd_m: null,
            size_bucket: null,
            vendor: null,
            intelligence_type: r.cleaned.deal_type,
          }));
        }

        const dealRows = mapped.map((r) => {
          const heading = (r.heading as string | null) ?? null;
          const buyer = (r.buyer as string | null) ?? null;
          const target = (r.target as string | null) ?? null;
          const sector = (r.sector as string | null) ?? null;
          const country = (r.country as string | null) ?? null;
          const deal_type = (r.deal_type as string | null) ?? null;
          const value_raw = (r.value_raw as string | null) ?? null;
          const stake_percent = (r.stake_percent as number | null) ?? null;
          const status = (r.status as string | null) ?? "announced";
          const notes = (r.notes as string | null) ?? null;
          const deal_date = (r.deal_date as string | null) ?? null;

          // Run the scoring pipeline so we still get priority/advisory/risk scores,
          // but we feed it the ALREADY-CLEAN buyer/target so it can't re-corrupt them.
          const normalized = normalizeSourceRow({
            Date: deal_date ?? undefined,
            Bidders: buyer ?? undefined,
            Targets: target ?? undefined,
            "Dominant Sector": sector ?? undefined,
            "Dominant Geography": country ?? undefined,
            Geography: country ?? undefined,
            "Intelligence Type": deal_type ?? undefined,
            "Stake Value": stake_percent != null ? String(stake_percent) : undefined,
            "Intelligence Size": value_raw ?? undefined,
            Opportunity: notes ?? undefined,
            Heading: heading ?? undefined,
          });

          return {
            created_by: u.user!.id,
            source_upload_id: f.uploadId,
            deal_date: orNull(deal_date),
            buyer: orNull(buyer),
            target: orNull(target),
            sector: orNull(sector),
            country: orNull(country),
            deal_type: orNull(deal_type),
            value_raw: orNull(value_raw),
            normalized_value_usd: (r.deal_value_usd_m as number | null) ?? null,
            stake_percent,
            status,
            notes: orNull(notes),
            heading: orNull(heading),
            source_file: f.fileName,
            confidence_score: (r.parse_confidence as number | null) ?? null,
            data_quality_score: (r.parse_confidence as number | null) ?? null,
            geographies_involved: normalized.geographies_involved,
            india_flow: normalized.india_flow,
            deal_value_inr_range: normalized.deal_value_inr_range,
            deal_value_usd_range: normalized.deal_value_usd_range,
            deal_summary: normalized.deal_summary,
            stake_status: normalized.stake_status,
            priority_score: normalized.priority_score,
            advisory_score: normalized.advisory_score,
            risk_score: normalized.risk_score,
            priority_reason: normalized.priority_reason,
            advisory_reason: normalized.advisory_reason,
            risk_reason: normalized.risk_reason,
            score_breakdown: normalized.score_breakdown,
            deal_takeaway: normalized.deal_takeaway,
            targeting_recommendation: normalized.targeting_recommendation,
            confidence_level: normalized.confidence_level,
            parse_pattern: (r.parse_path as string | null) ?? null,
            parse_confidence: (r.parse_confidence as number | null) ?? null,
            is_digest: (r.is_digest as boolean | undefined) ?? false,
            needs_review: (r.needs_review as boolean | undefined) ?? false,
          };
        });

        const insertedIds: string[] = [];
        for (let i = 0; i < dealRows.length; i += 500) {
          const chunk = dealRows.slice(i, i + 500);
          let inserted: Array<{ id: string }> | null = null;
          let error: { message: string } | null = null;

          {
            const res = await supabase.from("deals").insert(chunk).select("id");
            inserted = res.data as Array<{ id: string }> | null;
            error = res.error ? { message: res.error.message } : null;
          }

          // Progressive fallback: when Supabase rejects a column, drop ONLY the
          // missing columns (one at a time if needed) rather than reverting to a
          // stripped-down 14-column legacy chunk that loses heading. This protects
          // the heading column even when other optional columns (parse_confidence,
          // is_digest, etc.) don't exist on the target table.
          if (error && /column|schema cache|does not exist/i.test(error.message)) {
            // Pull the missing column name out of the error if present
            const colMatch = /column.*?["']([\w_]+)["']/i.exec(error.message)
                          || /could not find.*?["']([\w_]+)["']/i.exec(error.message);
            const missingCol = colMatch?.[1];

            if (missingCol) {
              const trimmedChunk = chunk.map((r) => {
                const copy: Record<string, unknown> = { ...r };
                delete copy[missingCol];
                return copy;
              });
              const retry = await supabase.from("deals").insert(trimmedChunk).select("id");
              if (!retry.error) {
                inserted = retry.data as Array<{ id: string }> | null;
                error = null;
              } else {
                // Last-resort fallback: try the legacy minimal column set BUT keep heading
                const minimalChunk = chunk.map((r) => ({
                  created_by: r.created_by,
                  source_upload_id: r.source_upload_id,
                  deal_date: r.deal_date,
                  heading: r.heading,        // ← preserved even in minimal fallback
                  buyer: r.buyer,
                  target: r.target,
                  sector: r.sector,
                  country: r.country,
                  deal_type: r.deal_type,
                  value_raw: r.value_raw,
                  normalized_value_usd: r.normalized_value_usd,
                  stake_percent: r.stake_percent,
                  status: r.status,
                  notes: r.notes,
                  source_file: r.source_file,
                  confidence_score: r.confidence_score,
                  data_quality_score: r.data_quality_score,
                }));
                const fallback = await supabase.from("deals").insert(minimalChunk).select("id");
                inserted = fallback.data as Array<{ id: string }> | null;
                error = fallback.error ? { message: fallback.error.message } : null;
              }
            } else {
              // Couldn't identify a specific missing column — fall back to minimal-with-heading
              const minimalChunk = chunk.map((r) => ({
                created_by: r.created_by,
                source_upload_id: r.source_upload_id,
                deal_date: r.deal_date,
                heading: r.heading,
                buyer: r.buyer,
                target: r.target,
                sector: r.sector,
                country: r.country,
                deal_type: r.deal_type,
                value_raw: r.value_raw,
                normalized_value_usd: r.normalized_value_usd,
                stake_percent: r.stake_percent,
                status: r.status,
                notes: r.notes,
                source_file: r.source_file,
                confidence_score: r.confidence_score,
                data_quality_score: r.data_quality_score,
              }));
              const fallback = await supabase.from("deals").insert(minimalChunk).select("id");
              inserted = fallback.data as Array<{ id: string }> | null;
              error = fallback.error ? { message: fallback.error.message } : null;
            }
          }

          if (error) {
            setToast({ type: "err", msg: error.message });
            setImporting(false);
            return;
          }

          (inserted ?? []).forEach((d) => insertedIds.push(d.id));
          totalInserted += chunk.length;
        }

        const exRows: Array<{
          created_by: string;
          deal_id: string;
          field: string;
          severity: string;
          message: string;
          raw_value: string | null;
          suggested_value: string | null;
        }> = [];

        // Exception writeback only applies to the legacy column-mapping path.
        // The orchestrator path tracks exceptions inline via parse_confidence / needs_review,
        // so we skip writeback when feed_mode was used.
        if (legacyResults) {
          legacyResults.forEach((res, idx) => {
            const dealId = insertedIds[idx];
            if (!dealId) return;
            res.exceptions.forEach((ex) => {
              exRows.push({
                created_by: u.user!.id,
                deal_id: dealId,
                field: ex.field,
                severity: ex.severity,
                message: ex.message,
                raw_value: ex.rawValue ?? null,
                suggested_value: ex.suggestedValue ?? null,
              });
            });
          });
        }

        for (let i = 0; i < exRows.length; i += 500) {
          const chunk = exRows.slice(i, i + 500);
          const { error } = await supabase.from("exceptions").insert(chunk);
          if (error) {
            console.error("Exception insert failed:", error.message);
          } else {
            totalExceptions += chunk.length;
          }
        }
      }

      setToast({
        type: "ok",
        msg: `Imported ${totalInserted} deals · ${totalDupes} dupes · ${totalBlanks} blanks skipped · ${totalExceptions} exceptions flagged.`,
      });
    } catch (e: any) {
      setToast({ type: "err", msg: e?.message ?? "Import failed." });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-semibold text-slate-900">
        <GitMerge className="h-6 w-6 text-indigo-600" />
        File Mapping
      </h1>
      <p className="mb-5 text-sm text-slate-500">
        Map source columns from uploaded files, cleanse/standardize rows, and import into your deals database.
      </p>

      {toast && (
        <div
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            toast.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">1) Select uploaded files</h2>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading uploads…
              </div>
            ) : uploads.length === 0 ? (
              <p className="text-sm text-slate-500">No uploads found yet.</p>
            ) : (
              <div className="max-h-96 space-y-2 overflow-auto pr-1">
                {uploads.map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(u.id)}
                      onChange={(e) => {
                        const n = new Set(selected);
                        if (e.target.checked) n.add(u.id);
                        else n.delete(u.id);
                        setSelected(n);
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{u.file_name}</div>
                      <div className="text-xs text-slate-500">
                        {u.row_count} rows · {u.status}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <button
              onClick={parseSelectedFiles}
              disabled={selected.size === 0 || parsing}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Parse selected
            </button>
          </div>
        </div>

        <div className="xl:col-span-8 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">2) Column mapping</h2>

            {!mapping ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                Select files and click “Parse selected” to auto-map headers.
              </div>
            ) : (
              <>
                <TemplateBar
                  templates={templates}
                  onLoad={(tpl) => setMapping(tpl.mapping)}
                  onSave={saveTemplate}
                  saving={savingTpl}
                />
                <div className="mt-3">
                  <MappingGrid headers={mergedHeaders} mapping={mapping} onChange={setMapping} />
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">3) Import</h2>

            <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
              <Stat label="Selected files" value={String(selected.size)} />
              <Stat label="Loaded rows" value={totalRows.toLocaleString()} />
            </div>

            <button
              onClick={runImport}
              disabled={!mapping || loaded.length === 0 || importing}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {importing ? "Importing…" : "Run import"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function orNull<T>(v: T | undefined | null): T | null {
  return v === undefined ? null : v;
}
