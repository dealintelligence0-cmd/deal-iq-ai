

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
import { normalizeSourceRow } from "@/lib/data/pipeline";
import MappingGrid from "@/components/mapping/MappingGrid";
import TemplateBar, {
  type Template,
} from "@/components/mapping/TemplateBar";

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
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(
    null
  );

  // Load all uploads + templates on mount
  useEffect(() => {
    (async () => {
      const [{ data: up }, { data: tpl }] = await Promise.all([
        supabase
          .from("uploads")
          .select("id,file_name,storage_path,row_count,status,metadata")
          .eq("status", "parsed")
          .order("created_at", { ascending: false }),
        supabase
          .from("mapping_templates")
          .select("id,name,mapping")
          .order("created_at", { ascending: false }),
      ]);
      setUploads((up ?? []) as UploadRow[]);
      setTemplates(
        ((tpl ?? []) as { id: string; name: string; mapping: FieldMapping }[]).map(
          (t) => ({ id: t.id, name: t.name, mapping: t.mapping })
        )
      );
      setLoading(false);
    })();
  }, [supabase]);

  // Merged headers across all loaded files
  const mergedHeaders = useMemo(() => {
    const set = new Set<string>();
    loaded.forEach((f) => f.headers.forEach((h) => set.add(h)));
    return Array.from(set);
  }, [loaded]);

  const totalRows = useMemo(
    () => loaded.reduce((s, f) => s + f.rows.length, 0),
    [loaded]
  );

  async function loadSelected() {
    if (selected.size === 0) return;
    setParsing(true);
    setToast(null);
    try {
      const files: LoadedFile[] = [];
      for (const id of selected) {
        const u = uploads.find((x) => x.id === id);
        if (!u) continue;
        const pf = await parseStoredUpload(u.storage_path, u.file_name);
        files.push({
          uploadId: u.id,
          fileName: u.file_name,
          headers: pf.headers,
          rows: pf.rows,
        });
      }
      setLoaded(files);
      const allHeaders = Array.from(
        new Set(files.flatMap((f) => f.headers))
      );
      setMapping(autoMap(allHeaders));
    } catch (e) {
      setToast({
        type: "err",
        msg: e instanceof Error ? e.message : "Failed to load files",
      });
    } finally {
      setParsing(false);
    }
  }

  async function saveTemplate(name: string) {
    if (!mapping) return;
    setSavingTpl(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error, data } = await supabase
      .from("mapping_templates")
      .insert({
        created_by: u.user.id,
        name,
        mapping,
      })
      .select("id,name,mapping")
      .single();

    if (!error && data) {
      setTemplates((prev) => [
        { id: data.id, name: data.name, mapping: data.mapping as FieldMapping },
        ...prev,
      ]);
      setToast({ type: "ok", msg: `Saved template "${name}"` });
    } else {
      setToast({ type: "err", msg: error?.message ?? "Failed to save template" });
    }
    setSavingTpl(false);
  }

  async function applyTemplate(t: Template) {
    setMapping(t.mapping);
    setToast({ type: "ok", msg: `Applied template "${t.name}"` });
  }

  async function importAll() {
    if (!mapping || loaded.length === 0) return;
    const missing = missingRequired(mapping);
    if (missing.length > 0) {
      setToast({
        type: "err",
        msg: `Map required fields: ${missing.join(", ")}`,
      });
      return;
    }

    setImporting(true);
    setToast(null);

    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setImporting(false);
      return;
    }

    let totalInserted = 0;
    let totalDupes = 0;
    let totalBlanks = 0;
    let totalExceptions = 0;

    for (const f of loaded) {
      const standardized = applyMapping(f.rows, mapping, f.fileName) as RawDeal[];
      const { results, duplicatesRemoved, blanksRemoved } = cleanseBatch(standardized);
      totalDupes += duplicatesRemoved;
      totalBlanks += blanksRemoved;

      const dealRows = results.map((r) => {
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
        source_upload_id: f.uploadId,
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
        source_file: f.fileName,
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
        score_breakdown: normalized.score_breakdown,
        deal_takeaway: normalized.deal_takeaway,
        targeting_recommendation: normalized.targeting_recommendation,
        confidence_level: normalized.confidence_level,
      }});
      
      // Insert deals in chunks of 500, capture IDs back for exception linking
      const insertedIds: string[] = [];
      for (let i = 0; i < dealRows.length; i += 500) {
        const chunk = dealRows.slice(i, i + 500);
        let inserted: Array<{ id: string }> | null = null;
        let error: { message: string } | null = null;

        // First attempt: full normalized payload (for upgraded schema)
        {
          const res = await supabase.from("deals").insert(chunk).select("id");
          inserted = res.data as Array<{ id: string }> | null;
          error = res.error ? { message: res.error.message } : null;
        }

        // Fallback: legacy-safe payload if new columns do not exist yet
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

      // Build exceptions with deal_id references
      const exRows: Array<{
        created_by: string;
        deal_id: string;
        field: string;
        severity: string;
        message: string;
        raw_value: string | null;
        suggested_value: string | null;
      }> = [];
      results.forEach((res, idx) => {
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

      // Insert exceptions in chunks
      totalExceptions += exRows.length;
      for (let i = 0; i < exRows.length; i += 500) {
        const chunk = exRows.slice(i, i + 500);
        const { error } = await supabase.from("data_exceptions").insert(chunk);
        if (error) {
          setToast({ type: "err", msg: error.message });
          setImporting(false);
          return;
        }
      }

      // mark upload as imported
      await supabase
        .from("uploads")
        .update({ status: "imported" })
        .eq("id", f.uploadId);
    }

    setToast({
      type: "ok",
      msg: `Imported ${totalInserted} deals (${totalDupes} duplicate rows skipped, ${totalBlanks} blank rows skipped, ${totalExceptions} exceptions logged)`,
    });
    setImporting(false);

    // refresh uploads list
    const { data: up } = await supabase
      .from("uploads")
      .select("id,file_name,storage_path,row_count,status,metadata")
      .eq("status", "parsed")
      .order("created_at", { ascending: false });
    setUploads((up ?? []) as UploadRow[]);
    setSelected(new Set());
    setLoaded([]);
    setMapping(null);
  }

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <GitMerge className="h-5 w-5 text-violet-400" />
          Map &amp; Import
        </h1>
        <p className="text-sm text-white/60 mt-1">
          Select uploaded files, review auto-detected field mappings, and
          import cleansed deals into your pipeline.
        </p>
      </header>

      {toast && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            toast.type === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "ok" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            {toast.msg}
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-medium text-white/90 mb-3">Parsed Uploads</h2>

        {loading ? (
          <div className="text-sm text-white/60 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading uploads…
          </div>
        ) : uploads.length === 0 ? (
          <div className="text-sm text-white/60">
            No parsed uploads yet. Go to the Uploads page first.
          </div>
        ) : (
          <div className="space-y-2">
            {uploads.map((u) => {
              const checked = selected.has(u.id);
              return (
                <label
                  key={u.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="accent-violet-500"
                      checked={checked}
                      onChange={(e) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(u.id);
                          else next.delete(u.id);
                          return next;
                        });
                      }}
                    />
                    <div>
                      <div className="text-sm text-white/90">{u.file_name}</div>
                      <div className="text-xs text-white/50">
                        {u.row_count} rows • {u.metadata?.headers?.length ?? 0} columns
                      </div>
                    </div>
                  </div>
                  <span className="text-xs rounded-full px-2 py-0.5 border border-white/15 text-white/70">
                    {u.status}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={loadSelected}
            disabled={selected.size === 0 || parsing}
            className="rounded-lg px-3 py-2 text-sm font-medium border border-violet-400/30 bg-violet-500/10 text-violet-200 disabled:opacity-50"
          >
            {parsing ? "Loading…" : "Load Selected"}
          </button>
          <div className="text-xs text-white/50">
            Selected: {selected.size}
          </div>
        </div>
      </section>

      <TemplateBar
        templates={templates}
        onSave={saveTemplate}
        onApply={applyTemplate}
        disabled={!mapping}
        saving={savingTpl}
      />

      <MappingGrid
        fieldDefs={FIELD_DEFS}
        headers={mergedHeaders}
        mapping={mapping}
        onChange={setMapping}
      />

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-medium text-white/90 mb-2">Import Preview</h2>
        <div className="text-xs text-white/60">
          Files loaded: {loaded.length} • Total rows: {totalRows}
        </div>

        <div className="mt-4">
          <button
            onClick={importAll}
            disabled={!mapping || loaded.length === 0 || importing}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 disabled:opacity-50"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Importing…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Import into Deals
              </>
            )}
          </button>
        </div>
      </section>
    </main>
  );
}

function orNull<T>(v: T | null | undefined | ""): T | null {
  if (v === undefined || v === null || v === "") return null;
  return v;
}
