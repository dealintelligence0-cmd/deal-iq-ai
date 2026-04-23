

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callProvider, PROVIDERS, type ProviderId } from "@/lib/ai/providers";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind, provider, inlineKey } = await req.json() as {
    kind: "bulk" | "premium";
    provider: ProviderId;
    inlineKey?: string;
  };

  let apiKey: string | null = inlineKey ?? null;

  // If no inline key provided, fetch encrypted key for this user
  if (!apiKey && provider !== "free") {
    const admin = createAdminClient();
    const col = kind === "bulk" ? "bulk_key_encrypted" : "premium_key_encrypted";
    const { data: row } = await admin
      .from("ai_settings")
      .select(col)
      .eq("user_id", user.id)
      .single();
    const cipher = (row as Record<string, unknown>)?.[col] as unknown;
    if (cipher) {
      const { data: decrypted } = await admin.rpc("decrypt_key", { cipher });
      apiKey = decrypted as string | null;
    }
  }

  if (provider !== "free" && !apiKey) {
    return NextResponse.json({ error: "No key saved for this provider" }, { status: 400 });
  }

  const model = kind === "bulk" ? PROVIDERS[provider].defaultBulkModel : PROVIDERS[provider].defaultPremiumModel;
  const testPrompt = PROVIDERS[provider].testPrompt || "ping";

  try {
    const res = await callProvider(provider, model, apiKey, [
      { role: "user", content: testPrompt },
    ], 32);
    return NextResponse.json({
      ok: true,
      provider, model,
      reply: res.text.slice(0, 120),
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      costUsd: res.costUsd,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
