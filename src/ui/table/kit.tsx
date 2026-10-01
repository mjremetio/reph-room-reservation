'use client';

/**
 * Table building blocks shared by the Table view (DataTable) and the Admin tables (DataGrid): sorting, paging,
 * the toolbar, debounced filters and CSV export (docs/spec/06-ui.md, Tables).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { CSV_BOM, CSV_TYPE, toCsv } from '../csv';
import { saveFile } from '../download';

export type Dir = 'asc' | 'desc';
export interface Sort<K extends string> {
  key: K;
  dir: Dir;
}

/** Numbers numerically, text alphabetically; unknowns (null) last. */
export function cmp(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
}

export function SortHeader<K extends string>({ label, k, sort, setSort, className }: { label: string; k: K; sort: Sort<K>; setSort: (s: Sort<K>) => void; className?: string }) {
  const active = sort.key === k;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={className}>
      <button className="dt-sort" onClick={() => setSort({ key: k, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}>
        {label}
        <span className="dt-sort__icon" aria-hidden>
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="dt-toolbar">{children}</div>;
}

export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** One page of rows. Back to page 1 whenever the filters (resetKey) or the page size change. */
export function usePage<T>(items: T[], resetKey: string) {
  const [size, setSize] = useState<number>(25);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [resetKey, size]);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pages - 1);
  return { rows: items.slice(current * size, current * size + size), page: current, pages, size, setSize, setPage, total: items.length };
}

export function Pager({ pager, noun }: { pager: ReturnType<typeof usePage<unknown>>; noun: string }) {
  const { page, pages, size, total } = pager;
  if (total === 0) return null;
  const first = page * size + 1;
  const last = Math.min(total, first + size - 1);
  return (
    <nav className="dt-pager" aria-label={`${noun} pages`}>
      <span className="dt-pager__range" role="status">
        {first}–{last} of {total}
      </span>
      <label className="dt-pager__size">
        Rows per page
        <select value={size} onChange={(e) => pager.setSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn--secondary btn--small" disabled={page === 0} onClick={() => pager.setPage(page - 1)}>
        ‹ Prev
      </button>
      <span className="dt-pager__page" aria-live="polite">
        Page {page + 1} of {pages}
      </span>
      <button className="btn btn--secondary btn--small" disabled={page >= pages - 1} onClick={() => pager.setPage(page + 1)}>
        Next ›
      </button>
    </nav>
  );
}

/** Waits until typing pauses before the value is used in a request. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Saves a CSV (with a BOM, so Excel reads UTF-8; formulas neutralised by toCsv). */
export function exportCsv(filename: string, header: string[], rows: Array<Array<string | number | null | undefined>>): void {
  saveFile(filename, [CSV_BOM, toCsv(header, rows)], CSV_TYPE);
}
