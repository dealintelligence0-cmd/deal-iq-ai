-- Follow-up to 20260708120000_security_hardening.
--
-- Postgres/Supabase grant EXECUTE on public functions to PUBLIC (and to anon /
-- authenticated by default), so revoking from anon/authenticated alone still
-- leaves the PUBLIC grant in place. These functions are only ever invoked from
-- the app via the service-role client (which is unaffected by these revokes) or
-- fire as triggers, so removing public execution closes their direct
-- /rest/v1/rpc exposure without changing app behaviour.

-- Admin-only crypto + provisioning, the auth trigger, and unused key helpers:
-- no legitimate anon/authenticated caller exists.
revoke execute on function public.encrypt_key(text)                              from public, anon, authenticated;
revoke execute on function public.decrypt_key(bytea)                             from public, anon, authenticated;
revoke execute on function public.insert_provider_key(uuid, text, text, text, text, boolean, boolean, boolean)
                                                                                 from public, anon, authenticated;
revoke execute on function public.handle_new_user()                              from public, anon, authenticated;
revoke execute on function public.has_ai_key(text)                               from public, anon, authenticated;
revoke execute on function public.has_tavily_key()                              from public, anon, authenticated;

-- User-facing key management + internal helpers: signed-in users call these
-- (they enforce auth.uid() internally), but the anonymous role never should.
revoke execute on function public.save_ai_key(text, text)     from anon;
revoke execute on function public.delete_ai_key(text)         from anon;
revoke execute on function public.ai_keys_status()            from anon;
revoke execute on function public.save_tavily_key(text)       from anon;
revoke execute on function public.purge_user_data(uuid, text) from anon;
revoke execute on function public.my_workspace_ids(uuid)      from anon;
revoke execute on function public.user_has_module(uuid, text) from anon;
