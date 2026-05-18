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

// Provider preference order — NVIDIA NIM is most reliable on free tier for embeddings
// (OpenRouter's embedding routes are notoriously flaky)
const EMBED_PROVIDERS = ["nvidia", "openai", "google", "cohere", "together", "openrouter"] as const;

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Optional: user picked a specific key from the dropdown
  let body: { embed_key_id?: string; label_key_id?: string } = {};
  try { body = await req.json(); } catch {}

  // 1. Find an embedding-capable key — user-chosen first, then auto-pick by preference order
  const { data: keys } = await admin.from("provider_keys")
    .select("id, provider, default_model, key_encrypted, label, is_default_economic")
    .eq("user_id", user.id);

  let embedConfig: EmbedConfig | null = null;
  let embedKeyLabel = "";
  if (keys && keys.length > 0) {
    let candidate = body.embed_key_id ? keys.find((k) => k.id === body.embed_key_id) : null;
    if (!candidate) {
      // Auto-pick: lowest index in EMBED_PROVIDERS wins
      const ranked = keys
        .filter((k) => (EMBED_PROVIDERS as readonly string[]).includes(k.provider as string))
        .map((k) => ({ k, rank: EMBED_PROVIDERS.indexOf(k.provider as typeof EMBED_PROVIDERS[number]) }))
        .sort((a, b) => a.rank - b.rank);
      candidate = ranked[0]?.k ?? null;
    }
    if (candidate) {
      const apiKey = await decryptKey(admin, candidate.key_encrypted as string);
      if (apiKey) {
        embedConfig = {
          provider: candidate.provider as unknown as EmbedConfig["provider"],
          apiKey,
        };
        embedKeyLabel = (candidate.label as string) || candidate.provider as string;
      }
    }
  }

  if (!embedConfig) {
    return NextResponse.json({
      error: "No embedding-capable key found. Save an OpenAI, Google, Cohere, OpenRouter, NVIDIA NIM, or Together AI key in Settings → API Key Library.",
    }, { status: 400 });
  }

  // 2. Smart-tier key for labeling — user override first, else smart → economic → fast
  let labelKey;
  let labelKeyLabel = "";
  if (body.label_key_id) {
    const pick = keys?.find((k) => k.id === body.label_key_id);
    if (pick) {
      const apiKey = await decryptKey(admin, pick.key_encrypted as string);
      if (apiKey) {
        labelKey = { provider: pick.provider as ProviderId, apiKey, model: pick.default_model as string | null };
        labelKeyLabel = (pick.label as string) || pick.provider as string;
      }
    }
  }
  if (!labelKey?.apiKey) labelKey = await resolveKey(admin, user.id, "smart");
  if (!labelKey?.apiKey) labelKey = await resolveKey(admin, user.id, "economic");
  if (!labelKey?.apiKey) labelKey = await resolveKey(admin, user.id, "fast");
  if (!labelKey?.apiKey) {
    return NextResponse.json({
      error: "No AI text-generation key found. Add one in Settings → API Key Library.",
    }, { status: 400 });
  }
  if (!labelKeyLabel) labelKeyLabel = labelKey.provider ?? "";

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
      embed_key_label: embedKeyLabel,
      label_provider: labelKey.provider,
      label_key_label: labelKeyLabel,
      ...result,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Refresh failed" }, { status: 500 });
  }
}
