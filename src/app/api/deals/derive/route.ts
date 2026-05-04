

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveFields } from "@/lib/derive-fields";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: rows, error } = await admin.from("deals").select("*").limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;
  let failed = 0;
  for (const r of rows ?? []) {
    const d = deriveFields(r as unknown as Record<string, unknown>);
    const { error: upErr } = await admin.from("deals").update({
      geographies_involved: d.geographies_involved,
      india_flow: d.india_flow,
      deal_value_inr_range: d.deal_value_inr_range,
      deal_value_usd_range: d.deal_value_usd_range,
      deal_summary: d.deal_summary,
      stake_status: d.stake_status,
      priority_score: d.priority_score,
      advisory_score: d.advisory_score,
      risk_score: d.risk_score,
      priority_reason: d.priority_reason,
      advisory_reason: d.advisory_reason,
      risk_reason: d.risk_reason,
      deal_takeaway: d.deal_takeaway,
      targeting_recommendation: d.targeting_recommendation,
      targeting_reason: d.targeting_reason,
      confidence_level: d.confidence_level,
      insight_sections: d.insight_sections,
      advisor_signal: d.advisor_signal,
      time_sensitivity: d.time_sensitivity,
      why_not: d.why_not,
      action_verb: d.action_verb,
    }).eq("id", r.id);
    if (upErr) { failed++; console.error("Derive failed", r.id, upErr.message); }
    else updated++;
  }
  return NextResponse.json({ ok: true, updated, failed, total: rows?.length ?? 0 });
}
