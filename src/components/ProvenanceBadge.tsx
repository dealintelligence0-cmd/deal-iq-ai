"use client";

// src/components/ProvenanceBadge.tsx
//
// PHASE 7G — renders how THIS result was produced.
//
// The wording and the rules behind it live in @/lib/ui/provenance, which is pure and
// has no "use client", so the honesty guarantees are asserted against the strings
// themselves rather than against markup. This file is presentation only.

import { describeProvenance, type Provenance } from "@/lib/ui/provenance";

export { provenanceFrom, describeProvenance } from "@/lib/ui/provenance";
export type { Provenance } from "@/lib/ui/provenance";

const STYLES: Record<string, string> = {
  reused: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/20",
  norequest: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-400/20",
  cloud: "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20",
};

export default function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const described = describeProvenance(provenance);
  if (!provenance || !described) return null;

  return (
    <span
      title={described.title}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STYLES[provenance.kind]}`}
    >
      {described.label}
    </span>
  );
}
