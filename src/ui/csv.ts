/** CSV for the table view's Export. Values are quoted when needed; formulas are neutralised for spreadsheets. */

type Cell = string | number | null | undefined;

function cell(v: Cell): string {
  let s = v === null || v === undefined ? '' : String(v);
  // A leading =, +, - or @ would run as a formula in Excel or Sheets (CSV injection).
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Save with a BOM so Excel opens UTF-8 text (e.g. en dashes) correctly. */
export const CSV_TYPE = 'text/csv;charset=utf-8';
export const CSV_BOM = '\uFEFF';
