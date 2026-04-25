import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await req.json() as { key: string };
  if (!key?.trim()) return NextResponse.json({ error: "Empty key" }, { status: 400 });

  const { data, error } = await supabase.rpc("save_tavily_key", { p_key: key.trim() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: data });
}
