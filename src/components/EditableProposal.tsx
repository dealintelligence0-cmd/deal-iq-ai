

"use client";

import { useState } from "react";
import { Edit3, RefreshCw, Save, X, Loader2, Check } from "lucide-react";
import {
  splitIntoSections,
  renderSectionBody,
  replaceSection,
  renderCitations,
  type ProposalSection,
} from "@/lib/proposal/visual-renderer";

type Props = {
  /** Full proposal markdown. */
  content: string;
  /** Called when the partner saves an edit or accepts a regen, with the new full markdown. */
  onContentChange: (newContent: string) => void;
  /** Optional citation block (rendered once below all sections). */
  citationsMd?: string;
  /** Deal context passed to the regen endpoint so the new section stays coherent. */
  dealContext: {
    deal_id?: string;
    buyer: string;
    target: string;
    sector: string;
    geography: string;
    deal_size: string;
  };
};

/**
 * EditableProposal renders a proposal markdown blob as a stack of independently
 * editable sections. Each section has two affordances:
 *
 *   1. ✎ Edit — opens a textarea on the section's markdown body. Save splices
 *      it back into the full document. No AI call.
 *
 *   2. ⟳ Regenerate — opens an instruction box. On submit, posts to
 *      /api/ai/proposal/regenerate-section with the deal context, the full
 *      document, the section heading, and the optional instructions. The
 *      response is a new section body that gets spliced in.
 *
 * Both affordances preserve the rest of the document untouched. The canonical
 * deal model coherence is enforced server-side by the regen route, which
 * injects the same dealModelToPromptBlock and comparablesBlock the original
 * proposal route uses.
 */
export default function EditableProposal({ content, onContentChange, citationsMd, dealContext }: Props) {
  const sections: ProposalSection[] = splitIntoSections(content);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [regenIdx, setRegenIdx] = useState<number | null>(null);
  const [editBuf, setEditBuf] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState<{ kind: "edit" | "regen"; idx: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<number | null>(null);

  function openEdit(idx: number) {
    setEditingIdx(idx);
    setEditBuf(sections[idx].body);
    setRegenIdx(null);
    setErr(null);
  }

  function openRegen(idx: number) {
    setRegenIdx(idx);
    setInstructions("");
    setEditingIdx(null);
    setErr(null);
  }

  function cancel() {
    setEditingIdx(null);
    setRegenIdx(null);
    setEditBuf("");
    setInstructions("");
    setErr(null);
  }

  function saveEdit(idx: number) {
    const heading = sections[idx].heading;
    const newFull = replaceSection(content, heading, editBuf);
    onContentChange(newFull);
    setRecent(idx);
    cancel();
    setTimeout(() => setRecent(null), 2000);
  }

  async function runRegen(idx: number) {
    const section = sections[idx];
    setBusy({ kind: "regen", idx });
    setErr(null);
    try {
      const res = await fetch("/api/ai/proposal/regenerate-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: dealContext.deal_id,
          buyer: dealContext.buyer,
          target: dealContext.target,
          sector: dealContext.sector,
          geography: dealContext.geography,
          deal_size: dealContext.deal_size,
          full_content: content,
          section_heading: section.heading,
          user_instructions: instructions || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setErr(data.error ?? "Regeneration failed");
      } else {
        onContentChange(data.full_content_updated as string);
        setRecent(idx);
        cancel();
        setTimeout(() => setRecent(null), 2000);
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  }

  if (sections.length === 0) {
    return (
      <article
        className="max-w-none"
        dangerouslySetInnerHTML={{ __html: content + (citationsMd ? renderCitations(citationsMd) : "") }}
      />
    );
  }

  return (
    <div className="space-y-1">
      {sections.map((section, idx) => {
        const isEditing = editingIdx === idx;
        const isRegen = regenIdx === idx;
        const isBusy = busy?.idx === idx;
        const isRecent = recent === idx;
        const sectionHtml = renderSectionBody(section.heading, section.body);

        return (
          <div
            key={`${section.heading}-${idx}`}
            className={`group relative rounded-lg transition-colors ${
              isEditing || isRegen ? "bg-indigo-50/40 ring-1 ring-indigo-200" : "hover:bg-slate-50/60"
            } ${isRecent ? "ring-2 ring-emerald-300 bg-emerald-50/40" : ""}`}
          >
            {/* Section action toolbar — sits in the upper-right corner, fades in on hover */}
            {!isEditing && !isRegen && (
              <div className="pointer-events-none absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                <button
                  onClick={() => openEdit(idx)}
                  className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  title="Edit this section manually"
                >
                  <Edit3 className="h-3 w-3" /> Edit
                </button>
                <button
                  onClick={() => openRegen(idx)}
                  className="flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-2 py-1 text-[10px] font-medium text-indigo-700 shadow-sm hover:bg-indigo-50"
                  title="Regenerate this section with AI"
                >
                  <RefreshCw className="h-3 w-3" /> Regenerate
                </button>
              </div>
            )}

            {/* Inline manual editor */}
            {isEditing ? (
              <div className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-indigo-700">
                    Editing: {section.heading}
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={cancel}
                      className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
                    >
                      <X className="h-3 w-3" /> Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(idx)}
                      className="flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700"
                    >
                      <Save className="h-3 w-3" /> Save
                    </button>
                  </div>
                </div>
                <textarea
                  value={editBuf}
                  onChange={(e) => setEditBuf(e.target.value)}
                  rows={Math.max(8, Math.min(30, editBuf.split("\n").length + 2))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-[12px] leading-relaxed text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  Markdown. Tables, bullets, bold supported. Saved locally — does not call AI.
                </p>
              </div>
            ) : isRegen ? (
              <div className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-indigo-700">
                    Regenerating: {section.heading}
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={cancel}
                      disabled={isBusy}
                      className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <X className="h-3 w-3" /> Cancel
                    </button>
                    <button
                      onClick={() => runRegen(idx)}
                      disabled={isBusy}
                      className="flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      {isBusy ? "Generating..." : "Run"}
                    </button>
                  </div>
                </div>
                <label className="block text-[11px] text-slate-600">
                  Optional instructions for the AI (e.g., "Add more downside risks", "Cut by 50%", "Add comparable from Pfizer/Seagen"):
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Leave blank for a cleaner, more numerically-grounded version of the current section."
                  rows={3}
                  disabled={isBusy}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] leading-relaxed text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
                />
                {err && <p className="mt-2 text-[11px] text-red-600">{err}</p>}
                <p className="mt-1 text-[10px] text-slate-400">
                  Calls the AI with the canonical deal model + comparables block. Only this section changes; canonical numbers stay locked.
                </p>
              </div>
            ) : (
              <div dangerouslySetInnerHTML={{ __html: sectionHtml }} />
            )}
          </div>
        );
      })}

      {citationsMd && (
        <div dangerouslySetInnerHTML={{ __html: renderCitations(citationsMd) }} />
      )}

      {recent !== null && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 shadow-lg">
          <Check className="h-3 w-3" /> Section updated
        </div>
      )}
    </div>
  );
}
