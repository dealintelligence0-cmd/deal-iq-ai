# Supabase Review — Tables & Security (2026-07-08)

Project: `deal-iq-ai` (`dqffgolunjrswamvnsip`).

## Table cleanup

All **51 tables + 5 views** were cross-referenced against `src/`. **Every one is
actively referenced** — including empty tables (`uploads`, `exceptions`,
`company_filings`, `executive_signals`, `deal_advisors`, `activity_log`) that back
live features not yet populated, and tables reached only via RPC (`rate_limits` →
`check_rate_limit`, `activity_log` → `log_activity`).

**Conclusion: no orphaned tables to drop.** Dropping any would break the app.

## Security fixes applied

Migrations: `20260708120000_security_hardening.sql`,
`20260708120100_revoke_public_execute.sql`,
`20260708120200_harden_purge_and_restrict_rpcs.sql`.

All app data access uses the service-role client, which bypasses RLS/grants, so
these changes do not affect application behaviour.

| Severity | Issue | Fix |
|----------|-------|-----|
| 🔴 Critical | `decrypt_key`/`encrypt_key` executable by `anon`/`authenticated` — decryption oracle for provider API keys | Revoked from `public`, `anon`, `authenticated` (service-role only) |
| 🔴 Critical | `purge_user_data(p_uid,…)` SECURITY DEFINER deletes by caller-supplied UID with no ownership check — destructive IDOR | Rejects `p_uid <> auth.uid()`; removed from `anon` |
| 🔴 Error | 5 SECURITY DEFINER views bypass RLS (cross-tenant leak via PostgREST) | `security_invoker = on` on all 5 |
| 🟠 Warn | `insert_provider_key`, `handle_new_user`, `has_ai_key`, `has_tavily_key` publicly executable | Revoked from all public roles |
| 🟠 Warn | Debug helpers `_check_extension_installed`, `_check_trigger_exists`, `get_row_counts` (unused) | Dropped |
| 🟠 Warn | 18 functions with mutable `search_path` | Pinned to `public, extensions, pg_temp` |
| 🟠 Warn | Key-mgmt RPCs (`save_ai_key`, `delete_ai_key`, `ai_keys_status`, `save_tavily_key`) reachable by `anon` | Restricted to `authenticated` |

## Remaining items (accepted / require dashboard access)

- **SECURITY DEFINER RPCs still callable by signed-in users** (`is_admin`,
  `system_admin_id`, `check_rate_limit`, `log_activity`, `save_ai_key`, etc.) —
  this is the intended Supabase pattern; each enforces `auth.uid()` internally or
  backs an RLS policy. Advisory only.
- **`correction_examples` shared RLS policy** (`p_corrections_shared`, `USING true`)
  — few-shot corrections are shared across users by design. Left as-is; tighten to
  `created_by = auth.uid()` if cross-tenant sharing is not intended.
- **`rate_limits` RLS-enabled/no-policy** (INFO) — secure by design: deny-all to
  clients, reachable only via the `check_rate_limit` definer function.
- **Dashboard-only:** enable Auth leaked-password protection; move `pg_trgm` and
  `vector` extensions out of the `public` schema.
