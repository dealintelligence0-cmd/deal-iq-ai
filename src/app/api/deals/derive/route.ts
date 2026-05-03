

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveFields } from "@/lib/derive-fields";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: rows, error } = await admin.from("deals").select("*").eq("user_id", user.id).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;
  for (const r of rows ?? []) {
    const d = deriveFields(r as unknown as Record<string, unknown>);
    const { error: upErr } = await admin.from("deals").update({
      buyer: d.buyer ?? r.buyer,
      target: d.target ?? r.target,
      sector: d.sector ?? r.sector,
      country: d.country ?? r.country,
      geographies_involved: d.geographies_involved,
      india_flow: d.india_flow,
      deal_value_inr_range: d.deal_value_inr_range,
      deal_value_usd_range: d.deal_value_usd_range,
      deal_type: d.deal_type ?? r.deal_type,
      deal_summary: d.deal_summary,
      stake_percent: d.stake_percent ?? r.stake_percent,
      stake_status: d.stake_status,
      priority_score: d.priority_score,
      advisory_score: d.advisory_score,
      risk_score: d.risk_score,
      priority_reason: d.priority_reason,
      advisory_reason: d.advisory_reason,
      risk_reason: d.risk_reason,
    }).eq("id", r.id);
    if (!upErr) updated++;
  }

  return NextResponse.json({ ok: true, updated, total: rows?.length ?? 0 });
}
