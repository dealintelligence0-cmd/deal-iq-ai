

import Papa from "papaparse";

export function downloadCsv<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  columns?: (keyof T)[]
): void {
  if (!rows.length) return;
  const cols = (columns ?? (Object.keys(rows[0]) as (keyof T)[])) as string[];
  const data = rows.map((r) => {
    const out: Record<string, unknown> = {};
    cols.forEach((c) => (out[c] = r[c as keyof T] ?? ""));
    return out;
  });
  const csv = Papa.unparse(data, { columns: cols });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
