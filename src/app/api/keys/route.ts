

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — list all keys for the current user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("provider_keys")
    .select("id, provider, label, default_model, is_default_smart, is_default_economic, is_default_fast, created_at, last_used_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message, keys: [] }, { status: 500 });
  return NextResponse.json({ keys: rows ?? [] });
}

// POST — add a new key (encryption + insert happens entirely server-side via the insert_provider_key RPC)
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    provider: string;
    label: string;
    key: string;
    default_model?: string | null;
    is_default_smart?: boolean;
    is_default_economic?: boolean;
    is_default_fast?: boolean;
  };

  if (!body.provider || !body.label || !body.key) {
    return NextResponse.json({ error: "provider, label, and key are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("insert_provider_key", {
    p_user_id: user.id,
    p_provider: body.provider,
    p_label: body.label,
    p_plaintext_key: body.key,
    p_default_model: body.default_model ?? null,
    p_is_default_smart: body.is_default_smart ?? false,
    p_is_default_economic: body.is_default_economic ?? false,
    p_is_default_fast: body.is_default_fast ?? false,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // RPC returns an array of rows; unwrap the single inserted row
  const inserted = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ key: inserted });
}
