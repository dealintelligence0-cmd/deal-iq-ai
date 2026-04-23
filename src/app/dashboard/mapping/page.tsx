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
    if (!u.user) {
      setSavingTpl(false);
      return;
    }
    const { data, error } = await supabase
      .from("mapping_templates")
      .insert({ created_by: u.user.id, name, mapping })
      .select("id,name,mapping")
      .single();
    if (!error && data) {
      setTemplates((p) => [
        { id: data.id, name: data.name, mapping: data.mapping as FieldMapping },
        ...p,
      ]);
      setToast({ type: "ok", msg: `Template "${name}" saved.` });
    } else {
      setToast({ type: "err", msg: error?.message ?? "Save failed" });
    }
    setSavingTpl(false);
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

      const dealRows = results.map((r) => ({
        created_by: u.user!.id,
        source_upload_id: f.uploadId,
        deal_date: orNull(r.cleaned.deal_date),
        buyer: orNull(r.cleaned.buyer),
        target: orNull(r.cleaned.target),
        sector: orNull(r.cleaned.sector),
        country: orNull(r.cleaned.country),
        deal_type: orNull(r.cleaned.deal_type),
        value_raw: orNull(r.cleaned.value_raw),
        normalized_value_usd: r.cleaned.normalized_value_usd,
        stake_percent: r.cleaned.stake_percent,
        status: r.cleaned.status ?? "announced",
        notes: orNull(r.cleaned.notes),
        source_file: f.fileName,
        confidence_score: r.cleaned.confidence_score,
        data_quality_score: r.cleaned.data_quality_score,
      }));

      // Insert deals in chunks of 500, capture IDs back for exception linking
      const insertedIds: string[] = [];
      for (let i = 0; i < dealRows.length; i += 500) {
        const chunk = dealRows.slice(i, i + 500);
        const { data: inserted, error } = await supabase
          .from("deals")
          .insert(chunk)
          .select("id");
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

      // Batch insert exceptions
      for (let i = 0; i < exRows.length; i += 500) {
        const chunk = exRows.slice(i, i + 500);
        const { error } = await supabase.from("exceptions").insert(chunk);
        if (error) {
          // Non-fatal: log but continue
          console.error("Exception insert failed:", error.message);
        } else {
          totalExceptions += chunk.length;
        }
      }

      await supabase
        .from("uploads")
        .update({ status: "imported" })
        .eq("id", f.uploadId);
    }

    setImporting(false);
    setToast({
      type: "ok",
      msg: `Imported ${totalInserted} deals · ${totalDupes} dupes · ${totalBlanks} blanks skipped · ${totalExceptions} exceptions flagged.`,
    });
    setLoaded([]);
    setMapping(null);
    setSelected(new Set());
    const { data: up } = await supabase
      .from("uploads")
      .select("id,file_name,storage_path,row_count,status,metadata")
      .eq("status", "parsed")
      .order("created_at", { ascending: false });
    setUploads((up ?? []) as UploadRow[]);
  }
  const missing = mapping ? missingRequired(mapping) : [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <GitMerge className="h-6 w-6 text-indigo-600" />
          Column Mapping & Merge
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Select uploaded files, review auto-detected field mappings, and
          import into your deals database.
        </p>
      </div>

      {/* Step 1 — pick files */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            1. Select files to merge
          </h2>
          <button
            onClick={loadSelected}
            disabled={selected.size === 0 || parsing}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {parsing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitMerge className="h-4 w-4" />
            )}
            Load {selected.size} file{selected.size === 1 ? "" : "s"}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          {loading ? (
            <div className="p-6 text-center text-sm text-slate-500">
              Loading uploads…
            </div>
          ) : uploads.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No parsed uploads yet. Go to the Uploads page first.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {uploads.map((u) => {
                const checked = selected.has(u.id);
                return (
                  <li
                    key={u.id}
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50"
                    onClick={() => {
                      const n = new Set(selected);
                      if (checked) n.delete(u.id);
                      else n.add(u.id);
                      setSelected(n);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {u.file_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {u.row_count} rows ·{" "}
                        {u.metadata?.headers?.length ?? 0} columns
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Step 2 — mapping */}
      {mapping && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            2. Review field mapping · {loaded.length} file
            {loaded.length === 1 ? "" : "s"} · {totalRows} rows ·{" "}
            {mergedHeaders.length} unique columns
          </h2>

          <div className="mb-4">
            <TemplateBar
              templates={templates}
              onLoad={(t) => setMapping(t.mapping)}
              onSave={saveTemplate}
              saving={savingTpl}
            />
          </div>

          <MappingGrid
            headers={mergedHeaders}
            mapping={mapping}
            onChange={setMapping}
          />

          {missing.length > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                Map these required fields before importing:{" "}
                <strong>{missing.join(", ")}</strong>
              </span>
            </div>
          )}
        </section>
      )}

      {/* Step 3 — import */}
      {mapping && (
        <section className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
          <button
            onClick={importAll}
            disabled={importing || missing.length > 0}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {importing ? "Importing…" : `Import ${totalRows} deals`}
          </button>
        </section>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg ${
            toast.type === "ok"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {toast.type === "ok" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
function orNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
// ---------- light-touch coercions (full cleansing comes in Phase 5) ----------
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[%,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDateSafe(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function mapStatus(v: unknown): string {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("close") || s.includes("complete")) return "closed";
  if (s.includes("live") || s.includes("progress")) return "live";
  if (s.includes("rumor")) return "rumor";
  if (s.includes("drop") || s.includes("cancel")) return "dropped";
  return "announced";
}
