'use client';

/**
 * S20 Admin rooms (docs/spec/06-ui.md): every room with its details and Admin's data notes. Open one to change its
 * name, seats (blank = not known), equipment, whether people can book it themselves, and the notes. The map and the
 * assistant use the new details at once. The room's place on the floor plan is not edited here.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi, type AdminRoomView } from '../api';
import { Sheet } from '../Sheet';
import { DataGrid, type Column } from '../table/DataGrid';
import { useAdminAction } from './shared';

const AV_WORDS: Record<string, string> = { VC: 'Video conferencing', BYOD: 'BYOD dock' };

function RoomEdit({ room, onClose }: { room: AdminRoomView; onClose: () => void }) {
  const [name, setName] = useState(room.name);
  const [capacity, setCapacity] = useState(room.capacity === null ? '' : String(room.capacity));
  const [av, setAv] = useState<string>(room.av ?? '');
  const [selfBookable, setSelfBookable] = useState(room.selfBookable);
  const [notes, setNotes] = useState(room.notes ?? '');
  const [saved, setSaved] = useState(false);
  const action = useAdminAction();
  const save = async () => {
    const seats = capacity.trim() === '' ? null : Number(capacity);
    if (seats !== null && (!Number.isInteger(seats) || seats < 1)) return action.setError('Seats must be a whole number of at least 1, or blank when not known.');
    const res = await action.run(() =>
      adminApi.editRoom(room.id, { name: name.trim(), capacity: seats, av: (av || null) as 'VC' | 'BYOD' | null, selfBookable, notes: notes.trim() || null }),
    );
    if (res) setSaved(true);
  };
  return (
    <Sheet title={room.name} subtitle={`${room.floor} · ${room.kind} · ${room.id}`} onClose={onClose}>
      {saved && (
        <div className="banner banner--info" role="status">
          Saved. The map, tables and assistant use it now.
        </div>
      )}
      <form
        className="form-grid"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Seats (blank = not known)
          <input type="number" min={1} max={500} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </label>
        <label>
          Equipment
          <select value={av} onChange={(e) => setAv(e.target.value)}>
            <option value="">None</option>
            <option value="VC">Video conferencing</option>
            <option value="BYOD">BYOD dock (USB and HDMI)</option>
          </select>
        </label>
        <label className="dt-check">
          <input type="checkbox" checked={selfBookable} onChange={(e) => setSelfBookable(e.target.checked)} />
          People can book it themselves (off = through Admin only)
        </label>
        <label>
          Notes for Admin (people don&apos;t see these)
          <textarea rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {action.error && <div className="error-line">{action.error}</div>}
        <div className="btn-row">
          <button className="btn btn--primary btn--small" type="submit" disabled={action.working}>
            {action.working ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn--secondary btn--small" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function AdminRooms() {
  const { data: rooms = [], isLoading, error } = useQuery({ queryKey: ['admin', 'rooms'], queryFn: adminApi.rooms });
  const [open, setOpen] = useState<AdminRoomView | null>(null);
  const columns: Column<AdminRoomView>[] = [
    { key: 'name', label: 'Room', value: (r) => r.name, render: (r) => <strong>{r.name}</strong> },
    { key: 'floor', label: 'Floor', value: (r) => r.floor },
    { key: 'kind', label: 'Type', value: (r) => r.kind },
    { key: 'av', label: 'Equipment', value: (r) => (r.av ? AV_WORDS[r.av] ?? r.av : '') },
    { key: 'capacity', label: 'Seats', value: (r) => r.capacity, className: 'dt-num', render: (r) => r.capacity ?? <span className="admin-warn">Not known</span> },
    { key: 'self', label: 'Booking', value: (r) => (r.selfBookable ? 'Self-service' : 'Admin only') },
    { key: 'notes', label: 'Notes', value: (r) => r.notes ?? '', render: (r) => <span className="dt-muted">{r.notes ?? ''}</span> },
  ];
  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <h1>Rooms</h1>
        <p className="card__meta">Room details from the tool&apos;s room list. Seats marked &quot;Not known&quot; need the real number.</p>
      </header>
      {error && <div className="banner banner--error">I can&apos;t load the rooms right now.</div>}
      <DataGrid rows={rooms} columns={columns} rowKey={(r) => r.id} noun="rooms" defaultSort={{ key: 'floor', dir: 'asc' }} loading={isLoading} onRowClick={setOpen} exportName="rooms" />
      {open && <RoomEdit room={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
