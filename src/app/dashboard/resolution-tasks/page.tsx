

"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, X, Save, FileText } from "lucide-react";

type Task = {
  id: string;
  source_row_id: string;
  batch_id: string;
  canonical_deal_id: string | null;
  heading: string;
  opportunity: string | null;
  raw_bidders: string | null;
  raw_targets: string | null;
  raw_vendors: string | null;
  raw_intel_type: string | null;
  raw_intel_size: string | null;
  raw_intel_grade: string | null;
  ai_suggestions: Record<string, string | number | null>;
  field_confidence: Record<string, number>;
  uncertainty_reasons: string[];
  status: string;
  created_at: string;
};

type CorrectionDraft = {
  buyer: string;
  target: string;
  vendor: string;
  dominant_sector: string;
  dominant_geography: string;
  intelligence_size: string;
  intelligence_grade: string;
  stake_value: string;
  deal_type: string;
  deal_status: string;
  note: string;
};

const EMPTY_DRAFT: CorrectionDraft = {
  buyer: "", target: "", vendor: "",
  dominant_sector: "", dominant_geography: "",
  intelligence_size: "", intelligence_grade: "",
  stake_value: "", deal_type: "", deal_status: "",
  note: "",
};

export default function ResolutionTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<Task | null>(null);
  const [draft, setDraft] = useState<CorrectionDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [askingAi, setAskingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/ingestion/resolution-tasks?status=open&limit=100");
      if (!r.ok) throw new Error(`Server returned ${r.status}`);
      const j = await r.json();
      setTasks(j.tasks ?? []);
      setTotal(j.total ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openTask(t: Task) {
    setActive(t);
    const s = t.ai_suggestions ?? {};
    setDraft({
      buyer:              String(s.buyer ?? ""),
      target:             String(s.target ?? ""),
      vendor:             String(s.vendor ?? ""),
      dominant_sector:    String(s.dominant_sector ?? ""),
      dominant_geography: String(s.dominant_geography ?? ""),
      intelligence_size:  String(s.intelligence_size ?? ""),
      intelligence_grade: String(s.intelligence_grade ?? ""),
      stake_value:        String(s.stake_value ?? ""),
      deal_type:          String(s.deal_type ?? ""),
      deal_status:        String(s.deal_status ?? ""),
      note: "",
    });
  }

  async function resolve() {
    if (!active) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, string | null> = {};
      (Object.keys(draft) as (keyof CorrectionDraft)[]).forEach((k) => {
        const v = draft[k].trim();
        payload[k] = v === "" ? null : v;
      });
      const r = await fetch(`/api/ingestion/resolution-tasks/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error ?? `Server returned ${r.status}`);
      }
      setToast("Saved correction; row promoted to canonical deals.");
      setActive(null);
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function dismiss() {
    if (!active) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/ingestion/resolution-tasks/${active.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Server returned ${r.status}`);
      setToast("Task dismissed. The canonical row stays out of the deal pipeline until corrected.");
      setActive(null);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Dismiss failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl space-y-4 p-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Resolution Tasks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Doubtful rows from intelligence-feed imports. Each one is a deal that needs your review before reaching the pipeline.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {toast && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 p-3 dark:border-slate-800">
          <div className="text-xs text-slate-500">
            {total} open task{total === 1 ? "" : "s"} · showing latest {tasks.length}
          </div>
        </div>
        {tasks.length === 0 && !loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
            No open resolution tasks. All ingested rows are flowing cleanly to the deal pipeline.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {tasks.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => openTask(t)}
                  className="w-full px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                        <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                          {t.heading || "(no heading)"}
                        </span>
                      </div>
                      <div className="mt-1 ml-5 text-xs text-slate-500">
                        Suggested buyer: <span className="text-slate-700 dark:text-slate-300">{String(t.ai_suggestions?.buyer ?? "—")}</span>
                        {" · "}
                        Suggested target: <span className="text-slate-700 dark:text-slate-300">{String(t.ai_suggestions?.target ?? "—")}</span>
                      </div>
                      {t.uncertainty_reasons.length > 0 && (
                        <div className="mt-1 ml-5 text-[11px] text-slate-400">
                          Why flagged: {t.uncertainty_reasons.join(" · ")}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Resolution modal */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between border-b border-slate-200 p-4 dark:border-slate-800">
              <div className="flex-1 pr-4">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Resolve task</h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-3">{active.heading}</p>
              </div>
              <button onClick={() => setActive(null)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-4">
              {active.opportunity && (
                <details className="mb-3 rounded border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                  <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-300">
                    Original opportunity body
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-slate-600 dark:text-slate-400">{active.opportunity}</p>
                </details>
              )}

              {(active.raw_bidders || active.raw_targets || active.raw_vendors) && (
                <div className="mb-3 grid grid-cols-3 gap-2 text-[11px]">
                  {active.raw_bidders && (
                    <div className="rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800">
                      <div className="font-medium text-slate-500">Raw Bidders</div>
                      <div className="mt-0.5 break-words text-slate-700 dark:text-slate-300">{active.raw_bidders}</div>
                    </div>
                  )}
                  {active.raw_targets && (
                    <div className="rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800">
                      <div className="font-medium text-slate-500">Raw Targets</div>
                      <div className="mt-0.5 break-words text-slate-700 dark:text-slate-300">{active.raw_targets}</div>
                    </div>
                  )}
                  {active.raw_vendors && (
                    <div className="rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800">
                      <div className="font-medium text-slate-500">Raw Vendors</div>
                      <div className="mt-0.5 break-words text-slate-700 dark:text-slate-300">{active.raw_vendors}</div>
                    </div>
                  )}
                </div>
              )}

              {(() => {
                const s = active.ai_suggestions ?? {};
                const hasAny = Boolean(s.buyer || s.target || s.dominant_sector || s.deal_type);
                if (hasAny) {
                  return (
                    <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/30">
                      <p className="text-[11px] text-emerald-900 dark:text-emerald-200">
                        <b>✓ AI has pre-filled the fields below.</b> Review them and edit only what looks wrong, then click <b>Save Correction</b>. Hover any field's <em>conf %</em> to see how confident the extractor was.
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
                    <p className="flex-1 text-[11px] text-amber-900 dark:text-amber-200">
                      <b>⚠️ No AI suggestions yet.</b> The deterministic extractor couldn&apos;t parse this row. You can fill the fields manually OR ask AI to take a shot using your saved <em>Economic-tier</em> key.
                    </p>
                    <button
                      type="button"
                      disabled={askingAi}
                      onClick={async () => {
                        setAskingAi(true);
                        setAiError(null);
                        try {
                          const r = await fetch(`/api/ingestion/resolution-tasks/${active.id}/ask-ai`, { method: "POST" });
                          const j = await r.json();
                          if (!r.ok) throw new Error(j.error ?? "ask-ai failed");
                          // Refresh the active task with new AI suggestions
                          setActive({ ...active, ai_suggestions: j.ai_suggestions, field_confidence: j.field_confidence });
                          // Pre-fill draft with what AI returned
                          setDraft((p) => ({
                            ...p,
                            buyer: String(j.ai_suggestions.buyer ?? p.buyer ?? ""),
                            target: String(j.ai_suggestions.target ?? p.target ?? ""),
                            vendor: String(j.ai_suggestions.vendor ?? p.vendor ?? ""),
                            dominant_sector: String(j.ai_suggestions.dominant_sector ?? p.dominant_sector ?? ""),
                            dominant_geography: String(j.ai_suggestions.dominant_geography ?? p.dominant_geography ?? ""),
                            intelligence_size: String(j.ai_suggestions.intelligence_size ?? p.intelligence_size ?? ""),
                            intelligence_grade: String(j.ai_suggestions.intelligence_grade ?? p.intelligence_grade ?? ""),
                            stake_value: String(j.ai_suggestions.stake_value ?? p.stake_value ?? ""),
                            deal_type: String(j.ai_suggestions.deal_type ?? p.deal_type ?? ""),
                            deal_status: String(j.ai_suggestions.deal_status ?? p.deal_status ?? ""),
                          }));
                        } catch (e: any) {
                          setAiError(e?.message ?? "AI call failed");
                        } finally {
                          setAskingAi(false);
                        }
                      }}
                      className="flex-shrink-0 rounded bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                    >
                      {askingAi ? "🤖 Asking AI…" : "🤖 Ask AI to extract"}
                    </button>
                  </div>
                );
              })()}
              {aiError && (
                <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                  {aiError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {([
                  ["buyer", "Buyer"],
                  ["target", "Target"],
                  ["vendor", "Vendor / Seller"],
                  ["dominant_sector", "Sector"],
                  ["dominant_geography", "Geography"],
                  ["intelligence_size", "Intelligence Size"],
                  ["intelligence_grade", "Intelligence Grade"],
                  ["stake_value", "Stake"],
                  ["deal_type", "Deal Type"],
                  ["deal_status", "Deal Status"],
                ] as const).map(([key, label]) => {
                  const conf = active.field_confidence?.[key];
                  const suggestion = active.ai_suggestions?.[key];
                  return (
                    <div key={key}>
                      <label className="flex items-center justify-between text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        <span>
                          {label}
                          {typeof conf === "number" && (
                            <span className="ml-2 font-normal text-slate-400">
                              ({(conf * 100).toFixed(0)}% conf)
                            </span>
                          )}
                        </span>
                        {suggestion != null && String(suggestion).trim() !== "" && String(suggestion) !== draft[key] && (
                          <button
                            type="button"
                            onClick={() => setDraft((p) => ({ ...p, [key]: String(suggestion) }))}
                            className="text-[10px] text-indigo-600 hover:underline"
                            title={`Use AI suggestion: "${suggestion}"`}
                          >
                            use →
                          </button>
                        )}
                      </label>
                      <input
                        type="text"
                        value={draft[key]}
                        onChange={(e) => setDraft((p) => ({ ...p, [key]: e.target.value }))}
                        placeholder={suggestion != null ? `e.g. ${suggestion}` : ""}
                        className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-3">
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Note (optional — explains why this correction was needed)
                </label>
                <textarea
                  value={draft.note}
                  onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
                  rows={2}
                  className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
              <button
                onClick={dismiss}
                disabled={saving}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Dismiss (don&apos;t promote to pipeline)
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setActive(null)}
                  disabled={saving}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={resolve}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save &amp; promote to canonical
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
