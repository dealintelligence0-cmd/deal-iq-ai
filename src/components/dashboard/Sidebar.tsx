

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BrainCircuit, LayoutDashboard, CloudUpload, GitMerge,
  AlertTriangle, Briefcase, FileText, Settings, Sparkles, Activity, Network,
  Download, Shield, BookOpen, Layers, TrendingUp, ArrowLeftRight, Lightbulb, Target, ClipboardCheck, Users2, ChevronsUpDown, Check, ScrollText,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

// Each nav item maps to a module_key from the catalogue; null = always visible (e.g. Dashboard home, Help)
type NavItem = { label: string; href: string; icon: any; module: string | null; adminOnly?: boolean };

const NAV_GROUPS: Array<{ label?: string; items: NavItem[] }> = [
  { items: [
    { label: "Executive Dashboard", href: "/dashboard", icon: LayoutDashboard, module: null },
    { label: "Executive Brief", href: "/dashboard/brief", icon: ScrollText, module: null },
  ] },
  {
    label: "Deal Data", items: [
      { label: "Import Deals",   href: "/dashboard/uploads",          icon: CloudUpload,    module: "import" },
      { label: "Deal Pipeline",  href: "/dashboard/deals",            icon: Briefcase,      module: "deals_data" },
      { label: "Prioritization", href: "/dashboard/prioritization",   icon: Target,         module: "prioritization" },
      { label: "Triage Queue",   href: "/dashboard/resolution-tasks", icon: ClipboardCheck, module: "triage" },
    ],
  },
  {
    label: "Intelligence", items: [
      { label: "Themes Radar",    href: "/dashboard/themes",  icon: Sparkles, module: "themes" },
      { label: "Signal Intel Hub", href: "/dashboard/signals", icon: Activity, module: "signals" },
      { label: "Bolt-on Engine",  href: "/dashboard/boltons", icon: Target,   module: "boltons" },
      { label: "Advisor Map",     href: "/dashboard/advisors", icon: Network, module: "advisors" },
      { label: "Account Narratives", href: "/dashboard/narratives", icon: Lightbulb, module: "narratives" },
    ],
  },
  {
    label: "Advisory Intelligence", items: [
      { label: "M&A Proposals",  href: "/dashboard/proposals", icon: FileText,        module: "proposals" },
      { label: "PMI Playbook Studio", href: "/dashboard/pmi",       icon: Layers,          module: "pmi" },
      { label: "Synergy Quantification", href: "/dashboard/synergy",   icon: TrendingUp,      module: "synergy" },
      { label: "TSA Generator",  href: "/dashboard/tsa",       icon: ArrowLeftRight,  module: "tsa" },
    ],
  },
  {
    label: "Admin", items: [
      { label: "User Settings", href: "/dashboard/admin/users", icon: Shield, module: null, adminOnly: true },
      { label: "Workspaces",    href: "/dashboard/admin/workspaces", icon: Users2, module: null, adminOnly: true },
    ],
  },
  {
    label: "System", items: [
      { label: "Exports",  href: "/dashboard/exports",  icon: Download, module: "exports" },
      { label: "Help",     href: "/dashboard/help",     icon: BookOpen, module: null },
      { label: "Settings", href: "/dashboard/settings", icon: Settings, module: "settings" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [perms, setPerms] = useState<Record<string, boolean> | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string; is_personal: boolean; role: string; member_count: number }>>([]);
  const [activeWs, setActiveWs] = useState<{ id: string | null; name: string | null; isPersonal: boolean } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me/modules").then((x) => x.json());
        setPerms(r.modules ?? {});
        setIsAdmin(Boolean(r.is_admin));
        setIsGuest(Boolean(r.is_guest));
      } catch {
        setPerms({});
      }
    })();
  }, []);

  useEffect(() => {
    // Only load workspaces if user is authed (not guest)
    if (isGuest) return;
    (async () => {
      try {
        const r = await fetch("/api/workspaces").then((x) => x.json());
        if (r.workspaces) setWorkspaces(r.workspaces);
        if (r.active) setActiveWs({
          id: r.active.workspaceId,
          name: r.active.workspaceName,
          isPersonal: r.active.isPersonal,
        });
      } catch { /* non-fatal */ }
    })();
  }, [isGuest, isAdmin]);

  async function switchWorkspace(id: string) {
    try {
      const r = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: id }),
      });
      if (r.ok) {
        setPickerOpen(false);
        window.location.reload(); // simplest way to refresh all per-workspace data
      }
    } catch { /* non-fatal */ }
  }

  // Filter items by permission
  const visibleGroups = NAV_GROUPS
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => {
        if (i.adminOnly && !isAdmin) return false;
        if (!i.module) return true;
        if (perms === null) return true;  // optimistic show while loading
        return perms[i.module] === true;
      }),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-[#0f0e1a] lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-white/5 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
          <BrainCircuit className="h-5 w-5 text-white" />
        </div>
        <span className="flex-1 text-base font-semibold text-white">Deal IQ AI</span>
        {isAdmin && <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">Admin</span>}
        {isGuest && <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">Guest</span>}
        <ThemeToggle />
      </div>

      {/* Workspace picker — visible for authed (non-guest) users */}
      {!isGuest && activeWs && workspaces.length > 0 && (
        <div className="border-b border-white/5 px-3 py-2 relative">
          <button onClick={() => setPickerOpen((o) => !o)}
                  className="flex w-full items-center justify-between gap-2 rounded-md bg-white/5 px-2.5 py-1.5 text-left text-[11px] text-white/80 hover:bg-white/10">
            <div className="flex min-w-0 items-center gap-1.5">
              <Users2 className="h-3 w-3 flex-shrink-0 text-white/50" />
              <span className="truncate font-medium">{activeWs.name}</span>
              {activeWs.isPersonal && <span className="ml-1 rounded bg-slate-700 px-1 py-0.5 text-[8.5px] font-bold uppercase">Personal</span>}
            </div>
            <ChevronsUpDown className="h-3 w-3 flex-shrink-0 text-white/40" />
          </button>
          {pickerOpen && (
            <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-md border border-white/10 bg-[#1a1929] shadow-xl">
              {workspaces.map((w) => (
                <button key={w.id} onClick={() => switchWorkspace(w.id)}
                        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] text-white/80 hover:bg-white/10">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{w.name}</span>
                    {w.is_personal && <span className="rounded bg-slate-700 px-1 py-0.5 text-[8.5px] font-bold uppercase">Personal</span>}
                    {w.member_count > 1 && <span className="text-white/40">· {w.member_count}</span>}
                  </div>
                  {activeWs.id === w.id && <Check className="h-3 w-3 flex-shrink-0 text-emerald-400" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {visibleGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-4" : ""}>
            {group.label && (
              <p className="mb-1 mt-1 px-2 text-[9px] font-bold uppercase tracking-widest text-white/25">{group.label}</p>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const isAdvisory = group.label === "Advisory Intelligence";
              const isAdminGroup = group.label === "Admin";
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                    active ? "bg-white/10 text-white font-medium"
                    : isAdminGroup ? "text-amber-300/70 hover:bg-amber-500/10 hover:text-amber-200"
                    : isAdvisory ? "text-indigo-300/60 hover:bg-indigo-500/10 hover:text-indigo-200"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70"
                  }`}>
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate text-[13px]">{item.label}</span>
                  {isAdvisory && !active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400/40 flex-shrink-0" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
