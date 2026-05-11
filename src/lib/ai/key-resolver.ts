

import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedKey = {
  provider: string;
  model: string | null;
  apiKey: string | null;
  source: "provider_keys" | "ai_settings_legacy" | null;
  keyId?: string;
};

export async function resolveKey(
  admin: SupabaseClient, userId: string,
  tier: "smart" | "economic" | "fast",
  overrideKeyId?: string,
): Promise<ResolvedKey> {
  if (overrideKeyId) {
    const { data: row } = await admin.from("provider_keys")
      .select("provider, default_model, key_encrypted").eq("user_id", userId).eq("id", overrideKeyId).maybeSingle();
    if (row) {
      const apiKey = await decryptKey(admin, row.key_encrypted as string);
      await admin.from("provider_keys").update({ last_used_at: new Date().toISOString() }).eq("id", overrideKeyId);
      return { provider: row.provider as string, model: row.default_model as string | null, apiKey, source: "provider_keys", keyId: overrideKeyId };
    }
  }

  const defaultCol = tier === "smart" ? "is_default_smart" : tier === "economic" ? "is_default_economic" : "is_default_fast";
  const { data: defaultRow } = await admin.from("provider_keys")
    .select("id, provider, default_model, key_encrypted")
    .eq("user_id", userId).eq(defaultCol, true).maybeSingle();
  if (defaultRow) {
    const apiKey = await decryptKey(admin, defaultRow.key_encrypted as string);
    await admin.from("provider_keys").update({ last_used_at: new Date().toISOString() }).eq("id", defaultRow.id);
    return { provider: defaultRow.provider as string, model: defaultRow.default_model as string | null, apiKey, source: "provider_keys", keyId: defaultRow.id as string };
  }

  // Legacy fallback
  const colMap = {
    smart: { provider: "premium_provider", model: "premium_model", key: "premium_key_encrypted" },
    economic: { provider: "economic_provider", model: "economic_model", key: "economic_key_encrypted" },
    fast: { provider: "bulk_provider", model: "bulk_model", key: "bulk_key_encrypted" },
  } as const;
  const cols = colMap[tier];
  const { data: legacy } = await admin.from("ai_settings")
    .select(`${cols.provider}, ${cols.model}, ${cols.key}`)
    .eq("user_id", userId).maybeSingle();
  if (legacy) {
    const provider = (legacy as Record<string, unknown>)[cols.provider] as string | null;
    const model = (legacy as Record<string, unknown>)[cols.model] as string | null;
    const enc = (legacy as Record<string, unknown>)[cols.key] as string | null;
    const apiKey = enc ? await decryptKey(admin, enc) : null;
    if (provider && apiKey && provider !== "free") {
      return { provider, model, apiKey, source: "ai_settings_legacy" };
    }
  }
  return { provider: "free", model: null, apiKey: null, source: null };
}

async function decryptKey(admin: SupabaseClient, encrypted: string): Promise<string | null> {
  try { const { data } = await admin.rpc("decrypt_key", { cipher: encrypted }); return data as string | null; }
  catch { return null; }
}
