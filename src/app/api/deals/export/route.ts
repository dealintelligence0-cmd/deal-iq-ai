

import { NextResponse } from 'next/server';
import { renderVisualProposal, renderCitations } from '@/lib/proposal/visual-renderer';
import { buildSimplePdf } from '@/lib/server/pdf';

// POST /api/deals/export
// Body: { dealId?: string, proposalData: { content: string, citations?: string, title?: string }, format?: "html" | "pdf" }
//
// Renders a proposal's markdown content into branded HTML or a server-generated
// lightweight PDF. The PDF path is intentionally dependency-light for serverless
// deployments and preserves the full generated text across as many pages as needed.
export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      dealId?: string;
      proposalData?: { content?: string; citations?: string; title?: string };
      format?: 'html' | 'pptx' | 'pdf';
    };
    const { dealId, proposalData, format = 'html' } = body;

    if (!proposalData?.content) {
      return NextResponse.json({ error: 'Missing proposalData.content' }, { status: 400 });
    }

    if (format === 'pdf') {
      const pdf = buildSimplePdf(
        `${proposalData.content}${proposalData.citations ? `\n\n## Sources\n${proposalData.citations}` : ''}`,
        proposalData.title || `Deal IQ Export${dealId ? ` · ${dealId}` : ''}`,
      );
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="deal-iq-export-${new Date().toISOString().slice(0, 10)}.pdf"`,
        },
      });
    }

    if (format !== 'html') {
      return NextResponse.json({ error: `Format "${format}" not supported.` }, { status: 400 });
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
