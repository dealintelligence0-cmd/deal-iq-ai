

// Background Processing Queue Receiver
// Powered by Upstash QStash. This prevents Vercel 10-second timeout crashes.

import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { runEnterpriseProposalPipeline } from '../../../../lib/proposal/enterprise-pipeline';

// This function processes the heavy AI workload in the background
async function handler(request: Request) {
  try {
    const body = await request.json();
    const { dealId, dealData } = body;

    if (!dealId) {
      return NextResponse.json({ error: "Missing dealId" }, { status: 400 });
    }

    console.log(`[Background Queue] Processing deal ${dealId} in the background...`);

    // Run the heavy multi-agent pipeline
    const result = await runEnterpriseProposalPipeline(dealId, dealData);

    // TODO: Save the `result` to your Supabase database here so the frontend can display it
    
    return NextResponse.json({ success: true, status: 'processed', result });
  } catch (error) {
    console.error("[Queue Error]", error);
    return NextResponse.json({ error: "Background processing failed" }, { status: 500 });
  }
}

// Security: Ensure only Upstash QStash can trigger this background route
export const POST = verifySignatureAppRouter(handler);
