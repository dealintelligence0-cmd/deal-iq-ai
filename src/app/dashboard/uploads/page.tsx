"use client";

import { useState } from "react";
import { CloudUpload, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { parseFile, isSupported, type ParsedFile } from "@/lib/parsers";
import Dropzone from "@/components/upload/Dropzone";
import FileCard, { type FileItem } from "@/components/upload/FileCard";
import PreviewModal from "@/components/upload/PreviewModal";

const MAX_SIZE = 50 * 1024 * 1024;

type Parsed = { [id: string]: ParsedFile };

export default function UploadsPage() {
  const supabase = createClient();
  const [items, setItems] = useState<FileItem[]>([]);
  const [parsed, setParsed] = useState<Parsed>({});
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function addFiles(files: File[]) {
    const next: FileItem[] = [];
    for (const f of files) {
      if (!isSupported(f)) continue;
      if (f.size > MAX_SIZE) {
        next.push({
          id: crypto.randomUUID(),
          file: f,
          status: "error",
          progress: 0,
          error: "File exceeds 50 MB",
        });
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file: f,
        status: "pending",
        progress: 0,
      });
    }
    setItems((p) => [...p, ...next]);
    // Eagerly parse each new file for preview + row counts
    next.forEach((it) => {
      if (it.status !== "pending") return;
      update(it.id, { status: "parsing", progress: 20 });
      parseFile(it.file)
        .then((pf) => {
          setParsed((p) => ({ ...p, [it.id]: pf }));
          update(it.id, {
            status: "pending",
            progress: 0,
            rowCount: pf.rowCount,
          });
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : "Parse failed";
          update(it.id, { status: "error", progress: 0, error: msg });
        });
    });
  }

  function update(id: string, patch: Partial<FileItem>) {
    setItems((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function remove(id: string) {
    setItems((p) => p.filter((x) => x.id !== id));
    setParsed((p) => {
      const { [id]: _drop, ...rest } = p;
      void _drop;
      return rest;
    });
  }

  async function importAll() {
    setBusy(true);
    setToast(null);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      setToast("You must be signed in.");
      setBusy(false);
      return;
    }
    const userId = userData.user.id;

    let done = 0;
    for (const it of items) {
      if (it.status !== "pending" || !parsed[it.id]) continue;

      update(it.id, { status: "uploading", progress: 40 });
      const path = `${userId}/${Date.now()}-${it.file.name}`;
      const { error: upErr } = await supabase.storage
        .from("uploads")
        .upload(path, it.file, { upsert: false });

      if (upErr) {
        update(it.id, {
          status: "error",
          progress: 0,
          error: upErr.message,
        });
        continue;
      }

      update(it.id, { status: "saving", progress: 75 });
      const pf = parsed[it.id];
      const { data: row, error: dbErr } = await supabase
        .from("uploads")
        .insert({
          created_by: userId,
          file_name: it.file.name,
          file_type: it.file.type || it.file.name.split(".").pop() || "",
          file_size: it.file.size,
          storage_path: path,
          row_count: pf.rowCount,
          status: "parsed",
          metadata: { headers: pf.headers },
        })
        .select("id")
        .single();

      if (dbErr) {
        update(it.id, {
          status: "error",
          progress: 0,
          error: dbErr.message,
        });
        continue;
      }

      update(it.id, {
        status: "done",
        progress: 100,
        uploadId: row.id,
      });
      done++;
    }

    setBusy(false);
    setToast(done > 0 ? `${done} file(s) imported successfully.` : null);
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const preview = previewId ? parsed[previewId] : null;
  const previewName = items.find((i) => i.id === previewId)?.file.name ?? "";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <CloudUpload className="h-6 w-6 text-indigo-600" />
            Upload Deal Data
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Drop CSV, XLSX, XLS, TXT, or JSON files. We'll parse them in your
            browser and store them securely.
          </p>
        </div>
        {items.length > 0 && (
          <button
            onClick={importAll}
            disabled={busy || pendingCount === 0}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {busy
              ? "Importing…"
              : `Import ${pendingCount} file${pendingCount === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      <Dropzone onFiles={addFiles} />

      {toast && (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              Files ({items.length})
            </h2>
            {doneCount > 0 && (
              <span className="text-xs text-emerald-700">
                {doneCount} imported
              </span>
            )}
          </div>
          {items.map((it) => (
            <FileCard
              key={it.id}
              item={it}
              onRemove={remove}
              onPreview={setPreviewId}
            />
          ))}
        </div>
      )}

      {preview && (
        <PreviewModal
          fileName={previewName}
          headers={preview.headers}
          rows={preview.rows}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}
