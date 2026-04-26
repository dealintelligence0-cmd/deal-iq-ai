"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BrainCircuit, LayoutDashboard, CloudUpload, GitMerge,
  AlertTriangle, Briefcase, FileText, Settings, Sparkles,
  Download, Shield, BookOpen, Layers, TrendingUp, ArrowLeftRight, Lightbulb,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const NAV_GROUPS = [
  { items: [{ label: "Executive Dashboard", href: "/dashboard", icon: LayoutDashboard }] },
  {
    label: "Deal Data", items: [
      { label: "Import Deals",    href: "/dashboard/uploads",    icon: CloudUpload },
      { label: "Field Mapping",   href: "/dashboard/mapping",    icon: GitMerge },
      { label: "Deal Pipeline",   href: "/dashboard/deals",      icon: Briefcase },
      { label: "Data Quality",    href: "/dashboard/exceptions", icon: AlertTriangle },
      { label: "AI Insights",     href: "/dashboard/insights",   icon: Lightbulb },
    ],
  },
  {
    label: "Advisory Intelligence", items: [
      { label: "M&A Proposals",  href: "/dashboard/proposals", icon: FileText },
      { label: "PMI Planner",    href: "/dashboard/pmi",       icon: Layers },
      { label: "Synergy Engine", href: "/dashboard/synergy",   icon: TrendingUp },
      { label: "TSA Generator",  href: "/dashboard/tsa",       icon: ArrowLeftRight },
    ],
  },
  {
    label: "System", items: [
      { label: "Exports",      href: "/dashboard/exports",  icon: Download },
      { label: "Activity Log", href: "/dashboard/activity", icon: Shield },
      { label: "Help",         href: "/dashboard/help",     icon: BookOpen },
      { label: "Settings",     href: "/dashboard/settings", icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-[#0f0e1a] lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-white/5 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
          <BrainCircuit className="h-5 w-5 text-white" />
        </div>
        <span className="flex-1 text-base font-semibold text-white">Deal IQ AI</span>
        <AdminBadge />
        <ThemeToggle />
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-4" : ""}>
            {group.label && (
              <p className="mb-1 mt-1 px-2 text-[9px] font-bold uppercase tracking-widest text-white/25">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const isAdvisory = group.label === "Advisory Intelligence";
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                    active ? "bg-white/10 text-white font-medium"
                    : isAdvisory ? "text-indigo-300/60 hover:bg-indigo-500/10 hover:text-indigo-200"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70"
                  }`}>
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate text-[13px]">{item.label}</span>
                  {isAdvisory && !active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400/40 flex-shrink-0" />}
                  {item.label === "AI Insights" && (
                    <Sparkles className="ml-auto h-3 w-3 flex-shrink-0 text-indigo-400" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 p-4">
        <div className="rounded-lg bg-gradient-to-br from-indigo-600/20 to-purple-600/20 p-4 ring-1 ring-indigo-500/20">
          <p className="text-xs font-medium text-white">Upgrade to Pro</p>
          <p className="mt-1 text-xs text-white/60">Unlock unlimited deals and AI proposals.</p>
          <button className="mt-3 w-full rounded-md bg-indigo-500 py-1.5 text-xs font-medium text-white hover:bg-indigo-400">
            Upgrade
          </button>
        </div>
      </div>
    </aside>
  );
}

function AdminBadge() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data } = await sb.rpc("is_admin");
      setIsAdmin(Boolean(data));
    })();
  }, []);
  if (!isAdmin) return null;
  return <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">Admin</span>;
}
