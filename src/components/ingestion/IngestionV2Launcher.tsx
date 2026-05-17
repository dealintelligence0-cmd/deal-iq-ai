

"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";

type SavedKey = {
  id: string;
  provider: string;
  label: string | null;
  default_model: string | null;
  is_default_smart: boolean;
  is_default_economic: boolean;
  is_default_fast: boolean;
};

type IngestSummary = {
  ok: true;
  batch_id: string;
  total_rows: number;
  canonical_rows: number;
  digest_rows: number;
  resolution_rows: number;
  blank_rows: number;
  errors: string[];
  ai_resolution: string | null;
};

type Props = {
  /** The file the user picked elsewhere (e.g. by re-using the upload page state). If absent, we render our own file input. */
  initialFile?: File | null;
};

/**
 * Drop this onto Pipeline Manager / Mapping / Imports — anywhere a user uploads
 * a Mergermarket XLS/CSV. It POSTs the file to /api/ingestion/upload using the
 * new v2 backend pipeline.
 *
 * AI fallback is OFF by default. When the user toggles AI on, they can pick
 * any saved key (or use the "economic / smart / fast" default tier).
 */
export default function IngestionV2Launcher({ initialFile }: Props) {
  const [file, setFile] = useState<File | null>(initialFile ?? null);
  const [keys, setKeys] = useState<SavedKey[]>([]);
  const [useAi, setUseAi] = useState(false);
  const [tier, setTier] = useState<"economic" | "smart" | "fast">("economic");
  const [keyId, setKeyId] = useState<string>(""); // "" = use tier default
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<IngestSummary | null>(null);

  useEffect(() => {
    fetch("/api/keys")
      .then((r) => r.ok ? r.json() : { keys: [] })
      .then((j) => setKeys((j.keys ?? []) as SavedKey[]))
      .catch(() => setKeys([]));
  }, []);

  async function run() {
    if (!file) {
      setError("Pick a file first.");
      return;
    }
    setBusy(true);
    setError(null);
    setSummary(null);

    const form = new FormData();
    form.append("file", file);

    const qs = new URLSearchParams();
    if (useAi) {
      qs.set("ai", "1");
      qs.set("tier", tier);
      if (keyId) qs.set("key_id", keyId);
    }

    try {
      const r = await fetch(`/api/ingestion/upload?${qs.toString()}`, {
        method: "POST",
        body: form,
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error ?? `Server returned ${r.status}`);
      setSummary(j as IngestSummary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  const hasKeysForTier = keys.some((k) => {
    if (tier === "economic") return k.is_default_economic;
    if (tier === "smart") return k.is_default_smart;
    return k.is_default_fast;
  });

  return (
    <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          New: v2 Ingestion Pipeline
        </h3>
        <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
          recommended
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
        Preserves every raw row, isolates doubtful rows in Resolution Tasks, and feeds only clean canonical data to the deal pipeline.
        Digests are kept separately. Corrections train future imports automatically.
      </p>

      {!initialFile && (
        <div className="mb-3">
          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
            File (XLS / XLSX / CSV)
          </label>
          <input
            type="file"
            accept=".xls,.xlsx,.csv,.tsv,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-xs text-slate-700 dark:text-slate-300"
          />
          {file && <p className="mt-1 text-[11px] text-slate-500">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <input
          type="checkbox"
          id="use-ai-fallback"
          checked={useAi}
          onChange={(e) => setUseAi(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        <label htmlFor="use-ai-fallback" className="text-xs text-slate-700 dark:text-slate-300">
          Use AI fallback for ambiguous rows (~20% of rows hit the API)
        </label>
      </div>

      {useAi && (
        <div className="mb-3 ml-5 space-y-2">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Key tier (default behaviour)
            </label>
            <div className="mt-1 flex gap-1.5">
              {(["economic", "smart", "fast"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTier(t); setKeyId(""); }}
                  className={`rounded border px-2 py-0.5 text-[11px] font-medium transition ${
                    tier === t
                      ? "border-indigo-500 bg-indigo-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {!hasKeysForTier && (
              <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-400">
                No saved key marked as default for &quot;{tier}&quot; — set one in Settings, or pick a specific key below.
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Or pick a specific saved key (overrides tier)
            </label>
            <select
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">— use {tier} default —</option>
              {keys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.provider} · {k.default_model ?? "(no default model)"} {k.label ? `· ${k.label}` : ""}
                </option>
              ))}
            </select>
            {keys.length === 0 && (
              <p className="mt-1 text-[10px] text-slate-500">
                No saved keys yet. Add one in Settings → Saved Keys & Status.
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {summary && (
        <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-xs dark:border-emerald-900 dark:bg-emerald-950">
          <div className="mb-1.5 flex items-center gap-1.5 font-medium text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Import complete
          </div>
          <ul className="ml-5 list-disc space-y-0.5 text-emerald-800 dark:text-emerald-300">
            <li>{summary.total_rows} rows received · all preserved as raw_feed_records</li>
            <li>
              <span className="font-medium">{summary.canonical_rows}</span> rows promoted to canonical deals (visible in Pipeline)
            </li>
            <li>
              <span className="font-medium">{summary.digest_rows}</span> digest articles isolated (not promoted)
            </li>
            <li>
              <span className="font-medium">{summary.resolution_rows}</span> rows need your review
              {summary.resolution_rows > 0 && (
                <span> — open <a className="underline" href="/dashboard/resolution-tasks">Resolution Tasks</a></span>
              )}
            </li>
            {summary.ai_resolution && (
              <li className="text-emerald-700 dark:text-emerald-400 italic">{summary.ai_resolution}</li>
            )}
            {summary.errors.length > 0 && (
              <li className="text-amber-800 dark:text-amber-300">
                {summary.errors.length} row-level error{summary.errors.length === 1 ? "" : "s"} (see batch detail)
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="h-3 w-3" />
          Raw data preserved · low-confidence rows isolated · auditable
        </div>
        <button
          onClick={run}
          disabled={!file || busy}
          className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {busy ? "Ingesting…" : "Import via v2 pipeline"}
        </button>
      </div>
    </div>
  );
}
