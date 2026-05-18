

import Papa from "papaparse";

function clean(val: unknown): string {
  if (val == null) return "";
  let s = String(val);
  // Strip HTML tags
  s = s.replace(/<[^>]*>/g, "");
  // Strip emoji + icon Unicode ranges
  s = s.replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{1F000}-\u{1F2FF}]/gu, "");
  // Collapse whitespace, trim
  return s.replace(/\s+/g, " ").trim();
}

export function downloadCsv<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  columns?: (keyof T)[]
): void {
  if (!rows.length) return;
  const cols = (columns ?? (Object.keys(rows[0]) as (keyof T)[])) as string[];
  const data = rows.map((r) => {
    const out: Record<string, string> = {};
    cols.forEach((c) => (out[c] = clean(r[c as keyof T])));
    return out;
  });
  const csv = Papa.unparse(data, { columns: cols });
  // UTF-8 BOM ensures Excel reads as UTF-8 (renders ₹, €, etc. correctly)
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
