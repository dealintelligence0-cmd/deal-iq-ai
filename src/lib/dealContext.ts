

// Shared deal context across all four module pages.
// Persisted in sessionStorage so navigation between modules (and sidebar clicks)
// doesn't lose buyer/target/sector/geography/deal_size/deal_id.
// Generated outputs are also persisted per-module until the partner clicks Clear.

export type DealContext = {
  deal_id?: string;
  buyer?: string;
  target?: string;   // for TSA this is the carve-out entity (called "seller" in TSA UI)
  sector?: string;
  geography?: string;
  deal_size?: string;
};

const CTX_KEY = "dealiq:dealContext";
const OUTPUT_PREFIX = "dealiq:output:";  // dealiq:output:proposal / :synergy / :pmi / :tsa

export function saveDealContext(ctx: DealContext) {
  if (typeof window === "undefined") return;
  // Don't overwrite with empty values
  if (!ctx.deal_id && !ctx.buyer && !ctx.target && !ctx.sector && !ctx.geography && !ctx.deal_size) return;
  try {
    const existing = loadDealContext();
    // Merge: new non-empty values win
    const merged: DealContext = { ...existing };
    if (ctx.deal_id) merged.deal_id = ctx.deal_id;
    if (ctx.buyer) merged.buyer = ctx.buyer;
    if (ctx.target) merged.target = ctx.target;
    if (ctx.sector) merged.sector = ctx.sector;
    if (ctx.geography) merged.geography = ctx.geography;
    if (ctx.deal_size) merged.deal_size = ctx.deal_size;
    sessionStorage.setItem(CTX_KEY, JSON.stringify(merged));
  } catch { /* sessionStorage unavailable */ }
}

export function loadDealContext(): DealContext {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(CTX_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function clearDealContext() {
  if (typeof window === "undefined") return;
  try { sessionStorage.removeItem(CTX_KEY); } catch { /* ignore */ }
}

// If a new deal_id arrives that differs from what's stored, wipe and start fresh.
// Prevents stale buyer/target carrying over to a different deal.
export function resetIfNewDeal(newDealId: string | undefined | null) {
  if (typeof window === "undefined" || !newDealId) return;
  try {
    const raw = sessionStorage.getItem(CTX_KEY);
    if (!raw) return;
    const existing = JSON.parse(raw) as DealContext;
    if (existing.deal_id && existing.deal_id !== newDealId) {
      // Different deal — clear everything (context + all outputs)
      sessionStorage.removeItem(CTX_KEY);
      ["proposal", "synergy", "pmi", "tsa"].forEach((m) => {
        sessionStorage.removeItem(OUTPUT_PREFIX + m);
      });
    }
  } catch { /* ignore */ }
}

// --- Generated output persistence ---

export type ModuleId = "proposal" | "synergy" | "pmi" | "tsa";

export function saveOutput(module: ModuleId, content: string) {
  if (typeof window === "undefined" || !content) return;
  try { sessionStorage.setItem(OUTPUT_PREFIX + module, content); } catch { /* ignore */ }
}

export function loadOutput(module: ModuleId): string | null {
  if (typeof window === "undefined") return null;
  try { return sessionStorage.getItem(OUTPUT_PREFIX + module); } catch { return null; }
}

export function clearOutput(module: ModuleId) {
  if (typeof window === "undefined") return;
  try { sessionStorage.removeItem(OUTPUT_PREFIX + module); } catch { /* ignore */ }
}
