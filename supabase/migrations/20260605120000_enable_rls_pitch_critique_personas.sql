-- Enable Row-Level Security on public.pitch_critique_personas.
--
-- This is a read-only reference table holding the critique persona definitions
-- (display_name, system_prompt, sort_order). The app reads it through the
-- RLS-respecting authenticated client in src/lib/critique/critique.ts.
--
-- Without RLS the table is fully exposed to the anon/authenticated roles, so
-- anyone with the project's anon key could read, edit, or delete the persona
-- prompts. We mirror the policy pattern already used by the other reference
-- tables (module_catalog, advisor_registry): public read, admin-only write.

ALTER TABLE public.pitch_critique_personas ENABLE ROW LEVEL SECURITY;

-- Anyone may read the personas (matches module_catalog / advisor_registry).
CREATE POLICY p_pitch_critique_personas_read
  ON public.pitch_critique_personas
  FOR SELECT
  USING (true);

-- Only admins may insert/update/delete persona definitions.
CREATE POLICY p_pitch_critique_personas_admin_write
  ON public.pitch_critique_personas
  FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
