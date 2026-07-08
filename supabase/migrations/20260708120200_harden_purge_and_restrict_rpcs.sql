-- Follow-up hardening.

-- 1. IDOR fix: purge_user_data is SECURITY DEFINER and deletes rows filtered by
--    the caller-supplied p_uid without verifying ownership, so any signed-in
--    user could purge another user's data by passing their UUID. Reject any
--    attempt to purge a UID other than the caller's. auth.uid() is NULL for the
--    service-role context, which is left able to purge arbitrary users.
create or replace function public.purge_user_data(p_uid uuid, p_scope text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
DECLARE v_deleted jsonb := '{}'::jsonb; v_count int;
BEGIN
  IF auth.uid() IS NOT NULL AND p_uid <> auth.uid() THEN
    RAISE EXCEPTION 'not authorized to purge another user''s data';
  END IF;

  IF p_scope IN ('deals', 'all') THEN
    DELETE FROM deals WHERE created_by = p_uid;                       GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('deals', v_count);
    DELETE FROM resolution_tasks WHERE created_by = p_uid;            GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('resolution_tasks', v_count);
    DELETE FROM digest_records   WHERE created_by = p_uid;            GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('digest_records', v_count);
    DELETE FROM canonical_deals  WHERE created_by = p_uid;            GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('canonical_deals', v_count);
    DELETE FROM raw_feed_records WHERE created_by = p_uid;            GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('raw_feed_records', v_count);
    DELETE FROM import_batches   WHERE created_by = p_uid;            GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('import_batches', v_count);
  END IF;
  IF p_scope IN ('proposals', 'all') THEN
    DELETE FROM proposals  WHERE created_by = p_uid;                  GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('proposals', v_count);
    DELETE FROM ai_outputs WHERE created_by = p_uid;                  GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('ai_outputs', v_count);
  END IF;
  IF p_scope IN ('uploads', 'all') THEN
    DELETE FROM uploads WHERE created_by = p_uid;                     GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('uploads', v_count);
  END IF;
  IF p_scope = 'all' THEN
    DELETE FROM correction_examples WHERE created_by = p_uid;         GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('correction_examples', v_count);
  END IF;
  RETURN v_deleted;
END $function$;

-- 2. Narrow user-facing RPCs to signed-in users only. A blanket PUBLIC grant
--    cannot be trimmed by revoking anon alone, so revoke PUBLIC + anon and
--    re-grant authenticated explicitly. These enforce auth.uid() internally.
revoke execute on function public.save_ai_key(text, text)     from public, anon;
grant  execute on function public.save_ai_key(text, text)     to authenticated;
revoke execute on function public.delete_ai_key(text)         from public, anon;
grant  execute on function public.delete_ai_key(text)         to authenticated;
revoke execute on function public.ai_keys_status()            from public, anon;
grant  execute on function public.ai_keys_status()            to authenticated;
revoke execute on function public.save_tavily_key(text)       from public, anon;
grant  execute on function public.save_tavily_key(text)       to authenticated;
revoke execute on function public.purge_user_data(uuid, text) from public, anon;
grant  execute on function public.purge_user_data(uuid, text) to authenticated;
revoke execute on function public.my_workspace_ids(uuid)      from public, anon;
grant  execute on function public.my_workspace_ids(uuid)      to authenticated;
revoke execute on function public.user_has_module(uuid, text) from public, anon;
grant  execute on function public.user_has_module(uuid, text) to authenticated;
