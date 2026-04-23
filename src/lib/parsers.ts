import * as XLSX from "xlsx";
import Papa from "papaparse";

export type ParsedFile = {
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
};

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const text = new TextDecoder("utf-8").decode(buffer);
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      transformHeader: (h) => h.trim(),
    });
    const rows = (parsed.data ?? []).filter(
      (r) => r && Object.keys(r).length > 0
    );
    return {
      headers: parsed.meta.fields ?? (rows[0] ? Object.keys(rows[0]) : []),
      rows,
      rowCount: rows.length,
    };
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const wb = XLSX.read(buffer, { type: "array" });
    const firstSheet = wb.SheetNames[0];
    const ws = wb.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: "",
      raw: false,
    });
    return {
      headers: rows[0] ? Object.keys(rows[0]) : [],
      rows,
      rowCount: rows.length,
    };
  }

  if (name.endsWith(".json")) {
    const text = new TextDecoder("utf-8").decode(buffer);
    const data = JSON.parse(text);
    const rows: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : Array.isArray((data as { data?: unknown[] }).data)
      ? (data as { data: Record<string, unknown>[] }).data
      : [data as Record<string, unknown>];
    return {
      headers: rows[0] ? Object.keys(rows[0]) : [],
      rows,
      rowCount: rows.length,
    };
  }

  throw new Error(`Unsupported file type: ${file.name}`);
}

export function isSupported(file: File): boolean {
  const n = file.name.toLowerCase();
  return (
    n.endsWith(".csv") ||
    n.endsWith(".xlsx") ||
    n.endsWith(".xls") ||
    n.endsWith(".txt") ||
    n.endsWith(".json")
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
