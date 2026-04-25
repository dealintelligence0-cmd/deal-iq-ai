import Link from "next/link";
import Sidebar from "@/components/dashboard/Sidebar";
import Footer from "@/components/Footer";
import { LayoutDashboard, Briefcase, FileText, Sparkles, Settings } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className="lg:pl-64 pb-16 lg:pb-0">
        <div className="p-6">{children}</div>
        <Footer />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-slate-200 bg-white py-2 lg:hidden">
        {[
          { href: "/dashboard", icon: LayoutDashboard, label: "Home" },
          { href: "/dashboard/deals", icon: Briefcase, label: "Deals" },
          { href: "/dashboard/proposals", icon: FileText, label: "Proposals" },
          { href: "/dashboard/enrich", icon: Sparkles, label: "AI" },
          { href: "/dashboard/settings", icon: Settings, label: "Settings" },
        ].map((it) => (
          <Link key={it.href} href={it.href} className="flex flex-col items-center text-[10px] text-slate-600 hover:text-indigo-600">
            <it.icon className="h-5 w-5" />
            {it.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
