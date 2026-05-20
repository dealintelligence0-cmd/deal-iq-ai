
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export const GUEST_COOKIE_NAME = "deal_iq_guest";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Check guest session cookie if no authed user
  let isValidGuest = false;
  if (!user) {
    const guestToken = request.cookies.get(GUEST_COOKIE_NAME)?.value;
    if (guestToken) {
      // Lightweight check using service role (read-only on the active link)
      // This runs on every dashboard request, so we keep it cheap.
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && serviceKey) {
        try {
          const admin = createPlainClient(url, serviceKey);
          const { data } = await admin
            .from("admin_invite_links")
            .select("id, is_active")
            .eq("token", guestToken)
            .eq("is_active", true)
            .maybeSingle();
          if (data?.is_active) {
            isValidGuest = true;
          } else {
            // Expired/invalidated link — clear the cookie so user knows
            supabaseResponse.cookies.delete(GUEST_COOKIE_NAME);
          }
        } catch {
          // Treat as not-a-guest on lookup failure
        }
      }
    }
  }

  // Block dashboard if no auth AND not a guest
  if (!user && !isValidGuest && request.nextUrl.pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Block /dashboard/admin/* for guests (admin only)
  if (!user && isValidGuest && request.nextUrl.pathname.startsWith("/dashboard/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Security headers
  supabaseResponse.headers.set("X-Frame-Options", "DENY");
  supabaseResponse.headers.set("X-Content-Type-Options", "nosniff");
  supabaseResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  supabaseResponse.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  supabaseResponse.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );

  return supabaseResponse;
}
