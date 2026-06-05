"use client";

/**
 * PageHeader — the single, canonical banner used at the top of every dashboard
 * page. Standardises the gradient banner, title typography, icon placement and
 * the right-aligned actions slot (History, exports, etc.) so every screen looks
 * and behaves identically.
 *
 * Usage:
 *   <PageHeader
 *     icon={ArrowLeftRight}
 *     title="TSA Generator"
 *     subtitle="AI-powered Transitional Service Agreement"
 *     actions={<button>…</button>}
 *   />
 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export default function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  className = "",
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`page-header no-print ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
            {Icon ? <Icon className="h-5 w-5 shrink-0 text-indigo-400" /> : null}
            <span className="truncate">{title}</span>
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-white/60">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/**
 * Shared styles for action buttons living in the PageHeader actions slot, so
 * every banner's controls look identical across the platform.
 *   headerActionBtn  — secondary (translucent white): Refresh, History, …
 *   headerPrimaryBtn — primary (solid white): the main CTA (Export, Run, …)
 *   headerDangerBtn  — destructive (red): Delete, …
 */
export const headerActionBtn =
  "flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-white/20 disabled:opacity-50";

export const headerPrimaryBtn =
  "flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-[11px] font-semibold text-indigo-700 transition hover:bg-white/90 disabled:opacity-50";

export const headerDangerBtn =
  "flex items-center gap-1.5 rounded-md bg-red-500/90 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-red-500 disabled:opacity-50";
