



"use client";

import { useState } from "react";
import { CloudUpload, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { parseFile, isSupported, type ParsedFile } from "@/lib/parsers";
import Dropzone from "@/components/upload/Dropzone";
import FileCard, { type FileItem } from "@/components/upload/FileCard";
import PreviewModal from "@/components/upload/PreviewModal";
import IngestionV2Launcher from "@/components/ingestion/IngestionV2Launcher";

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
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <CloudUpload className="h-6 w-6 text-indigo-600" />
          Upload Deal Data
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Drop CSV, XLSX, XLS, TXT, or JSON files. We'll parse them in your
          browser and store them securely.
        </p>
      </div>

      {/* PRIMARY PATH — v2 pipeline (one-click upload + ingest) */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          PRIMARY PATH — recommended for Mergermarket exports
        </div>
        <IngestionV2Launcher />
      </div>

      {/* LEGACY PATH — only for non-Mergermarket CSVs that need column mapping */}
      <details className="mb-6 rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
          Legacy two-step path (CSV with custom column mapping)
        </summary>
        <p className="mt-2 text-[11px] text-slate-500">
          Use this only when your file doesn&apos;t match the Mergermarket schema and you need to manually map columns.
          Files uploaded here will NOT use the v2 ingestion pipeline — they will skip raw preservation, digest detection, and resolution tasks.
          After upload, you must visit the Mapping page to run the import.
        </p>

        {items.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-4">
            <span className="text-[11px] text-slate-500">{pendingCount} file(s) pending mapping</span>
            <button
              onClick={importAll}
              disabled={busy || pendingCount === 0}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <Sparkles className="h-3 w-3" />
              {busy ? "Storing…" : `Store ${pendingCount} file(s) for mapping`}
            </button>
          </div>
        )}

        <div className="mt-3">
          <Dropzone onFiles={addFiles} />
        </div>
      </details>

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
              onPreview={(id) => setPreviewId(id)}
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
