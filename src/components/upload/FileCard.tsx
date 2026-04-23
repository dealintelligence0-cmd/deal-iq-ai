"use client";

import {
  FileText,
  FileSpreadsheet,
  FileJson,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  Eye,
} from "lucide-react";
import { formatBytes } from "@/lib/parsers";

export type FileItemStatus =
  | "pending"
  | "parsing"
  | "uploading"
  | "saving"
  | "done"
  | "error";

export type FileItem = {
  id: string;
  file: File;
  status: FileItemStatus;
  progress: number;
  rowCount?: number;
  error?: string;
  uploadId?: string;
};

function iconFor(name: string) {
  const n = name.toLowerCase();
  if (n.endsWith(".json")) return FileJson;
  if (n.endsWith(".csv") || n.endsWith(".txt")) return FileText;
  return FileSpreadsheet;
}

const statusLabel: Record<FileItemStatus, string> = {
  pending: "Ready",
  parsing: "Parsing…",
  uploading: "Uploading…",
  saving: "Saving…",
  done: "Imported",
  error: "Error",
};

type Props = {
  item: FileItem;
  onRemove: (id: string) => void;
  onPreview: (id: string) => void;
};

export default function FileCard({ item, onRemove, onPreview }: Props) {
  const Icon = iconFor(item.file.name);
  const busy =
    item.status === "parsing" ||
    item.status === "uploading" ||
    item.status === "saving";

  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
        <Icon className="h-5 w-5 text-indigo-600" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-900">
            {item.file.name}
          </p>
          <span className="text-xs text-slate-400">
            {formatBytes(item.file.size)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs">
          {item.status === "done" && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          )}
          {item.status === "error" && (
            <XCircle className="h-3.5 w-3.5 text-red-600" />
          )}
          {busy && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
          )}
          <span
            className={
              item.status === "error"
                ? "text-red-600"
                : item.status === "done"
                ? "text-emerald-700"
                : "text-slate-500"
            }
          >
            {statusLabel[item.status]}
            {item.rowCount !== undefined &&
              item.status !== "error" &&
              ` · ${item.rowCount} rows`}
            {item.error && ` · ${item.error}`}
          </span>
        </div>
        {busy && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {(item.status === "pending" || item.status === "done") &&
          item.rowCount !== undefined && (
            <button
              onClick={() => onPreview(item.id)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              title="Preview"
            >
              <Eye className="h-4 w-4" />
            </button>
          )}
        {!busy && (
          <button
            onClick={() => onRemove(item.id)}
            className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
            title="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
