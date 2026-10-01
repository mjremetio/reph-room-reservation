'use client';

/**
 * S18 Admin reports (docs/spec/06-ui.md; flows F32): how rooms are used over a range of up to 92 days. Figures from
 * src/domain/reports.ts; each chart has its data table, every section exports as CSV, and Print makes a PDF.
 */
import { useQuery } from '@tanstack/react-query';
import { addMinutes } from '../../domain/time';
import { adminApi, type ReportJson } from '../api';
import { BarList, ColumnChart, Donut, Heatmap, StatTile, STATUS_COLOURS } from '../charts/Charts';
import { fmtDay, fmtToolDate } from '../format';
import { exportCsv } from '../table/kit';
import { pct, RangePicker, useRange } from './shared';

const DAY_MS = 86_400_000;

function exportReport(r: ReportJson, name: string) {
  exportCsv(`${name}-rooms.csv`, ['Room', 'Floor', 'Bookings', 'Hours', 'Utilisation', 'No-shows'], r.byRoom.map((x) => [x.name, x.floor, x.count, x.hours, pct(x.utilisation), x.noShows]));
}

export function AdminReports() {
  const [range, setRange, now] = useRange('week');
  const tooLong = range.to.getTime() - range.from.getTime() > 92 * DAY_MS;
  const { data: r, isLoading, error } = useQuery({
    queryKey: ['admin', 'reports', range.from.toISOString(), range.to.toISOString()],
    queryFn: () => adminApi.reports(range.from, range.to),
    enabled: !tooLong && range.to > range.from,
    placeholderData: (prev) => prev,
  });
  const name = `report-${fmtToolDate(range.from)}-to-${fmtToolDate(addMinutes(range.to, -1))}`;

  return (
    <div className="admin-page admin-report">
      <header className="admin-page__head admin-page__head--row">
        <div>
          <h1>Reports</h1>
          <p className="card__meta">
            {fmtDay(range.from)} – {fmtDay(addMinutes(range.to, -1))}. Utilisation = booked hours ÷ all 24 hours of each day (the office runs 24/7).
          </p>
        </div>
        <div className="btn-row no-print">
          <button className="btn btn--secondary btn--small" disabled={!r} onClick={() => r && exportReport(r, name)}>
            Export rooms CSV
          </button>
          <button
            className="btn btn--secondary btn--small"
            disabled={!r}
            onClick={() => r && exportCsv(`${name}-days.csv`, ['Day', 'Bookings', 'Hours'], r.byDay.map((d) => [d.day, d.count, d.hours]))}
          >
            Export days CSV
          </button>
          <button
            className="btn btn--secondary btn--small"
            disabled={!r}
            onClick={() =>
              r &&
              exportCsv(
                `${name}-summary.csv`,
                ['Figure', 'Value'],
                [
                  ...Object.entries(r.totals).map(([k, v]) => [k, k === 'utilisation' ? pct(v as number) : (v ?? '')] as [string, string | number]),
                  ...r.byStatus.map((s) => [`status: ${s.key}`, s.count] as [string, number]),
                  ...r.byAgendaType.map((s) => [`type: ${s.key}`, s.count] as [string, number]),
                  ...r.byDivision.map((s) => [`division: ${s.key}`, s.count] as [string, number]),
                ],
              )
            }
          >
            Export summary CSV
          </button>
          <button className="btn btn--secondary btn--small" onClick={() => window.print()}>
            Print / PDF
          </button>
        </div>
      </header>
      <div className="dt-toolbar no-print">
        <RangePicker value={range} onChange={setRange} presets={['today', 'week', 'lastWeek', 'next30', 'last30']} now={now} />
      </div>
      {tooLong && <div className="banner banner--error">Pick a range of up to 92 days.</div>}
      {error && <div className="banner banner--error">I can&apos;t load the report right now.</div>}
      {isLoading && <p className="card__meta">Loading…</p>}
      {r && (
        <>
          <div className="stats">
            <StatTile label="Bookings" value={r.totals.bookings} hint={`${r.totals.people} people`} />
            <StatTile label="Hours booked" value={r.totals.hours} />
            <StatTile label="Utilisation" value={pct(r.totals.utilisation)} hint="self-service rooms" />
            <StatTile label="Waiting for Admin" value={r.totals.waiting} tone={r.totals.waiting ? 'warn' : undefined} />
            <StatTile label="No-shows" value={r.totals.noShows} hint="not checked in 15 min after the start" tone={r.totals.noShows ? 'bad' : undefined} />
            <StatTile label="Cancelled" value={r.totals.cancelled} />
            <StatTile label="Checked in" value={r.totals.checkedIn} tone="good" />
            <StatTile label="Booked ahead" value={r.totals.avgLeadDays === null ? '—' : `${r.totals.avgLeadDays} d`} hint="average" />
          </div>
          <div className="chart-grid">
            <ColumnChart title="Bookings per day" points={r.byDay.map((d) => ({ label: fmtDay(d.day + 'T12:00:00+08:00').replace(/^\w+, /, ''), value: d.count }))} />
            <Donut title="By status" parts={r.byStatus.map((s) => ({ label: s.key, value: s.count, colour: STATUS_COLOURS[s.key] ?? 'var(--line)' }))} />
            <BarList
              title="Busiest rooms"
              note="hours booked"
              rows={r.byRoom
                .filter((x) => x.hours > 0)
                .slice(0, 10)
                .map((x) => ({ label: `${x.name}, ${x.floor}`, value: x.hours, detail: `${pct(x.utilisation)}${x.noShows ? ` · ${x.noShows} no-show${x.noShows === 1 ? '' : 's'}` : ''}` }))}
              unit=" h"
            />
            <BarList
              title="Least used rooms"
              note="self-service, hours booked"
              rows={r.byRoom
                .filter((x) => x.selfBookable)
                .reverse()
                .slice(0, 10)
                .map((x) => ({ label: `${x.name}, ${x.floor}`, value: x.hours }))}
              unit=" h"
            />
            <BarList title="By type of agenda" rows={r.byAgendaType.map((c) => ({ label: c.key, value: c.count, detail: `${c.hours} h` }))} />
            <BarList title="By floor" rows={r.byFloor.map((c) => ({ label: c.key, value: c.count, detail: `${c.hours} h · ${pct(c.utilisation)}` }))} />
            <BarList title="By division" rows={r.byDivision.map((c) => ({ label: c.key, value: c.count, detail: `${c.hours} h` }))} />
            <BarList title="Top requesters" rows={r.topRequesters.map((p) => ({ label: `${p.name}${p.division ? ` (${p.division})` : ''}`, value: p.count, detail: `${p.hours} h` }))} />
          </div>
          <Heatmap title="When rooms are busy" note="booked hours by weekday and hour" grid={r.heatmap} />
        </>
      )}
    </div>
  );
}
