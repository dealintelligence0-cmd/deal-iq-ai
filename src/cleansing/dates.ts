/** Normalize a messy date string to ISO YYYY-MM-DD. Returns null if unrecoverable. */
export function normalizeDate(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Pure numeric Excel serial (e.g. 45231)
  if (/^\d{4,6}$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(excelEpoch.getTime() + n * 86400000);
      return iso(d);
    }
  }

  // ISO already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : iso(d);
  }

  // DD/MM/YYYY or DD-MM-YYYY or D.M.YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m1) {
    let [, d, mo, y] = m1;
    if (y.length === 2) y = Number(y) > 50 ? `19${y}` : `20${y}`;
    // Heuristic: if first > 12, it's definitely DD-first
    const day = Number(d);
    const mon = Number(mo);
    const [dd, mm] = day > 12 ? [day, mon] : [day, mon]; // default DD-first
    const date = new Date(Date.UTC(Number(y), mm - 1, dd));
    return validDate(date, dd, mm, Number(y)) ? iso(date) : null;
  }

  // "12 Jan 2024", "Jan 12, 2024", "January 12 2024"
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return iso(parsed);

  // Quarter format "Q3 2023"
  const mq = s.match(/^Q([1-4])[\s-]*(\d{4})$/i);
  if (mq) {
    const q = Number(mq[1]);
    const y = Number(mq[2]);
    const month = (q - 1) * 3;
    return iso(new Date(Date.UTC(y, month, 15)));
  }

  return null;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function validDate(d: Date, dd: number, mm: number, y: number): boolean {
  return (
    !isNaN(d.getTime()) &&
    d.getUTCFullYear() === y &&
    d.getUTCMonth() === mm - 1 &&
    d.getUTCDate() === dd
  );
}
