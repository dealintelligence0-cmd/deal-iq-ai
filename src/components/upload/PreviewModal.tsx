"use client";

import { X } from "lucide-react";

type Props = {
  fileName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  onClose: () => void;
};

export default function PreviewModal({
  fileName,
  headers,
  rows,
  onClose,
}: Props) {
  const previewRows = rows.slice(0, 25);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur">
      <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Preview: {fileName}
            </h2>
            <p className="text-xs text-slate-500">
              Showing first {previewRows.length} of {rows.length} rows ·{" "}
              {headers.length} columns
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">
                  #
                </th>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="border-l border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-700"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((r, i) => (
                <tr
                  key={i}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                  {headers.map((h) => (
                    <td
                      key={h}
                      className="max-w-xs truncate border-l border-slate-100 px-3 py-2 text-slate-700"
                    >
                      {String(r[h] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
