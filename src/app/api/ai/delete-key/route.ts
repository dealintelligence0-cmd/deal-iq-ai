import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind } = await req.json() as { kind: string };
  const valid = ["bulk", "premium", "economic", "tavily", "brave", "serper"];
  if (!valid.includes(kind)) return NextResponse.json({ error: "Bad kind" }, { status: 400 });

  const { data, error } = await supabase.rpc("delete_ai_key", { p_kind: kind });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: data });
}
