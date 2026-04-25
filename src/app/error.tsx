"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { console.error("Global error:", error); }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-[#0a0a14]">
      <div className="card max-w-md p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
          <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          An unexpected error occurred. Try reloading. If it persists, contact the platform owner.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-slate-400">Ref: {error.digest}</p>
        )}
        <div className="mt-6 flex gap-2">
          <button onClick={reset} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <a href="/dashboard" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">Go home</a>
        </div>
      </div>
    </div>
  );
}
