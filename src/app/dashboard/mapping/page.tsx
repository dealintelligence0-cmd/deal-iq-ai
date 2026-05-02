

"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  cleanAndNormalizeRows,
  type MappingField,
  type RawRow,
} from "@/lib/cleansing/normalizer";
import { normalizeSourceRow } from "@/lib/data/pipeline";

type UploadRec = { uploadId: string; fileName: string; rows: RawRow[] };

const FIELDS: Array<{ key: MappingField; label: string; required?: boolean }> = [
  { key: "deal_date", label: "Deal Date", required: true },
  { key: "buyer", label: "Buyer", required: true },
  { key: "target", label: "Target", required: true },
  { key: "sector", label: "Sector", required: true },
  { key: "country", label: "Country" },
  { key: "deal_type", label: "Deal Type" },
  { key: "value_raw", label: "Value (raw text)" },
  { key: "normalized_value_usd", label: "Value (USD numeric)" },
  { key: "stake_percent", label: "Stake %" },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes" },
  { key: "confidence_score", label: "Confidence Score" },
  { key: "data_quality_score", label: "Data Quality Score" },
];

const statusClass = (t: "ok" | "err") =>
  t === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200";

const HEADER_HINTS: Record<MappingField, string[]> = {
  deal_date: ["date", "deal date", "announcement date", "close date"],
  buyer: ["buyer", "acquirer", "investor", "bidder"],
  target: ["target", "seller", "company", "asset"],
  sector: ["sector", "industry", "vertical"],
  country: ["country", "geo", "geography", "location"],
  deal_type: ["deal type", "type", "transaction type", "intelligence type"],
  value_raw: ["value", "deal value", "amount", "ticket", "size", "valuation"],
  normalized_value_usd: ["usd", "value usd", "amount usd"],
  stake_percent: ["stake", "ownership", "%", "percent"],
  status: ["status", "stage"],
  notes: ["notes", "description", "summary", "headline", "opportunity"],
  confidence_score: ["confidence", "confidence score"],
  data_quality_score: ["quality", "quality score", "data quality"],
};

function normHeader(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function autoMap(headers: string[]): Partial<Record<MappingField, string>> {
  const mapped: Partial<Record<MappingField, string>> = {};
  const normalizedHeaders = headers.map((h) => ({ raw: h, n: normHeader(h) }));

  for (const f of FIELDS) {
    const hints = HEADER_HINTS[f.key];
    const direct = normalizedHeaders.find((h) => hints.some((x) => h.n === x));
    const fuzzy = normalizedHeaders.find((h) => hints.some((x) => h.n.includes(x) || x.includes(h.n)));
    const hit = direct ?? fuzzy;
    if (hit) mapped[f.key] = hit.raw;
  }

  return mapped;
}

function orNull<T>(v: T | undefined | null): T | null {
  return v == null ? null : v;
}

export default function MappingPage() {
  const supabase = createClient();

  const [uploads, setUploads] = useState<UploadRec[]>([]);
  const [active, setActive] = useState<string>("");
  const [mapping, setMapping] = useState<Partial<Record<MappingField, string>>>({});
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const current = useMemo(
    () => uploads.find((u) => u.uploadId === active) ?? null,
    [uploads, active]
  );

  const headers = useMemo(() => {
    if (!current) return [];
    const set = new Set<string>();
    current.rows.forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
    return Array.from(set);
  }, [current]);

  const totalRows = current?.rows.length ?? 0;

  async function onPickFile(file: File) {
    setToast(null);
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    const rows: RawRow[] = json.map((r, i) => {
      const row: RawRow = { __rowNum__: i + 2 };
      for (const [k, v] of Object.entries(r)) row[k] = String(v ?? "");
      return row;
    });

    const { data: uRow, error: uErr } = await supabase
      .from("uploads")
      .insert({ file_name: file.name, row_count: rows.length })
      .select("id")
      .single();
    if (uErr || !uRow?.id) {
      setToast({ type: "err", msg: uErr?.message ?? "Failed to register upload." });
      return;
    }

    const rec: UploadRec = { uploadId: uRow.id, fileName: file.name, rows };
    setUploads((p) => [rec, ...p]);
    setActive(uRow.id);

    const auto = autoMap(Object.keys(rows[0] ?? {}));
    setMapping(auto);
    setToast({ type: "ok", msg: `Loaded ${rows.length} rows from ${file.name}` });
  }

  async function runImport() {
    if (!current) return;
    setImporting(true);
    setToast(null);

    try {
      const m = mapping as Record<MappingField, string>;
      const missingRequired = FIELDS.filter((f) => f.required && !m[f.key]).map((f) => f.label);
      if (missingRequired.length) {
        setToast({ type: "err", msg: `Missing required mappings: ${missingRequired.join(", ")}` });
        setImporting(false);
        return;
      }

      const { results, blanksRemoved } = cleanAndNormalizeRows(current.rows, m);
      const nonBlank = results.length;

      if (nonBlank === 0) {
        setToast({ type: "err", msg: "All rows were blank after cleanup. Nothing to import." });
        setImporting(false);
        return;
      }

      const totalDupes = results.filter((r) => r.duplicate).length;
      let totalBlanks = 0;
      let totalInserted = 0;
      let totalExceptions = 0;
      totalBlanks += blanksRemoved;

      const {
        data: u,
        error: uErr,
      } = await supabase.auth.getUser();

      if (uErr || !u.user) {
        setToast({ type: "err", msg: "Not authenticated." });
        setImporting(false);
        return;
      }

      const deduped = results.filter((r) => !r.duplicate);
      totalExceptions = deduped.reduce((s, r) => s + r.exceptions.length, 0);

      const dealRows = deduped.map((r) => {
        const normalized = normalizeSourceRow({
          "Date": r.cleaned.deal_date ?? undefined,
          "Bidders": r.cleaned.buyer ?? undefined,
          "Targets": r.cleaned.target ?? undefined,
          "Dominant Sector": r.cleaned.sector ?? undefined,
          "Dominant Geography": r.cleaned.country ?? undefined,
          "Geography": r.cleaned.country ?? undefined,
          "Intelligence Type": r.cleaned.deal_type ?? undefined,
          "Stake Value": r.cleaned.stake_percent != null ? String(r.cleaned.stake_percent) : undefined,
          "Intelligence Size": r.cleaned.value_raw ?? undefined,
          "Opportunity": r.cleaned.notes ?? undefined,
          "Heading": r.cleaned.notes ?? undefined,
        });

        return {
          created_by: u.user!.id,
          source_upload_id: current.uploadId,
          deal_date: orNull(normalized.date ?? r.cleaned.deal_date),
          buyer: orNull(r.cleaned.buyer),
          target: orNull(r.cleaned.target),
          sector: orNull(normalized.sector ?? r.cleaned.sector),
          country: orNull(normalized.country ?? r.cleaned.country),
          deal_type: orNull(normalized.deal_type ?? r.cleaned.deal_type),
          value_raw: orNull(r.cleaned.value_raw),
          normalized_value_usd: r.cleaned.normalized_value_usd,
          stake_percent: r.cleaned.stake_percent,
          status: r.cleaned.status ?? "announced",
          notes: orNull(normalized.deal_takeaway || r.cleaned.notes),
          source_file: current.fileName,
          confidence_score: r.cleaned.confidence_score,
          data_quality_score: r.cleaned.data_quality_score,
          // schema-safe optional fields (new deployments)
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

        if (error && /column|schema cache|does not exist/i.test(error.message)) {
          const legacyChunk = chunk.map((r) => ({
            created_by: r.created_by,
            source_upload_id: r.source_upload_id,
            deal_date: r.deal_date,
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
          const retry = await supabase.from("deals").insert(legacyChunk).select("id");
          inserted = retry.data as Array<{ id: string }> | null;
          error = retry.error ? { message: retry.error.message } : null;
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

      deduped.forEach((res, idx) => {
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

      for (let i = 0; i < exRows.length; i += 500) {
        const chunk = exRows.slice(i, i + 500);
        const { error } = await supabase.from("exceptions").insert(chunk);
        if (error) {
          console.error("Exception insert failed:", error.message);
        }
      }

      setToast({
        type: "ok",
        msg: `Imported ${totalInserted} deals · ${totalDupes} dupes · ${totalBlanks} blanks skipped · ${totalExceptions} exceptions flagged.`,
      });

      setTimeout(() => setToast(null), 3500);
    } catch (e: any) {
      setToast({ type: "err", msg: e?.message ?? "Import failed." });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">File Mapping</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload CSV/XLSX, map columns once, clean + normalize data, and import into your deals database.
        </p>
      </div>

      {toast && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${statusClass(toast.type)}`}>
          {toast.type === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">1) Upload source file</h2>

          <label
            className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/40"
          >
            <UploadCloud className="h-9 w-9 text-slate-400 group-hover:text-indigo-500" />
            <p className="mt-3 text-sm font-medium text-slate-700">Drop a file here or click to choose</p>
            <p className="mt-1 text-xs text-slate-500">Supports .csv, .xlsx</p>
            <input
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
              }}
            />
          </label>

          {uploads.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent uploads</p>
              {uploads.map((u) => (
                <button
                  key={u.uploadId}
                  onClick={() => {
                    setActive(u.uploadId);
                    const auto = autoMap(Object.keys(u.rows[0] ?? {}));
                    setMapping(auto);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${
                    active === u.uploadId
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <FileSpreadsheet className="h-4 w-4 shrink-0" />
                    <span className="truncate text-sm">{u.fileName}</span>
                  </span>
                  <span className="text-xs">{u.rows.length} rows</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">2) Map columns</h2>

          {!current ? (
            <p className="text-sm text-slate-500">Upload and select a file to start mapping.</p>
          ) : (
            <>
              <div className="grid gap-3">
                {FIELDS.map((f) => (
                  <div key={f.key} className="grid items-center gap-2 sm:grid-cols-[150px_1fr]">
                    <label className="text-sm text-slate-700">
                      {f.label}
                      {f.required && <span className="ml-1 text-red-500">*</span>}
                    </label>
                    <select
                      value={mapping[f.key] ?? ""}
                      onChange={(e) => setMapping((p) => ({ ...p, [f.key]: e.target.value || undefined }))}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">— Not mapped —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                File rows: <strong>{totalRows}</strong>
              </div>

              <button
                onClick={runImport}
                disabled={importing}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {importing ? "Importing…" : `Import ${totalRows} deals`}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
