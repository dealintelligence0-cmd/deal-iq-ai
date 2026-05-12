

import { NextResponse } from 'next/server';

// 1. Import your existing visual renderer
// (Update 'renderProposal' if you named the function differently in your file)
import { renderProposal } from '../../../../lib/proposal/visual-renderer';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // format could be 'pptx', 'pdf', etc.
    const { dealId, proposalData, format = 'pptx' } = body; 

    if (!dealId) {
      return NextResponse.json({ error: "Missing dealId" }, { status: 400 });
    }

    console.log(`[Export Engine] Generating ${format.toUpperCase()} for deal ${dealId}...`);

    // 2. Use your existing visual renderer to create the document
    const documentUrl = await renderProposal(proposalData, format);

    return NextResponse.json({ 
      success: true, 
      message: "Export generated successfully",
      downloadUrl: documentUrl 
    });

  } catch (error) {
    console.error("[Export Error]", error);
    return NextResponse.json({ error: "Document generation failed" }, { status: 500 });
  }
}
