/**
 * POST /api/themes/refresh
 *
 * Triggers a theme refresh run for the current user. Uses:
 *   - the user's saved OpenAI / Google / Cohere / OpenRouter key for embeddings
 *   - the user's smart-tier AI key for labelling clusters
 *
 * Returns the run summary.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveKey, decryptKey } from "@/lib/ai/key-resolver";
import { refreshThemes } from "@/lib/themes/refresh";
import type { EmbedConfig } from "@/lib/themes/embeddings";
import type { ProviderId } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

const EMBED_PROVIDERS = ["openai", "google", "cohere", "openrouter"] as const;
type EmbedProvider = typeof EMBED_PROVIDERS[number];

export async function POST(_req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // 1. Find an embedding-capable key from the user's provider_keys
  const { data: keys } = await admin.from("provider_keys")
    .select("id, provider, default_model, key_encrypted, is_default_economic")
    .eq("user_id", user.id);

  let embedConfig: EmbedConfig | null = null;
  if (keys && keys.length > 0) {
    const candidate = keys.find((k) => (EMBED_PROVIDERS as readonly string[]).includes(k.provider as string));
    if (candidate) {
      const apiKey = await decryptKey(admin, candidate.key_encrypted as string);
      if (apiKey) {
        embedConfig = { provider: candidate.provider as EmbedProvider, apiKey };
      }
    }
  }

  if (!embedConfig) {
    return NextResponse.json({
      error: "No embedding-capable key found. Save an OpenAI, Google, Cohere, or OpenRouter key in Settings → API Key Library.",
    }, { status: 400 });
  }

  // 2. Smart-tier key for labeling
  const labelKey = await resolveKey(admin, user.id, "smart");
  if (!labelKey?.apiKey) {
    return NextResponse.json({
      error: "No smart-tier AI key configured. Add one in Settings → API Key Library.",
    }, { status: 400 });
  }

  const labelRouteConfig = {
    tier: "smart" as const,
    primaryProvider: labelKey.provider as ProviderId,
    primaryKey: labelKey.apiKey,
    primaryModel: labelKey.model ?? undefined,
  };

  try {
    const result = await refreshThemes(sb, {
      userId: user.id,
      embedConfig,
      labelRouteConfig,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Refresh failed" }, { status: 500 });
  }
}
