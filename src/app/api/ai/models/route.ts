import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveActiveCandidates, getModelsForTier, type ProviderId, type Tier } from "@/lib/ai/providers";

/**
 * Returns the ACTIVE model list for a provider + tier.
 *
 * The platform should only ever show models the provider currently offers, so
 * this endpoint asks the provider's own model-list API (via
 * `resolveActiveCandidates`) and returns:
 *   - `candidates`: curated, recommended models confirmed still live (in order)
 *   - `all`:        every live model id the provider offers (for an advanced view)
 *   - `live`:       whether the live list was reachable (false → curated fallback)
 *
 * When a model is retired upstream it simply stops appearing here, so the UI
 * list self-heals without a code change.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tier, provider, inlineKey } = await req.json() as {
    tier: Tier; provider: ProviderId; inlineKey?: string;
  };

  if (provider === "free") {
    return NextResponse.json({ candidates: getModelsForTier(provider, tier), all: [], live: false });
  }

  let apiKey: string | null = inlineKey ?? null;
  if (!apiKey) {
    const admin = createAdminClient();
    const col =
      tier === "fast"     ? "bulk_key_encrypted" :
      tier === "economic" ? "economic_key_encrypted" :
                            "premium_key_encrypted";
    const { data: row } = await admin.from("ai_settings").select(col).eq("user_id", user.id).single();
    const cipher = (row as Record<string, unknown>)?.[col];
    if (cipher) {
      const { data: decrypted } = await admin.rpc("decrypt_key", { cipher });
      apiKey = decrypted as string | null;
    }
  }

  const result = await resolveActiveCandidates(provider, tier, apiKey);
  return NextResponse.json(result);
}
