

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { probeBestModel, type ProviderId, type Tier } from "@/lib/ai/providers";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind, provider, inlineKey } = await req.json() as {
    kind: Tier; provider: ProviderId; inlineKey?: string;
  };

  let apiKey: string | null = inlineKey ?? null;

  if (!apiKey && provider !== "free") {
    const admin = createAdminClient();
    const col = kind === "fast" ? "bulk_key_encrypted" : "premium_key_encrypted";
    const { data: row } = await admin.from("ai_settings").select(col).eq("user_id", user.id).single();
    const cipher = (row as Record<string, unknown>)?.[col];
    if (cipher) {
      const { data: decrypted } = await admin.rpc("decrypt_key", { cipher });
      apiKey = decrypted as string | null;
    }
  }

  if (provider !== "free" && !apiKey) {
    return NextResponse.json({ ok: false, error: "No key saved" }, { status: 200 });
  }

  const probe = await probeBestModel(provider, kind, apiKey);

  if (probe.ok && probe.model) {
    // Cache winner in ai_settings
    const admin = createAdminClient();
    const col = kind === "fast" ? "bulk_model" : "premium_model";
    await admin.from("ai_settings").update({ [col]: probe.model }).eq("user_id", user.id);
    return NextResponse.json({
      ok: true, provider, model: probe.model, tried: probe.tried,
    });
  }

  return NextResponse.json({ ok: false, error: probe.error, tried: probe.tried }, { status: 200 });
}
