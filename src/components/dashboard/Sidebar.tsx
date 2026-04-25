"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BrainCircuit, LayoutDashboard, CloudUpload, GitMerge,
  AlertTriangle, FlaskConical, Briefcase, FileText,
  BarChart3, Settings, Sparkles, Download, Shield, BookOpen,
} from "lucide-react";

const navItems = [
  { label: "Dashboard",   href: "/dashboard",            icon: LayoutDashboard },
  { label: "Uploads",     href: "/dashboard/uploads",    icon: CloudUpload },
  { label: "Mapping",     href: "/dashboard/mapping",    icon: GitMerge },
  { label: "Exceptions",  href: "/dashboard/exceptions", icon: AlertTriangle },
  { label: "Value Tests", href: "/dashboard/value-test", icon: FlaskConical },
  { label: "Deals",       href: "/dashboard/deals",      icon: Briefcase },
  { label: "Enrich AI",   href: "/dashboard/enrich",     icon: Sparkles },
  { label: "Proposals",   href: "/dashboard/proposals",  icon: FileText },
  { label: "Analytics",   href: "/dashboard/analytics",  icon: BarChart3 },
  { label: "Exports",     href: "/dashboard/exports",    icon: Download },
  { label: "Activity",    href: "/dashboard/activity",   icon: Shield },
  { label: "Help",        href: "/dashboard/help",       icon: BookOpen },
  { label: "Settings",    href: "/dashboard/settings",   icon: Settings },
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
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:bg-white/5 hover:text-white/80"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.label === "Enrich AI" && (
                <span className="ml-auto rounded-full bg-indigo-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-200">
                  AI
                </span>
              )}
            </Link>
          );
        })}
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
