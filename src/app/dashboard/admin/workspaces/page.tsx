"use client";

import { useState, useEffect, useCallback } from "react";
import { Users2, Loader2, Plus, Trash2, RefreshCw, X, Shield } from "lucide-react";

type Workspace = {
  id: string;
  name: string;
  slug: string | null;
  created_by: string;
  is_personal: boolean;
  created_at: string;
};

type Member = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  added_at: string;
  users: { email: string };
};

type User = {
  id: string;
  email: string;
  is_admin: boolean;
};

const ROLE_COLORS: Record<string, string> = {
  owner: "indigo",
  editor: "emerald",
  viewer: "slate",
};

export default function AdminWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<"owner" | "editor" | "viewer">("viewer");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/workspaces").then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setWorkspaces(r.workspaces ?? []);
      setMembers(r.members ?? []);
      setUsers(r.users ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createWorkspace() {
    if (!newName.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Create failed");
      setNewName("");
      await load();
    } catch (e: any) { setError(e?.message ?? "Create failed"); }
    finally { setBusy(false); }
  }

  async function deleteWorkspace(id: string, name: string) {
    if (!confirm(`Delete workspace "${name}"? All members lose access. Narratives created in this workspace will have their workspace link cleared but won't be deleted.`)) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/admin/workspaces?id=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Delete failed");
      await load();
    } catch (e: any) { setError(e?.message ?? "Delete failed"); }
    finally { setBusy(false); }
  }

  async function addMember(workspaceId: string) {
    if (!addUserId) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/workspaces/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId, user_id: addUserId, role: addRole }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Add failed");
      setAddingTo(null);
      setAddUserId(""); setAddRole("viewer");
      await load();
    } catch (e: any) { setError(e?.message ?? "Add failed"); }
    finally { setBusy(false); }
  }

  async function changeRole(memberId: string, role: string) {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/workspaces/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memberId, role }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Update failed");
      await load();
    } catch (e: any) { setError(e?.message ?? "Update failed"); }
    finally { setBusy(false); }
  }

  async function removeMember(memberId: string) {
    if (!confirm("Remove this member from the workspace?")) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/admin/workspaces/members?id=${memberId}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Remove failed");
      await load();
    } catch (e: any) { setError(e?.message ?? "Remove failed"); }
    finally { setBusy(false); }
  }

  const membersByWs = new Map<string, Member[]>();
  for (const m of members) {
    const list = membersByWs.get(m.workspace_id) ?? [];
    list.push(m);
    membersByWs.set(m.workspace_id, list);
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-white">
          <Users2 className="h-6 w-6 text-indigo-600" />
          Workspaces (Admin)
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Create shared workspaces where multiple users can collaborate on the same Account Narratives. Each user always has a personal workspace too.
        </p>
      </div>

      {error && (
        <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>
      )}

      {/* Create */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <Plus className="h-3.5 w-3.5" /> Create shared workspace
        </h2>
        <div className="flex items-center gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter" && !busy) createWorkspace(); }}
                 placeholder='e.g. "Healthcare practice", "Q4 2026 deal book"'
                 className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
          <button onClick={createWorkspace} disabled={busy || !newName.trim()}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create
          </button>
        </div>
      </section>

      {/* Workspace list */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <Users2 className="h-3.5 w-3.5" /> All workspaces ({workspaces.length})
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : (
          <div className="space-y-2">
            {workspaces.map((ws) => {
              const wsMembers = membersByWs.get(ws.id) ?? [];
              return (
                <article key={ws.id}
                         className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {ws.name}
                        {ws.is_personal && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-400">Personal</span>}
                      </h3>
                      <p className="text-[10.5px] text-slate-500">
                        {wsMembers.length} member{wsMembers.length !== 1 ? "s" : ""} · Created {new Date(ws.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {!ws.is_personal && (
                      <button onClick={() => deleteWorkspace(ws.id, ws.name)}
                              className="rounded border border-rose-200 px-2 py-1 text-[10.5px] text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/40">
                        <Trash2 className="inline h-3 w-3" /> Delete
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {wsMembers.map((m) => {
                      const color = ROLE_COLORS[m.role];
                      return (
                        <div key={m.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-[11px] dark:bg-slate-800">
                          <span className="text-slate-700 dark:text-slate-300">{m.users.email}</span>
                          <div className="flex items-center gap-1">
                            <select value={m.role} onChange={(e) => changeRole(m.id, e.target.value)}
                                    className={`rounded bg-${color}-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-${color}-700 dark:bg-${color}-950 dark:text-${color}-300`}>
                              <option value="owner">Owner</option>
                              <option value="editor">Editor</option>
                              <option value="viewer">Viewer</option>
                            </select>
                            <button onClick={() => removeMember(m.id)} className="text-slate-400 hover:text-rose-600">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {addingTo === ws.id ? (
                    <div className="mt-2 flex items-center gap-2 rounded bg-indigo-50 p-2 dark:bg-indigo-950/30">
                      <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}
                              className="flex-1 rounded border border-slate-300 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800">
                        <option value="">— pick a user —</option>
                        {users.filter((u) => !wsMembers.some((m) => m.user_id === u.id)).map((u) => (
                          <option key={u.id} value={u.id}>{u.email}{u.is_admin ? " (admin)" : ""}</option>
                        ))}
                      </select>
                      <select value={addRole} onChange={(e) => setAddRole(e.target.value as any)}
                              className="rounded border border-slate-300 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800">
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="owner">Owner</option>
                      </select>
                      <button onClick={() => addMember(ws.id)} disabled={!addUserId || busy}
                              className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                        Add
                      </button>
                      <button onClick={() => { setAddingTo(null); setAddUserId(""); }}
                              className="text-slate-400 hover:text-slate-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingTo(ws.id)}
                            className="mt-2 flex items-center gap-1 text-[10.5px] font-medium text-indigo-600 hover:text-indigo-500">
                      <Plus className="h-3 w-3" /> Add member
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
