'use client';

/**
 * Map side of S1 (docs/spec/06-ui.md): floor tabs, time picker, a search that works without the assistant
 * (F11, POST /api/search), the floor map, legend, "Show as list" and the timeline.
 */
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { AgendaType } from '../domain/types';
import { useActions } from './actions';
import { ApiError } from './api';
import { FLOORS, FloorMap } from './FloorMap';
import { MapLegend } from './MapLegend';
import type { RoomState } from './roomStates';
import { useAppState, useDispatch, useNow, type Slot, type View } from './store';
import { DataTable } from './DataTable';
import { AGENDA_TYPES, TimeFields } from './TimeFields';
import { Timeline } from './Timeline';
import { useMapData } from './useMapData';

// three.js is only downloaded when someone opens the 3D view (docs/spec/09-quality.md, Performance budgets).
const Building3D = dynamic(() => import('./Building3D'), {
  ssr: false,
  loading: () => (
    <div className="building3d building3d--loading" role="status">
      Loading 3D view…
    </div>
  ),
});

const VIEW_KEY = 'reph-map-view';
const VIEWS: Array<{ id: View; label: string }> = [
  { id: '2d', label: '2D' },
  { id: '3d', label: '3D' },
  { id: 'table', label: 'Table' },
];

/** 2D / 3D / Table, remembered per browser (a convenience only; storage may be unavailable). */
function useView(): [View, (v: View) => void] {
  const { view } = useAppState();
  const dispatch = useDispatch();
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === '3d' || saved === 'table') dispatch({ type: 'view', view: saved });
    } catch {
      // private mode or blocked storage: keep 2D
    }
  }, [dispatch]);
  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_KEY, view);
    } catch {
      // ignore
    }
  }, [view]);
  return [view, (v: View) => dispatch({ type: 'view', view: v })];
}

function SearchControls({ slot }: { slot: Slot }) {
  const { mapSearch } = useActions();
  const state = useAppState();
  const [people, setPeople] = useState(state.results?.participants ?? 4);
  const [type, setType] = useState<AgendaType>(state.results?.agendaType ?? 'Meeting');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="slot-controls"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await mapSearch({ agendaType: type, participants: people, slot });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Search failed. Please try again.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="people">People</label>
        <input id="people" type="number" min={1} max={500} value={people} onChange={(e) => setPeople(Math.max(1, Number(e.target.value) || 1))} />
      </div>
      <div className="field">
        <label htmlFor="agenda-type">Type</label>
        <select id="agenda-type" value={type} onChange={(e) => setType(e.target.value as AgendaType)}>
          {AGENDA_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <button className="btn btn--small" type="submit" disabled={busy}>
        {busy ? 'Searching…' : 'Find rooms'}
      </button>
      {error && (
        <span className="search-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}

export function MapPanel() {
  const state = useAppState();
  const dispatch = useDispatch();
  const now = useNow();
  const map = useMapData();
  const [view, setView] = useView();
  const [pinned, setPinned] = useState<RoomState | null>(null);
  const [preview, setPreview] = useState<RoomState | null>(null);
  const highlight = preview ?? pinned;

  if (!state.slot) return <main className="mapside" id="map" aria-busy="true" />;

  const countFor = (floor: string) => {
    let n = 0;
    for (const r of map.rooms) {
      if (r.floor !== floor) continue;
      const s = map.statuses.get(r.id)?.state;
      if (state.results ? s === 'fits' : s === 'free') n++;
    }
    return n;
  };
  // Rooms per state among those drawn on the floor shown, for the legend.
  const counts: Partial<Record<RoomState, number>> | undefined = map.ready ? {} : undefined;
  if (counts) {
    for (const shape of FLOORS.find((f) => f.floor === state.floor)?.rooms ?? []) {
      const s = map.statuses.get(shape.roomId)?.state;
      if (s) counts[s] = (counts[s] ?? 0) + 1;
    }
  }
  const selected = state.selectedRoomId ? map.roomsById.get(state.selectedRoomId) : undefined;
  const selectedBusy = selected ? (map.busy.get(selected.id) ?? []) : null;
  const open = (roomId: string) => dispatch({ type: 'sheet', roomId });
  const r = state.results;

  return (
    <main className="mapside" id="map" aria-label="Floor map">
      <div className="searchbar" role="search" aria-label="Find a room on the map">
        <TimeFields slot={state.slot} onChange={(slot) => dispatch({ type: 'slot', slot })} />
        <SearchControls key={r ? `${r.agendaType}-${r.participants}` : 'none'} slot={state.slot} />
      </div>

      <div className="map-toolbar">
        <div className="floor-tabs" role="tablist" aria-label="Floors">
          {FLOORS.map((f) => {
            const active = f.floor === state.floor;
            return (
              <button key={f.floor} role="tab" aria-selected={active} className="floor-tab" onClick={() => dispatch({ type: 'floor', floor: f.floor })}>
                <span className="floor-tab__name">{f.floor}</span>
                <span className="floor-tab__count">{map.ready ? `${countFor(f.floor)} ${r ? 'fit' : 'free'}` : '…'}</span>
              </button>
            );
          })}
        </div>
        <div className="view-toggle" role="group" aria-label="Map view">
          {VIEWS.map((v) => (
            <button key={v.id} className="view-toggle__btn" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="map-toolbar__spacer" />
        {r ? (
          <span className={`search-note search-note--${r.flow}`} role="status">
            {r.flow === 'A' && (
              <>
                <strong>{r.results.filter((x) => x.availability === 'available').length} rooms fit</strong> · {r.participants} people
              </>
            )}
            {r.flow === 'B' && <strong>Only partly free</strong>}
            {r.flow === 'C' && <strong>All taken at this time</strong>}
            {r.flow === 'none' && <strong>No rooms of this type yet</strong>}{' '}
            <button className="btn btn--link btn--small" onClick={() => dispatch({ type: 'clear_results' })}>
              Clear
            </button>
          </span>
        ) : null}
      </div>
      {r?.warnings && r.warnings.length > 0 && <div className="banner banner--info">{r.warnings.join(' ')}</div>}
      {map.error && (
        <div className="banner banner--error" role="alert">
          <span className="banner__text">I can&apos;t reach the booking system right now. Try again in a minute.</span>
        </div>
      )}

      {view === 'table' ? (
        <div className="map-card map-card--table">
          <DataTable />
        </div>
      ) : (
        <div className="map-card">
          {view === '3d' ? (
            <Building3D floor={state.floor} rooms={map.roomsById} statuses={map.statuses} selectedRoomId={state.selectedRoomId} highlight={highlight} onOpen={open} />
          ) : (
            <FloorMap floor={state.floor} rooms={map.roomsById} statuses={map.statuses} selectedRoomId={state.selectedRoomId} slot={map.slot} highlight={highlight} onOpen={open} />
          )}
          <MapLegend counts={counts} pinned={pinned} onPin={setPinned} onPreview={setPreview} />
        </div>
      )}

      <Timeline slot={map.slot} busy={selectedBusy} roomName={selected ? `${selected.name}, ${selected.floor}` : undefined} now={now()} />
    </main>
  );
}
