

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind, key } = await req.json();
  if (kind !== "bulk" && kind !== "premium") {
    return NextResponse.json({ error: "Bad kind" }, { status: 400 });
  }
  if (typeof key !== "string" || key.length > 500) {
    return NextResponse.json({ error: "Bad key" }, { status: 400 });
  }

  const { error } = await supabase.rpc("save_ai_key", { p_kind: kind, p_key: key });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
