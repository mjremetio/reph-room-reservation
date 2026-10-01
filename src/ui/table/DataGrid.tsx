'use client';

/**
 * A searchable, sortable, paged table with optional row selection and CSV export, driven by column definitions
 * (docs/spec/06-ui.md, Admin tables). Search looks through every column's value; the CSV has the filtered rows
 * (or only the selected ones) in the current order, with the same columns.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { cmp, exportCsv, Pager, SortHeader, Toolbar, usePage, type Sort } from './kit';

export interface Column<T> {
  key: string;
  label: string;
  /** For sorting, search and CSV. */
  value: (row: T) => string | number | null;
  /** The CSV text when it differs from the sort value (e.g. "2026-09-28 3:00 PM" for an ISO time). */
  csv?: (row: T) => string | number | null;
  /** What the cell shows (default: the value). */
  render?: (row: T) => ReactNode;
  className?: string;
  /** Left out of the CSV (e.g. a column of buttons). */
  noCsv?: boolean;
  /** Only in the CSV (e.g. the e-mail next to a name the table already shows). */
  csvOnly?: boolean;
  noSort?: boolean;
}

export function DataGrid<T>({
  rows,
  columns,
  rowKey,
  noun,
  defaultSort,
  filters,
  actions,
  onRowClick,
  selection,
  exportName,
  empty = 'Nothing matches these filters.',
  loading,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** "bookings": in the pager, search label and selection counts. */
  noun: string;
  defaultSort: Sort<string>;
  /** Extra filter controls after the search box. */
  filters?: ReactNode;
  /** Buttons for the selected rows (shown when some are selected). */
  actions?: (selected: T[], clear: () => void) => ReactNode;
  onRowClick?: (row: T) => void;
  /** Rows that can be selected (a checkbox column), e.g. requests that can be approved. */
  selection?: (row: T) => boolean;
  /** File name without ".csv"; no Export button when missing. */
  exportName?: string;
  empty?: string;
  loading?: boolean;
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort<string>>(defaultSort);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const col = columns.find((c) => c.key === sort.key) ?? columns[0];
    const text = (r: T) => columns.map((c) => `${c.value(r) ?? ''} ${c.csv?.(r) ?? ''}`).join(' ').toLowerCase();
    const found = needle ? rows.filter((r) => text(r).includes(needle)) : rows;
    const sorted = col ? [...found].sort((a, b) => cmp(col.value(a), col.value(b))) : found;
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [rows, columns, q, sort]);

  const pager = usePage(filtered, JSON.stringify([q, sort, rows.length]));
  const selectable = selection ? filtered.filter(selection) : [];
  const selected = rows.filter((r) => picked.has(rowKey(r)));
  const clear = () => setPicked(new Set());
  const toggle = (r: T) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(rowKey(r))) next.delete(rowKey(r));
      else next.add(rowKey(r));
      return next;
    });
  const allPicked = selectable.length > 0 && selectable.every((r) => picked.has(rowKey(r)));
  const csvColumns = columns.filter((c) => !c.noCsv);
  const shown = columns.filter((c) => !c.csvOnly);
  const exportRows = () =>
    exportCsv(
      `${exportName}${selected.length ? '-selected' : ''}.csv`,
      csvColumns.map((c) => c.label),
      (selected.length ? filtered.filter((r) => picked.has(rowKey(r))) : filtered).map((r) => csvColumns.map((c) => (c.csv ?? c.value)(r))),
    );

  return (
    <>
      <Toolbar>
        <label className="dt-search">
          <span className="sr-only">Search {noun}</span>
          <input type="search" placeholder={`Search ${noun}`} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {filters}
        <span className="dt-toolbar__spacer" />
        {selected.length > 0 && actions?.(selected, clear)}
        {exportName && (
          <button className="btn btn--secondary btn--small" onClick={exportRows} disabled={filtered.length === 0}>
            Export CSV{selected.length ? ` (${selected.length})` : ''}
          </button>
        )}
      </Toolbar>
      <div className="dt-scroll admin-scroll">
        <table className="dt">
          <thead>
            <tr>
              {selection && (
                <th scope="col" className="dt-check-col">
                  <input
                    type="checkbox"
                    aria-label={`Select every ${noun.replace(/s$/, '')} that can be selected`}
                    checked={allPicked}
                    disabled={selectable.length === 0}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(selectable.map(rowKey)))}
                  />
                </th>
              )}
              {shown.map((c) =>
                c.noSort ? (
                  <th key={c.key} scope="col" className={c.className}>
                    {c.label}
                  </th>
                ) : (
                  <SortHeader key={c.key} label={c.label} k={c.key} sort={sort} setSort={setSort} className={c.className} />
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {pager.rows.map((r) => (
              <tr
                key={rowKey(r)}
                className={`dt-row${onRowClick ? ' dt-row--link' : ''}${picked.has(rowKey(r)) ? ' is-picked' : ''}`}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(r)) : undefined}
              >
                {selection && (
                  <td className="dt-check-col" onClick={(e) => e.stopPropagation()}>
                    {selection(r) && <input type="checkbox" aria-label={`Select ${rowKey(r)}`} checked={picked.has(rowKey(r))} onChange={() => toggle(r)} />}
                  </td>
                )}
                {shown.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.render ? c.render(r) : (c.value(r) ?? '–')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p className="dt-empty">Loading…</p>}
        {!loading && filtered.length === 0 && <p className="dt-empty">{empty}</p>}
      </div>
      <Pager pager={pager} noun={noun} />
    </>
  );
}
