"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, RefreshCw, Loader2, Copy, Trash2, UserCheck, Link2, ExternalLink } from "lucide-react";

type CatalogRow = {
  module_key: string;
  display_name: string;
  category: string;
  default_for_invitees: boolean;
  sort_order: number;
};

type Row = {
  kind: "admin" | "guest" | "user";
  id: string;
  email: string;
  is_admin: boolean;
  access: Record<string, boolean>;
  user_id: string | null;
  invite_id: string | null;
  signup_count: number | null;
  created_at: string;
};

type ActiveInvite = {
  id: string;
  token: string;
  created_at: string;
  signup_count: number;
  module_access: Record<string, boolean>;
} | null;

type HistoryRow = {
  id: string;
  created_at: string;
  invalidated_at: string | null;
  signup_count: number;
  is_active: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  deal_data: "Deal Data",
  intelligence: "Intelligence",
  advisory: "Advisory",
  system: "System",
};

export default function AdminUsersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [activeInvite, setActiveInvite] = useState<ActiveInvite>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uR, iR] = await Promise.all([
        fetch("/api/admin/users").then((r) => r.json()),
        fetch("/api/admin/invite").then((r) => r.json()),
      ]);
      if (uR.error) throw new Error(uR.error);
      setRows(uR.users ?? []);
      setCatalog(uR.catalog ?? []);
      setActiveInvite(iR.active);
      setHistory(iR.history ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generateInvite() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/invite", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Generate failed");
      await load();
    } catch (e: any) { setError(e?.message ?? "Generate failed"); }
    finally { setBusy(false); }
  }

  async function invalidateInvite() {
    if (!confirm("Invalidate the current active invite link? Any guest sessions using it will lose access immediately.")) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/invite", { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Invalidate failed");
      await load();
    } catch (e: any) { setError(e?.message ?? "Invalidate failed"); }
    finally { setBusy(false); }
  }

  async function togglePermission(row: Row, moduleKey: string, currentValue: boolean) {
    setError(null);
    setRows((prev) => prev.map((r) =>
      r.id === row.id ? { ...r, access: { ...r.access, [moduleKey]: !currentValue } } : r
    ));
    try {
      const payload: Record<string, unknown> = { module_key: moduleKey, granted: !currentValue };
      if (row.kind === "guest" && row.invite_id) payload.invite_id = row.invite_id;
      else if (row.user_id) payload.user_id = row.user_id;
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error ?? "Toggle failed");
      }
    } catch (e: any) {
      setError(e?.message ?? "Toggle failed");
      setRows((prev) => prev.map((r) =>
        r.id === row.id ? { ...r, access: { ...r.access, [moduleKey]: currentValue } } : r
      ));
    }
  }

  const inviteUrl = activeInvite
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${activeInvite.token}`
    : "";

  function copyInvite() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const catalogByCategory = catalog.reduce((acc, c) => {
    if (!acc[c.category]) acc[c.category] = [];
    acc[c.category].push(c);
    return acc;
  }, {} as Record<string, CatalogRow[]>);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-white">
          <Shield className="h-6 w-6 text-indigo-600" />
          User Settings (Admin)
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage the single active invite link + the modules guests can see. Visitors with the link get instant portal access without signing up. Toggles apply live to all current guest sessions.
        </p>
      </div>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>
      )}

      {/* Invite link panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <Link2 className="h-3.5 w-3.5" /> Secure invite link (one-click portal access)
        </h2>
        {activeInvite ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input value={inviteUrl} readOnly
                className="flex-1 rounded border border-slate-300 bg-slate-50 px-2 py-1.5 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-800" />
              <button onClick={copyInvite} className="flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700">
                <Copy className="h-3 w-3" /> {copied ? "Copied!" : "Copy"}
              </button>
              <a href={inviteUrl} target="_blank" rel="noreferrer"
                 className="flex items-center gap-1 rounded border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-900 dark:hover:bg-indigo-950/40">
                <ExternalLink className="h-3 w-3" /> Test
              </a>
              <button onClick={invalidateInvite} disabled={busy}
                className="flex items-center gap-1 rounded border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-900 dark:hover:bg-rose-950/40">
                <Trash2 className="h-3 w-3" /> Invalidate
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Generated {new Date(activeInvite.created_at).toLocaleString()} · {activeInvite.signup_count} visit{activeInvite.signup_count !== 1 ? "s" : ""}.
              Anyone clicking this URL gets immediate portal access with the modules toggled below. Generating a new link auto-invalidates this one.
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-slate-500">No active invite link. Generate one to allow guest access.</p>
        )}
        <button onClick={generateInvite} disabled={busy}
                className="mt-3 flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {activeInvite ? "Generate new link (invalidates current)" : "Generate invite link"}
        </button>
        {history.length > 1 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] font-medium text-slate-500">Invite history ({history.length})</summary>
            <div className="mt-2 space-y-1 text-[11px]">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 dark:bg-slate-800">
                  <span>{new Date(h.created_at).toLocaleDateString()}</span>
                  <span className="text-slate-500">{h.signup_count} visit{h.signup_count !== 1 ? "s" : ""}</span>
                  {h.is_active
                    ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">active</span>
                    : <span className="rounded bg-slate-200 px-1.5 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-400">invalidated {h.invalidated_at ? new Date(h.invalidated_at).toLocaleDateString() : ""}</span>}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* Matrix */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <UserCheck className="h-3.5 w-3.5" /> Access matrix ({rows.length} row{rows.length !== 1 ? "s" : ""})
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-slate-500">No active sessions. Generate an invite link to share portal access with guests.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left dark:bg-slate-900">Session</th>
                  {Object.entries(catalogByCategory).map(([cat, mods]) => (
                    <th key={cat} colSpan={mods.length} className="border-l border-slate-200 px-2 py-1 text-center text-slate-500 dark:border-slate-700">
                      {CATEGORY_LABELS[cat] ?? cat}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left dark:bg-slate-900"></th>
                  {Object.values(catalogByCategory).flat().map((m) => (
                    <th key={m.module_key} className="border-l border-slate-200 px-1 py-1 text-center font-normal dark:border-slate-700">
                      <div className="whitespace-nowrap text-[10px]">{m.display_name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/30">
                    <td className="sticky left-0 bg-white px-2 py-1.5 dark:bg-slate-900">
                      <div className="font-medium text-slate-900 dark:text-white">{r.email}</div>
                      {r.kind === "admin" && <div className="text-[9px] font-bold uppercase text-indigo-600">Admin · all modules</div>}
                      {r.kind === "guest" && <div className="text-[9px] font-bold uppercase text-emerald-600">Guest session (via invite link)</div>}
                      {r.kind === "user" && <div className="text-[9px] font-bold uppercase text-slate-500">Registered user</div>}
                    </td>
                    {Object.values(catalogByCategory).flat().map((m) => (
                      <td key={m.module_key} className="border-l border-slate-200 px-1 py-1.5 text-center dark:border-slate-700">
                        <input
                          type="checkbox"
                          checked={r.access[m.module_key] ?? false}
                          disabled={r.kind === "admin"}
                          onChange={() => togglePermission(r, m.module_key, r.access[m.module_key] ?? false)}
                          className="h-3.5 w-3.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[10px] italic text-slate-500">
              Admin always has full access (uncheckable). Guest toggles apply live — guests refresh and changes appear immediately.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
