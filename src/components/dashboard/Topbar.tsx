"use client";

import { Bell, Search } from "lucide-react";

export default function Topbar({ email }: { email: string }) {
  const initial = email.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/80 px-6 backdrop-blur">
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Search deals, proposals, companies..."
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
        <Bell className="h-5 w-5" />
      </button>
      <form action="/auth/signout" method="post" className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <div className="text-sm font-medium text-slate-900">{email.split("@")[0]}</div>
          <div className="text-xs text-slate-500">{email}</div>
        </div>
        <button
          type="submit"
          title="Sign out"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-medium text-white hover:opacity-90"
        >
          {initial}
        </button>
      </form>
    </header>
  );
}
