'use client';

/**
 * S16 Admin bookings (docs/spec/06-ui.md): every booking in a range with all fields. Filter, search, sort, page,
 * approve the selected requests at once, export CSV (all filtered rows or the selected ones), open one to act on it,
 * block rooms for a time or book several at once (AdminBlockBulk).
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { adminApi, type AdminBooking } from '../api';
import { fmtTool, fmtToolDate, fmtWhen } from '../format';
import { DataGrid, type Column } from '../table/DataGrid';
import { AGENDA_TYPES } from '../TimeFields';
import { BlockRoomsSheet, BulkBookingSheet } from './AdminBlockBulk';
import { AdminBookingSheet } from './AdminBookingSheet';
import { RangePicker, StatusChip, useAdminAction, useRange } from './shared';

const STATUSES = ['In Progress', 'Approved', 'Checked-In', 'Completed', 'Cancelled', 'Blocked'] as const;

export function AdminBookings() {
  const [range, setRange, now] = useRange('next7');
  const [status, setStatus] = useState('');
  const [floor, setFloor] = useState('');
  const [type, setType] = useState('');
  const [open, setOpen] = useState<AdminBooking | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tool, setTool] = useState<'block' | 'bulk' | null>(null);
  const bulk = useAdminAction();
  const bookings = useQuery({
    queryKey: ['admin', 'bookings', range.from.toISOString(), range.to.toISOString(), status],
    queryFn: () => adminApi.bookings(range.from, range.to, status || undefined),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });
  const { data: rooms = [] } = useQuery({ queryKey: ['admin', 'rooms'], queryFn: adminApi.rooms });
  const room = (id: string) => rooms.find((r) => r.id === id);
  const rows = useMemo(
    () => (bookings.data ?? []).filter((b) => (!floor || room(b.roomId)?.floor === floor) && (!type || b.agendaType === type)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings.data, floor, type, rooms],
  );

  const columns: Column<AdminBooking>[] = [
    { key: 'ticket', label: 'Ticket No', value: (b) => b.ticketNo, className: 'dt-mono' },
    { key: 'start', label: 'Starts at', value: (b) => b.start, csv: (b) => fmtTool(b.start), render: (b) => <span className="dt-time">{fmtWhen(b.start, b.end)}</span> },
    { key: 'end', label: 'Ends at', value: (b) => b.end, csv: (b) => fmtTool(b.end), csvOnly: true },
    { key: 'room', label: 'Room', value: (b) => (room(b.roomId) ? `${room(b.roomId)?.name}, ${room(b.roomId)?.floor}` : b.roomId) },
    { key: 'owner', label: 'Name of requestor', value: (b) => b.owner, render: (b) => <>{b.owner}{b.division && <span className="dt-muted"> · {b.division}</span>}</> },
    { key: 'email', label: 'E-mail', value: (b) => b.ownerEmail, csvOnly: true },
    { key: 'division', label: 'Division', value: (b) => b.division, csvOnly: true },
    { key: 'agenda', label: 'Agenda', value: (b) => b.agenda ?? '' },
    { key: 'type', label: 'Type', value: (b) => b.agendaType ?? '' },
    {
      key: 'people',
      label: 'People',
      value: (b) => b.participants,
      className: 'dt-num',
      render: (b) => {
        const cap = room(b.roomId)?.capacity;
        return cap && b.participants > cap ? <span className="admin-warn" title={`The room seats ${cap}`}>{b.participants} / {cap}</span> : b.participants;
      },
    },
    { key: 'priority', label: 'Priority', value: (b) => b.priority ?? 'Normal', render: (b) => (b.priority === 'Urgent' ? <span className="dt-chip dt-chip--taken">Urgent</span> : 'Normal') },
    { key: 'status', label: 'Status', value: (b) => b.status, render: (b) => <StatusChip status={b.status} /> },
    { key: 'filed', label: 'Created date', value: (b) => (b.createdAt ? fmtToolDate(b.createdAt) : null) },
    { key: 'comments', label: 'Admin comments', value: (b) => b.adminComments ?? '', render: (b) => <span className="dt-muted">{b.adminComments ?? ''}</span> },
  ];

  const approveSelected = async (selected: AdminBooking[], clear: () => void) => {
    const res = await bulk.run(() => adminApi.approveMany(selected.map((b) => b.ticketNo)));
    if (!res) return;
    clear();
    setNotice(
      `Approved ${res.approved.length} request${res.approved.length === 1 ? '' : 's'}.${res.failed.length ? ` Not approved: ${res.failed.map((f) => `${f.ticketNo} (${f.message})`).join('; ')}` : ''}`,
    );
  };

  return (
    <div className="admin-page">
      <header className="admin-page__head admin-page__head--row">
        <div>
          <h1>Bookings</h1>
          <p className="card__meta">Every reservation with all its fields. Open one to approve, change, swap, cancel or message its owner, or to lift a room block.</p>
        </div>
        <div className="btn-row">
          <button className="btn btn--secondary btn--small" onClick={() => setTool('block')} disabled={rooms.length === 0}>
            Block rooms…
          </button>
          <button className="btn btn--primary btn--small" onClick={() => setTool('bulk')} disabled={rooms.length === 0}>
            Bulk booking…
          </button>
        </div>
      </header>
      {notice && (
        <div className="banner banner--info" role="status">
          {notice}
        </div>
      )}
      {(bulk.error || bookings.error) && <div className="banner banner--error">{bulk.error ?? "I can't load the bookings right now."}</div>}
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(b) => b.ticketNo}
        noun="bookings"
        defaultSort={{ key: 'start', dir: 'asc' }}
        loading={bookings.isLoading}
        onRowClick={setOpen}
        selection={(b) => b.status === 'In Progress'}
        exportName={`bookings-${fmtToolDate(range.from)}`}
        actions={(selected, clear) => (
          <button className="btn btn--primary btn--small" disabled={bulk.working} onClick={() => void approveSelected(selected, clear)}>
            {bulk.working ? 'Approving…' : `Approve selected (${selected.length})`}
          </button>
        )}
        filters={
          <>
            <RangePicker value={range} onChange={setRange} presets={['today', 'week', 'next7', 'next30', 'lastWeek', 'last30']} now={now} />
            <label className="dt-field">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === 'In Progress' ? 'Waiting for Admin' : s}
                  </option>
                ))}
              </select>
            </label>
            <label className="dt-field">
              Floor
              <select value={floor} onChange={(e) => setFloor(e.target.value)}>
                <option value="">All</option>
                <option>2F</option>
                <option>3F</option>
              </select>
            </label>
            <label className="dt-field">
              Type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All</option>
                {AGENDA_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </>
        }
      />
      {open && <AdminBookingSheet booking={open} rooms={rooms} others={bookings.data ?? []} onClose={() => setOpen(null)} />}
      {tool === 'block' && <BlockRoomsSheet rooms={rooms} onClose={() => setTool(null)} />}
      {tool === 'bulk' && <BulkBookingSheet rooms={rooms} onClose={() => setTool(null)} />}
    </div>
  );
}
