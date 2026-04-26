"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Footer from "@/components/Footer";
import DisclaimerModal from "@/components/DisclaimerModal";
import { LayoutDashboard, Briefcase, FileText, Layers, TrendingUp } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <DisclaimerModal />
      <main className="lg:pl-64 pb-16 lg:pb-0">
        <div className="p-6">{children}</div>
        <Footer />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-slate-200 bg-white py-2 lg:hidden">
       {[
          { href: "/dashboard",           icon: LayoutDashboard, label: "Home" },
          { href: "/dashboard/deals",     icon: Briefcase,       label: "Pipeline" },
          { href: "/dashboard/proposals", icon: FileText,        label: "Proposals" },
          { href: "/dashboard/pmi",       icon: Layers,          label: "PMI" },
          { href: "/dashboard/synergy",   icon: TrendingUp,      label: "Synergy" },
        ].map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link key={it.href} href={it.href}
              className={`flex flex-col items-center text-[10px] transition ${
                active ? "text-indigo-600 dark:text-indigo-400"
                : "text-slate-500 dark:text-slate-400 hover:text-indigo-500"
              }`}>
              <it.icon className="h-5 w-5" />
              {it.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
