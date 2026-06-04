-- Remove legacy unused table.
--
-- workspace_focus was an abandoned "workspace focus state" table:
--   * 0 rows in production
--   * 0 references anywhere in the application code
--   * no incoming foreign keys, no dependent views
-- Its role (active deal / pinned themes / target overrides) is handled by other
-- live tables, so it is dead weight. Dropped during the repo cleanup pass.
DROP TABLE IF EXISTS public.workspace_focus CASCADE;
