import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { GUEST_COOKIE_NAME } from "@/lib/supabase/middleware";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 302 });
  res.cookies.delete(GUEST_COOKIE_NAME);
  return res;
}
