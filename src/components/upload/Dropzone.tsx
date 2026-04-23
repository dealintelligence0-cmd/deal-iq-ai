"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud } from "lucide-react";

type Props = { onFiles: (files: File[]) => void };

export default function Dropzone({ onFiles }: Props) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) onFiles(accepted);
    },
    [onFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: {
      "text/csv": [".csv"],
      "text/plain": [".txt"],
      "application/json": [".json"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
  });

  return (
    <div
      {...getRootProps()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
        isDragActive
          ? "border-indigo-500 bg-indigo-50"
          : "border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-slate-100"
      }`}
    >
      <input {...getInputProps()} />
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
        <UploadCloud className="h-6 w-6 text-indigo-600" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">
        {isDragActive ? "Drop files here" : "Drag & drop files here"}
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        or click to browse · CSV, XLSX, XLS, TXT, JSON · up to 50 MB
      </p>
    </div>
  );
}
