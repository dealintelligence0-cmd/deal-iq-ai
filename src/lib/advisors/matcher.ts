/**
 * Phase 6 — Advisor name matcher.
 *
 * Given an AI-extracted advisor name like "Goldman" or "GS" or "JP Morgan",
 * resolves it to a canonical row in advisor_registry by checking:
 *   1. Exact name match
 *   2. Display name match
 *   3. Alias array match
 *   4. Substring containment (looser, last resort)
 *
 * Returns null if no match — caller can insert a new row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AdvisorRow = {
  id: string;
  name: string;
  display_name: string;
  tier: string | null;
  country: string | null;
  aliases: string[];
};

function normalise(s: string): string {
  return s.toLowerCase()
    .replace(/[&,.]/g, " ")
    .replace(/\b(inc|llc|ltd|plc|group|partners|capital|securities|corp|corporation|co|company|sa|nv|ag|gmbh)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Load registry once, return a closure that resolves names to advisor IDs */
export async function buildAdvisorResolver(sb: SupabaseClient) {
  const { data } = await sb
    .from("advisor_registry")
    .select("id, name, display_name, tier, country, aliases");
  const rows = (data ?? []) as AdvisorRow[];

  // Build a fast lookup: every normalised name + alias → row
  const lookup = new Map<string, AdvisorRow>();
  for (const r of rows) {
    lookup.set(normalise(r.name), r);
    lookup.set(normalise(r.display_name), r);
    for (const a of r.aliases ?? []) lookup.set(normalise(a), r);
  }

  return {
    resolve(rawName: string): AdvisorRow | null {
      const n = normalise(rawName);
      if (!n) return null;
      // Exact
      const exact = lookup.get(n);
      if (exact) return exact;
      // Substring — find the longest aliases that fit
      let bestRow: AdvisorRow | null = null;
      let bestLen = 0;
      for (const [key, row] of lookup) {
        if (key.length < 4) continue;  // skip short noise
        if (n.includes(key) || key.includes(n)) {
          if (key.length > bestLen) { bestRow = row; bestLen = key.length; }
        }
      }
      return bestRow;
    },
    rows,
  };
}
