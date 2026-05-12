

import { NextResponse } from 'next/server';
import { evaluateDealPreLLM } from '../../../../lib/intelligence/triage-engine';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const deals = body.deals || [];

    if (!Array.isArray(deals)) {
      return NextResponse.json({ error: "Invalid payload. 'deals' must be an array." }, { status: 400 });
    }

    console.log(`[Triage Engine] Processing batch of ${deals.length} deals...`);

    // Score all deals instantly (0 API cost)
    const scoredDeals = deals.map((deal: any) => {
      const triage = evaluateDealPreLLM({
        revenue_mm: deal.revenue_mm,
        sector: deal.sector,
        description: deal.description,
        company_name: deal.company_name
      });
      return { ...deal, triage };
    });

    // Sort the deals so the highest scores are at the top
    scoredDeals.sort((a: any, b: any) => b.triage.score - a.triage.score);

    // Count how many passed the threshold
    const pursueCount = scoredDeals.filter((d: any) => d.triage.decision === 'PURSUE').length;

    return NextResponse.json({
      success: true,
      total_processed: deals.length,
      recommended_for_ai: pursueCount,
      results: scoredDeals
    });

  } catch (error) {
    console.error("[Triage Error]", error);
    return NextResponse.json({ error: "Batch triage processing failed" }, { status: 500 });
  }
}
