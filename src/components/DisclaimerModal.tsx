"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export default function DisclaimerModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("disclaimer_accepted")) {
      setOpen(true);
    }
  }, []);

  function accept() {
    localStorage.setItem("disclaimer_accepted", "1");
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card max-w-md p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">Before you continue</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          This tool supports analysis only. AI-generated insights may be incomplete or inaccurate.
          Final decisions must be independently validated. No warranties — use at your own risk.
        </p>
        <button onClick={accept}
          className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          I understand & accept
        </button>
      </div>
    </div>
  );
}
