import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind, key } = await req.json() as { kind: string; key: string };
  if (!["bulk", "premium", "economic"].includes(kind)) {
    return NextResponse.json({ error: "Bad kind" }, { status: 400 });
  }
  if (typeof key !== "string" || key.length > 500) {
    return NextResponse.json({ error: "Bad key" }, { status: 400 });
  }

  // Built-in save_ai_key only handles bulk/premium. For economic, encrypt + store directly.
  if (kind === "economic") {
    const admin = createAdminClient();
    const { data: cipher, error: encErr } = await admin.rpc("encrypt_key", { plain: key });
    if (encErr) return NextResponse.json({ error: encErr.message }, { status: 500 });
    const { error } = await admin.from("ai_settings")
      .update({ economic_key_encrypted: cipher })
      .eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.rpc("save_ai_key", { p_kind: kind, p_key: key });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
