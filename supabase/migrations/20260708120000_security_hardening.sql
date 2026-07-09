-- Security hardening pass (Supabase advisor remediation)
--
-- Context: every table/view is queried from the application exclusively via the
-- service-role ("admin") client, which bypasses RLS. None of the changes below
-- affect the app; they close direct-PostgREST access paths for anon/authenticated.

-- 1. CRITICAL: stop exposing the provider-key crypto helpers to public roles.
--    Code only ever calls these via service_role, so anon/authenticated must not
--    be able to hit /rest/v1/rpc/decrypt_key as a decryption oracle.
revoke execute on function public.encrypt_key(text)   from anon, authenticated;
revoke execute on function public.decrypt_key(bytea)  from anon, authenticated;

-- 2. Drop unused debug/introspection helpers (zero code references) that were
--    executable by anon/authenticated as SECURITY DEFINER.
drop function if exists public._check_extension_installed(text);
drop function if exists public._check_trigger_exists(text);
drop function if exists public.get_row_counts();

-- 3. Convert SECURITY DEFINER views to security_invoker so they no longer bypass
--    RLS when reached directly via PostgREST. The app reads them via service_role
--    (BYPASSRLS), so behaviour is unchanged for the app.
alter view public.advisor_leaderboard      set (security_invoker = on);
alter view public.advisor_sector_heatmap   set (security_invoker = on);
alter view public.advisor_whitespace_deals set (security_invoker = on);
alter view public.active_acquirers         set (security_invoker = on);
alter view public.signal_trends            set (security_invoker = on);

-- 4. Pin search_path on functions flagged with a mutable search_path. All
--    extensions (pg_trgm, vector) live in public, so public + pg_temp is
--    sufficient; extensions is included defensively.
alter function public.active_invite_module_access()                       set search_path = public, extensions, pg_temp;
alter function public.autolink_canonical_to_watchlist()                   set search_path = public, extensions, pg_temp;
alter function public.compute_mbb_scores(text, text, text, text, text, text, numeric, numeric, text)
                                                                          set search_path = public, extensions, pg_temp;
alter function public.enforce_single_active_invite()                      set search_path = public, extensions, pg_temp;
alter function public.enforce_single_default_per_tier()                   set search_path = public, extensions, pg_temp;
alter function public.ingestion_check_pg_trgm()                           set search_path = public, extensions, pg_temp;
alter function public.mirror_canonical_to_deals()                         set search_path = public, extensions, pg_temp;
alter function public.my_workspace_ids(uuid)                              set search_path = public, extensions, pg_temp;
alter function public.purge_user_data(uuid, text)                         set search_path = public, extensions, pg_temp;
alter function public.set_updated_at()                                    set search_path = public, extensions, pg_temp;
alter function public.sync_invite_link_on_module_add()                    set search_path = public, extensions, pg_temp;
alter function public.sync_invite_link_on_module_update()                 set search_path = public, extensions, pg_temp;
alter function public.system_admin_id()                                   set search_path = public, extensions, pg_temp;
alter function public.touch_deal_model_updated_at()                       set search_path = public, extensions, pg_temp;
alter function public.touch_updated_at()                                  set search_path = public, extensions, pg_temp;
alter function public.user_has_module(uuid, text)                         set search_path = public, extensions, pg_temp;
