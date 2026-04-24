import type { SupabaseClient } from "@supabase/supabase-js";

/** Server-side rate limit check. Returns true if allowed. */
export async function checkRateLimit(
  supabase: SupabaseClient,
  endpoint: string,
  maxRequests = 60,
  windowSeconds = 60
): Promise<boolean> {
  const { data } = await supabase.rpc("check_rate_limit", {
    p_endpoint: endpoint,
    p_max: maxRequests,
    p_window_seconds: windowSeconds,
  });
  return Boolean(data);
}

/** Fire-and-forget audit log. Safe to ignore errors. */
export async function logActivity(
  supabase: SupabaseClient,
  action: string,
  entity?: string,
  entityId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.rpc("log_activity", {
      p_action: action,
      p_entity: entity ?? null,
      p_entity_id: entityId ?? null,
      p_metadata: metadata ?? null,
    });
  } catch {
    /* ignore */
  }
}

/** Basic input sanitizer — strips null bytes, caps length. */
export function sanitizeString(input: unknown, maxLen = 5000): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/\0/g, "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

/** Email validator. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/** Numeric validator with range. */
export function sanitizeNumber(input: unknown, min?: number, max?: number): number | null {
  const n = Number(input);
  if (!Number.isFinite(n)) return null;
  if (min !== undefined && n < min) return null;
  if (max !== undefined && n > max) return null;
  return n;
}
