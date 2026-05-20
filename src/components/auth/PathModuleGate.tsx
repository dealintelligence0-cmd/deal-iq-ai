"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import Link from "next/link";

// Map URL path prefix → module key. Pages NOT listed are always visible
// (e.g. /dashboard root, /dashboard/help).
const PATH_TO_MODULE: Array<{ prefix: string; module: string }> = [
  { prefix: "/dashboard/uploads",          module: "import" },
  { prefix: "/dashboard/deals",            module: "deals_data" },
  { prefix: "/dashboard/prioritization",   module: "prioritization" },
  { prefix: "/dashboard/resolution-tasks", module: "triage" },
  { prefix: "/dashboard/themes",           module: "themes" },
  { prefix: "/dashboard/signals",          module: "signals" },
  { prefix: "/dashboard/boltons",          module: "boltons" },
  { prefix: "/dashboard/proposals",        module: "proposals" },
  { prefix: "/dashboard/pmi",              module: "pmi" },
  { prefix: "/dashboard/synergy",          module: "synergy" },
  { prefix: "/dashboard/tsa",              module: "tsa" },
  { prefix: "/dashboard/exports",          module: "exports" },
  { prefix: "/dashboard/settings",         module: "settings" },
];

const ADMIN_PREFIX = "/dashboard/admin";

export default function PathModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [perms, setPerms] = useState<Record<string, boolean> | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me/modules").then((x) => x.json());
        setPerms(r.modules ?? {});
        setIsAdmin(Boolean(r.is_admin));
        setIsGuest(Boolean(r.is_guest));
      } catch {
        setPerms({});
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  if (!loaded || !pathname) return <>{children}</>;

  // Admin-only routes
  if (pathname.startsWith(ADMIN_PREFIX)) {
    if (!isAdmin) {
      return (
        <div className="mx-auto mt-12 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950/30">
          <Lock className="mx-auto mb-2 h-6 w-6 text-amber-600" />
          <h2 className="text-base font-bold text-amber-900 dark:text-amber-200">Admin only</h2>
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
            This page is reserved for the system admin.
          </p>
          <Link href="/dashboard" className="mt-3 inline-block text-xs font-medium text-indigo-600 hover:underline">← Back to dashboard</Link>
        </div>
      );
    }
    return <>{children}</>;
  }

  // Find the longest matching prefix
  const match = PATH_TO_MODULE
    .filter((m) => pathname === m.prefix || pathname.startsWith(m.prefix + "/"))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  if (!match) return <>{children}</>;
  if (perms?.[match.module] === true || isAdmin) return <>{children}</>;

  return (
    <div className="mx-auto mt-12 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950/30">
      <Lock className="mx-auto mb-2 h-6 w-6 text-amber-600" />
      <h2 className="text-base font-bold text-amber-900 dark:text-amber-200">Access not granted</h2>
      <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
        You don&apos;t have access to <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/40">{match.module}</code>.
      </p>
      <p className="mt-3 text-xs text-amber-700 dark:text-amber-300/80">
        Ask the system admin to grant access. By default, invited users see only the Deal Pipeline.
      </p>
      <Link href="/dashboard" className="mt-3 inline-block text-xs font-medium text-indigo-600 hover:underline">← Back to dashboard</Link>
    </div>
  );
}
