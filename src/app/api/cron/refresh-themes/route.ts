/**
 * GET /api/cron/refresh-themes
 *
 * Vercel cron entry — runs nightly at 02:00 UTC. For every user who has both
 * an embedding-capable key AND a smart-tier key, refreshes their themes.
 *
 * Vercel automatically sets the Authorization: Bearer ${CRON_SECRET} header
 * when calling cron endpoints. We verify it.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveKey, decryptKey } from "@/lib/ai/key-resolver";
import { refreshThemes } from "@/lib/themes/refresh";
import type { EmbedConfig } from "@/lib/themes/embeddings";
import type { ProviderId } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

const EMBED_PROVIDERS = ["openai", "google", "cohere", "openrouter"] as const;

export async function GET(req: NextRequest) {
  // Auth: Vercel sends CRON_SECRET; in dev allow without
  const authHeader = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find active users — anyone with at least one provider_key
  const { data: users } = await admin
    .from("provider_keys")
    .select("user_id")
    .limit(500);
  if (!users) return NextResponse.json({ ok: true, processed: 0, summary: [] });

  const uniqueUsers = Array.from(new Set(users.map((u) => u.user_id as string)));
  const summary: Array<{ user: string; status: string; clusters?: number; embeddings?: number; error?: string }> = [];

  for (const userId of uniqueUsers) {
    try {
      const { data: keys } = await admin.from("provider_keys")
        .select("provider, key_encrypted").eq("user_id", userId);
      if (!keys || keys.length === 0) {
        summary.push({ user: userId, status: "no_keys" });
        continue;
      }
      const embedKeyRow = keys.find((k) => (EMBED_PROVIDERS as readonly string[]).includes(k.provider as string));
      if (!embedKeyRow) {
        summary.push({ user: userId, status: "no_embed_provider" });
        continue;
      }
      const embedApiKey = await decryptKey(admin, embedKeyRow.key_encrypted as string);
      if (!embedApiKey) {
        summary.push({ user: userId, status: "embed_decrypt_failed" });
        continue;
      }
      const smartKey = await resolveKey(admin, userId, "smart");
      if (!smartKey?.apiKey) {
        summary.push({ user: userId, status: "no_smart_key" });
        continue;
      }

      const embedConfig: EmbedConfig = {
        provider: embedKeyRow.provider as EmbedConfig["provider"],
        apiKey: embedApiKey,
      };
      const labelRouteConfig = {
        tier: "smart" as const,
        primaryProvider: smartKey.provider as ProviderId,
        primaryKey: smartKey.apiKey,
        primaryModel: smartKey.model ?? undefined,
      };

      // Use admin client scoped per user — RLS bypass intentional here
      const result = await refreshThemes(admin, {
        userId, embedConfig, labelRouteConfig,
        maxDealsToEmbed: 200,   // smaller cap for the cron
      });
      summary.push({
        user: userId, status: "ok",
        clusters: result.clusters_created,
        embeddings: result.embeddings_added,
      });
    } catch (e: any) {
      summary.push({ user: userId, status: "error", error: e?.message ?? "unknown" });
    }
  }

  return NextResponse.json({ ok: true, processed: uniqueUsers.length, summary });
}
