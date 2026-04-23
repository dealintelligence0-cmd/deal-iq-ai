"use client";

import { useState } from "react";
import { Save, FolderOpen, Loader2 } from "lucide-react";
import type { FieldMapping } from "@/lib/mapping";

export type Template = {
  id: string;
  name: string;
  mapping: FieldMapping;
};

type Props = {
  templates: Template[];
  onLoad: (t: Template) => void;
  onSave: (name: string) => Promise<void>;
  saving: boolean;
};

export default function TemplateBar({ templates, onLoad, onSave, saving }: Props) {
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState("");

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-2">
        <FolderOpen className="h-4 w-4 text-slate-500" />
        <select
          value={selectedId}
          onChange={(e) => {
            const id = e.target.value;
            setSelectedId(id);
            const t = templates.find((x) => x.id === id);
            if (t) onLoad(t);
          }}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">Load saved template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name…"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <button
          onClick={async () => {
            if (!name.trim()) return;
            await onSave(name.trim());
            setName("");
          }}
          disabled={saving || !name.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save
        </button>
      </div>
    </div>
  );
}
