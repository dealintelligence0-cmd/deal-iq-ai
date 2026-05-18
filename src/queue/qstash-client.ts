

/**
 * QStash publisher helper.
 *
 * Used by enqueue endpoints to fan out background work to QStash, which then
 * POSTs to /api/queue/process-deal (signature-verified) within Vercel's
 * per-invocation timeout budget. This pattern is required when ingesting
 * 500-1000 deals/week — Vercel's serverless function timeout (10s on the
 * free tier, 60s on Pro) is not enough for sequential 50+ deal enrichment.
 *
 * Env vars required (set in Vercel project settings):
 *   QSTASH_TOKEN              — publisher auth token from console.upstash.com
 *   QSTASH_CURRENT_SIGNING_KEY — used by verifySignatureAppRouter in receivers
 *   QSTASH_NEXT_SIGNING_KEY    — rotation key
 *   NEXT_PUBLIC_APP_URL or VERCEL_URL — fully-qualified base URL for callbacks
 *
 * If QSTASH_TOKEN is unset, the publisher falls back to a synchronous
 * fetch — useful for local dev where you don't want to wire QStash.
 */

import { Client } from "@upstash/qstash";

let cachedClient: Client | null = null;

function getClient(): Client | null {
  if (cachedClient) return cachedClient;
  const token = process.env.QSTASH_TOKEN;
  if (!token) return null;
  cachedClient = new Client({ token });
  return cachedClient;
}

function getBaseUrl(): string {
  // VERCEL_URL is set automatically by Vercel; NEXT_PUBLIC_APP_URL is the
  // operator-set override (useful for custom domains).
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/**
 * Publish a background job to QStash.
 *
 * @param path Relative API path (e.g. "/api/queue/process-deal")
 * @param payload JSON body the receiver will see
 * @param opts.retries — QStash retry count (default 3)
 * @param opts.delaySeconds — delay before delivery (e.g. for rate-limit spacing)
 *
 * Returns the QStash message id (or "local-synchronous" in dev fallback).
 */
export async function publish(
  path: string,
  payload: Record<string, unknown>,
  opts: { retries?: number; delaySeconds?: number } = {},
): Promise<{ messageId: string; mode: "qstash" | "synchronous" }> {
  const client = getClient();
  const url = `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  if (!client) {
    // Local dev fallback: fire-and-forget fetch. The receiver's signature
    // verification will reject the request in production — but in dev,
    // signing keys are usually unset so we skip QStash entirely.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "QSTASH_TOKEN is not configured. Set it in Vercel env vars or fall back to the synchronous /api/ai/enrich-batch endpoint.",
      );
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => { /* fire-and-forget */ });
    return { messageId: "local-synchronous", mode: "synchronous" };
  }

  const res = await client.publishJSON({
    url,
    body: payload,
    retries: opts.retries ?? 3,
    delay: opts.delaySeconds,
  });

  return { messageId: res.messageId, mode: "qstash" };
}

/** Check whether QStash is configured. Useful for the UI to show queue mode. */
export function qstashConfigured(): boolean {
  return !!process.env.QSTASH_TOKEN;
}
