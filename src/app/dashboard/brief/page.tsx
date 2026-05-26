

"use client";

import { useEffect, useMemo, useState } from "react";
import { loadDealContext } from "@/lib/dealContext";
import ExecutiveBrief from "@/components/cognition/ExecutiveBrief";
import CognitionIndicators from "@/components/cognition/CognitionIndicators";

type Deal = Record<string, any> & { id: string };

function dealLabel(d: Deal): string {
  return d.account_name || d.target || d.target_name || d.buyer || d.name || `Deal ${String(d.id).slice(0, 8)}`;
}

export default function ExecutiveBriefPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealId, setDealId] = useState<string>("");
  const [loadingDeals, setLoadingDeals] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/deals/fetch");
        const j = await r.json();
        const list: Deal[] = j.deals ?? [];
        setDeals(list);
        const ctx = loadDealContext();
        const initial = ctx.deal_id && list.some((d) => d.id === ctx.deal_id)
          ? ctx.deal_id
          : (list[0]?.id ?? "");
        setDealId(initial);
      } catch {
        setDeals([]);
      } finally {
        setLoadingDeals(false);
      }
    })();
  }, []);

  const selectedLabel = useMemo(() => {
    const d = deals.find((x) => x.id === dealId);
    return d ? dealLabel(d) : null;
  }, [deals, dealId]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Executive Brief</h1>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
            On-demand synthesis of the deal model — thesis, risks, and cross-module flags in one place.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-slate-300">
          <span>Deal</span>
          <select
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            disabled={loadingDeals || deals.length === 0}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {deals.length === 0 && <option value="">No deals</option>}
            {deals.map((d) => (
              <option key={d.id} value={d.id}>{dealLabel(d)}</option>
            ))}
          </select>
        </label>
      </div>

      <ExecutiveBrief dealId={dealId || null} workspaceId={null} dealLabel={selectedLabel} />

      {dealId && (
        <div className="mt-6">
          <CognitionIndicators dealId={dealId} workspaceId={null} />
        </div>
      )}
    </div>
  );
}
