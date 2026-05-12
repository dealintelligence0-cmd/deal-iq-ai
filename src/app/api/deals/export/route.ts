

import { NextResponse } from 'next/server';
import { renderVisualProposal, renderCitations } from '@/lib/proposal/visual-renderer';

// POST /api/deals/export
// Body: { dealId: string, proposalData: { content: string, citations?: string }, format?: "html" }
//
// Renders a proposal's markdown content into branded HTML using the existing
// visual renderer. PPTX/PDF formats are not yet wired (the architectural
// roadmap lists pptxgenjs export as Sprint 4); for now we return HTML which
// the client can print-to-PDF via the existing Printer button on the proposal
// page.
export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      dealId?: string;
      proposalData?: { content?: string; citations?: string };
      format?: 'html' | 'pptx' | 'pdf';
    };
    const { dealId, proposalData, format = 'html' } = body;

    if (!dealId) {
      return NextResponse.json({ error: 'Missing dealId' }, { status: 400 });
    }
    if (!proposalData?.content) {
      return NextResponse.json({ error: 'Missing proposalData.content' }, { status: 400 });
    }

    if (format !== 'html') {
      return NextResponse.json(
        { error: `Format "${format}" not yet supported. Use "html" and print-to-PDF from the client.` },
        { status: 400 },
      );
    }

    const html = renderVisualProposal(proposalData.content);
    const citationsHtml = proposalData.citations ? renderCitations(proposalData.citations) : '';

    return NextResponse.json({
      success: true,
      format: 'html',
      html: html + citationsHtml,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Document generation failed' },
      { status: 500 },
    );
  }
}
