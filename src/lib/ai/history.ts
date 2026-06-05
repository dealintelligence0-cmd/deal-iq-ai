import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Keep only the newest `keep` rows for a given owner/module, deleting older
 * ones. Caps Supabase storage growth and matches the 20-item history UIs so
 * the stored count never silently balloons past what the UI shows.
 *
 * `filter` is an equality match (e.g. { user_id, module }). Rows are ordered
 * by created_at desc; everything past index `keep` is removed.
 */
export async function pruneHistory(
  admin: SupabaseClient,
  table: string,
  filter: Record<string, string>,
  keep = 20,
): Promise<void> {
  try {
    let q = admin.from(table).select("id");
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const { data } = await q
      .order("created_at", { ascending: false })
      .range(keep, keep + 1000);
    const ids = (data ?? []).map((r) => (r as { id: string }).id);
    if (ids.length) await admin.from(table).delete().in("id", ids);
  } catch {
    /* pruning is best-effort — never block the main request */
  }
}
