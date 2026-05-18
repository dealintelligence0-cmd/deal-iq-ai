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

const EMBED_PROVIDERS = ["openai", "google", "cohere", "openrouter", "nvidia", "together"] as const;
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
      error: "No embedding-capable key found. Save an OpenAI, Google, Cohere, OpenRouter, NVIDIA NIM, or Together AI key in Settings → API Key Library.",
    }, { status: 400 });
  }

  // 2. Smart-tier key for labeling — fall back gracefully through smart → economic → fast
  let labelKey = await resolveKey(admin, user.id, "smart");
  if (!labelKey?.apiKey) labelKey = await resolveKey(admin, user.id, "economic");
  if (!labelKey?.apiKey) labelKey = await resolveKey(admin, user.id, "fast");
  if (!labelKey?.apiKey) {
    return NextResponse.json({
      error: "No AI text-generation key found. Add one in Settings → API Key Library.",
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
    return NextResponse.json({
      ok: true,
      embed_provider: embedConfig.provider,
      label_provider: labelKey.provider,
      ...result,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Refresh failed" }, { status: 500 });
  }
}
