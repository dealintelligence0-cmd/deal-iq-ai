

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrSeed } from "@/lib/intelligence/deal-model";
import { pickComparablesForModel } from "@/lib/intelligence/comparables";

/**
 * POST /api/deals/seed-model
 *
 * Body: { deal_id: string }
 *
 * Triggered by DealModelCard on mount when no row exists in `deal_models`
 * for the given deal_id. Reads the deal row from `deals` and seeds the
 * canonical model from sector benchmarks. Also pre-fills the
 * comparables_chosen field so the very first proposal generation has
 * verified comps available — no "generate something to seed" friction.
 *
 * Idempotent: if a model already exists, returns it unchanged.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { deal_id?: string };
  if (!body.deal_id) {
    return NextResponse.json({ error: "deal_id is required" }, { status: 400 });
  }

  // Pull the deal so we can derive currency/sector/geography from it.
  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .select("id, buyer, target, sector, country, value_raw, normalized_value_usd")
    .eq("id", body.deal_id)
    .maybeSingle();

  if (dealErr || !deal) {
    return NextResponse.json({ error: "Deal not found or not accessible" }, { status: 404 });
  }

  // getOrSeed is idempotent — returns existing row if already seeded.
  const dealSizeInput = deal.value_raw?.toString()
    ?? (deal.normalized_value_usd ? `$${deal.normalized_value_usd}` : "");

  const model = await getOrSeed(supabase, {
    deal_id: deal.id,
    user_id: user.id,
    buyer: deal.buyer ?? "",
    target: deal.target ?? "",
    sector: deal.sector ?? "",
    geography: deal.country ?? "",
    deal_size_input: dealSizeInput,
  });

  // If this was a fresh seed (no comparables yet), pre-populate the comp set
  // so PMI / synergy / TSA see the same deals even before the first proposal runs.
  if (!model.comparables_chosen || model.comparables_chosen.length === 0) {
    const picked = pickComparablesForModel(deal.sector ?? "", deal.country ?? "", 5);
    if (picked.length > 0) {
      const { data: updated } = await supabase
        .from("deal_models")
        .update({
          comparables_chosen: picked,
          written_by: { ...(model.written_by ?? {}), comparables_chosen: "seed-route" },
        })
        .eq("deal_id", deal.id)
        .select("*")
        .single();
      if (updated) return NextResponse.json({ model: updated, seeded: true });
    }
  }

  return NextResponse.json({ model, seeded: model.written_by?.seed === "auto-from-benchmarks" });
}
