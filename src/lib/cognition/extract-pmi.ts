

/**
 * PMI cognition extractor (Phase 3).
 *
 * After a PMI playbook is created/refreshed, this extracts 2 canonical numbers
 * worth propagating to the cognition layer:
 *   - pmi.active_workstreams (count of distinct workstreams with tasks)
 *   - pmi.total_weeks (playbook duration)
 *
 * Both come straight from existing pmi_playbooks / pmi_tasks rows — zero AI cost.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type PmiSidecar = {
  total_weeks: number | null;
  active_workstreams: number | null;
  workstreams: string[];
};

export async function extractPmiSidecar(playbookId: string): Promise<PmiSidecar> {
  const admin = createAdminClient();
  const { data: pb } = await admin
    .from("pmi_playbooks")
    .select("total_weeks")
    .eq("id", playbookId)
    .maybeSingle();

  const { data: tasks } = await admin
    .from("pmi_tasks")
    .select("workstream")
    .eq("playbook_id", playbookId);

  const workstreams = Array.from(new Set((tasks ?? []).map((t: any) => t.workstream).filter(Boolean)));
  return {
    total_weeks: pb?.total_weeks ?? null,
    active_workstreams: workstreams.length || null,
    workstreams,
  };
}
