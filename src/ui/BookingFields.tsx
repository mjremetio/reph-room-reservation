'use client';

/**
 * The Room Reservation Tool's reservation form, kept to what the user decides (docs/spec/06-ui.md, Reservation form):
 * Name of Requestor (Division under it), Agenda, Type of Agenda, Priority, Type of Training (training only), People,
 * Room (New booking only), Starts at, Ends at, Repeat (recurrence), Special Instructions, Hardware. The tool's
 * read-only fields (ticket, building, status, admin comments, modified by) show in Booking details instead.
 * Used by the room sheet (room fixed) and New booking (room chosen or found).
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { HANDOFFS } from '../config/handoffs';
import { HARDWARE_OPTIONS } from '../config/hardware';
import { toRecurrenceJson, WEEK_OF_MONTH, WEEKDAYS, type Recurrence, type Weekday, type WeekOfMonth } from '../domain/recurrence';
import { checkAgendaTitle, urgentAllowed, type FormField } from '../domain/rules';
import { addMinutes, manilaMinuteOfDay, manilaStartOfDay } from '../domain/time';
import type { AgendaType, Priority, TrainingType } from '../domain/types';
import { ApiError, useRooms, type BookingRequest, type RoomView } from './api';
import { useMe } from './session';
import { useNow, type Slot } from './store';
import { AGENDA_TYPES, TimeFields } from './TimeFields';

type Freq = Recurrence['freq'];

export interface Draft {
  agenda: string;
  agendaType: AgendaType;
  participants: number;
  priority: Priority;
  trainingType: TrainingType;
  specialInstructions: string;
  /** '' = none. */
  hardware: string;
  /** '' = let the app find the best room (New booking). */
  roomId: string;
  /** Starts at / Ends at. With `repeat`, the Ends at date is the series' last date. */
  slot: Slot;
  repeat: boolean;
  freq: Freq;
  every: number;
  days: Weekday[];
  monthly: 'day' | 'nth';
  monthDay: number;
  monthWeek: WeekOfMonth;
  monthWeekday: Weekday;
}

const MANILA_MS = 8 * 3_600_000;
const localDay = (d: Date) => new Date(d.getTime() + MANILA_MS);
const weekdayOf = (d: Date) => WEEKDAYS[localDay(d).getUTCDay()] as Weekday;
const weekOfMonth = (d: Date) => WEEK_OF_MONTH[Math.min(3, Math.floor((localDay(d).getUTCDate() - 1) / 7))] as WeekOfMonth;

export function useDraft(init: Pick<Draft, 'agendaType' | 'participants' | 'slot'> & { roomId?: string }): [Draft, (patch: Partial<Draft>) => void] {
  const start = new Date(init.slot.start);
  const [draft, setDraft] = useState<Draft>({
    agenda: '',
    priority: 'Normal',
    trainingType: 'On-Site',
    specialInstructions: '',
    hardware: '',
    roomId: init.roomId ?? '',
    repeat: false,
    freq: 'Weekly',
    every: 1,
    days: [weekdayOf(start)],
    monthly: 'day',
    monthDay: localDay(start).getUTCDate(),
    monthWeek: weekOfMonth(start),
    monthWeekday: weekdayOf(start),
    ...init,
  });
  return [draft, (patch) => setDraft((d) => ({ ...d, ...patch }))];
}

/** The first date's times (a repeating booking's Ends at date is the last date, not the end of the first). */
export function firstDate(d: Draft): Slot {
  if (!d.repeat) return d.slot;
  const s = new Date(d.slot.start);
  const e = new Date(d.slot.end);
  let end = addMinutes(manilaStartOfDay(s), manilaMinuteOfDay(e));
  if (end <= s) end = addMinutes(end, 24 * 60); // a night shift ends the next morning
  return { start: d.slot.start, end: end.toISOString() };
}

function recurrenceOf(d: Draft): Recurrence | undefined {
  if (!d.repeat) return undefined;
  const until = new Date(d.slot.end);
  if (d.freq === 'Weekly') return { freq: 'Weekly', every: d.every, days: d.days, until };
  if (d.freq === 'Monthly') return { freq: 'Monthly', every: d.every, on: d.monthly === 'day' ? { day: d.monthDay } : { week: d.monthWeek, weekday: d.monthWeekday }, until };
  return { freq: d.freq, every: d.every, until };
}

export function toRequest(d: Draft, roomId: string, at: Slot = firstDate(d)): BookingRequest {
  const recurrence = recurrenceOf(d);
  return {
    roomId,
    agendaType: d.agendaType,
    agenda: d.agenda.trim(),
    participants: d.participants,
    priority: d.priority,
    trainingType: d.trainingType,
    specialInstructions: d.specialInstructions.trim() || undefined,
    hardwareRequirements: d.hardware ? [d.hardware] : undefined,
    recurrence: recurrence ? toRecurrenceJson(recurrence) : undefined,
    start: new Date(at.start),
    end: new Date(at.end),
  };
}

function Radios<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  disabled,
  hint,
  invalid,
}: {
  name: string;
  legend: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  disabled?: (v: T) => boolean;
  /** Shown on hover (the rule behind a disabled option), not as text. */
  hint?: string;
  invalid?: boolean;
}) {
  return (
    <fieldset className={`bf-radios${invalid ? ' is-invalid' : ''}`} title={hint}>
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={o}>
          <input type="radio" name={name} value={o} checked={value === o} disabled={disabled?.(o)} onChange={() => onChange(o)} />
          {o}
        </label>
      ))}
    </fieldset>
  );
}

/** A form error: the message for the alert and the fields to mark red (docs/spec/06-ui.md, Form errors). */
export interface FormError {
  message: string;
  fields: FormField[];
}

/** What the browser can check before asking the server: a specific agenda (the same domain rule). */
export function precheckBooking(draft: Draft): FormError | null {
  const agenda = checkAgendaTitle(draft.agenda);
  return agenda ? { message: agenda.message, fields: ['agenda'] } : null;
}

/** An API failure as a form error: every problem in the message, the server's fields marked. */
export function formErrorOf(err: unknown, fallback = 'That did not go through. Please try again.'): FormError {
  if (err instanceof ApiError) return { message: [err.message, ...(err.problems ?? []).slice(1)].join(' '), fields: err.fields ?? [] };
  return { message: fallback, fields: [] };
}

/** The error alert under the form: red border, icon and every problem. */
export function FormErrorBox({ error }: { error: FormError | null }) {
  if (!error) return null;
  return (
    <div className="form-error" role="alert">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <circle cx="9" cy="9" r="8" fill="currentColor" />
        <path d="M9 4.8v5M9 12.6v.1" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span>{error.message}</span>
    </div>
  );
}

/** The tool's "Name of Requestor" and Division: the signed-in person, read-only (no picking someone else). */
function RequestorLine() {
  const me = useMe();
  return (
    <div className="requestor-line">
      <span className="requestor-line__label">Name of requestor</span>
      <strong>{me.name}</strong>
      {me.division && <span className="bf-help">Division: {me.division}</span>}
    </div>
  );
}

export function BookingFields({
  draft,
  onChange,
  room,
  agendaRef,
  invalid = [],
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  /** The room sheet's room (fixed); undefined in New booking, where the room can be chosen. */
  room?: RoomView;
  agendaRef?: RefObject<HTMLInputElement | null>;
  /** Fields to mark red (from precheckBooking or the server's error). */
  invalid?: FormField[];
}) {
  const bad = (f: FormField) => invalid.includes(f) || undefined;
  const layout = useRef<HTMLDivElement>(null);
  // Bring the first wrong field into view and focus it.
  useEffect(() => {
    const el = layout.current?.querySelector<HTMLElement>('[aria-invalid="true"], .is-invalid input');
    el?.focus();
  }, [invalid]);
  const { data: rooms } = useRooms();
  const now = useNow();
  const first = firstDate(draft);
  const urgentOk = urgentAllowed(draft.agendaType, new Date(first.start), now());
  // The owner's room booking list: a room offers only its Types of agenda (src/data/rooms.ts, `agendas`).
  const suits = (t: AgendaType) => !room || room.agendas.includes(t);
  const choices = (rooms ?? [])
    .filter((r) => r.selfBookable && r.agendas.includes(draft.agendaType))
    .sort((a, b) => a.floor.localeCompare(b.floor) || a.name.localeCompare(b.name));

  const setType = (agendaType: AgendaType) =>
    onChange({
      agendaType,
      ...(urgentAllowed(agendaType, new Date(first.start), now()) ? {} : { priority: 'Normal' as const }),
      ...(draft.roomId && !choices.some((r) => r.id === draft.roomId) ? { roomId: '' } : {}),
    });
  const setRepeat = (repeat: boolean) => {
    // Ticking Recurrence turns the Ends at date into the series' last date (four weeks out); unticking brings it back.
    const s = new Date(draft.slot.start);
    const f = firstDate(draft);
    const endMinute = manilaMinuteOfDay(new Date(f.end));
    const end = repeat ? addMinutes(manilaStartOfDay(addMinutes(s, 28 * 24 * 60)), endMinute) : new Date(f.end);
    onChange({ repeat, slot: { start: draft.slot.start, end: end.toISOString() } });
  };

  // Two groups: they stack in a side sheet and sit side by side in the wide New booking modal. Only what the user
  // decides is shown; read-only tool fields (ticket, status, admin comments) appear in Booking details.
  return (
    <div className="bf-layout" ref={layout}>
      <div className="bf-group">
        <RequestorLine />
        <label>
          Agenda
          <input
            ref={agendaRef}
            required
            maxLength={200}
            aria-invalid={bad('agenda')}
            value={draft.agenda}
            onChange={(e) => onChange({ agenda: e.target.value })}
            placeholder="Specific title, e.g. Q4 pipeline review"
          />
        </label>
        <Radios name="agendaType" legend="Type of agenda" options={AGENDA_TYPES} value={draft.agendaType} onChange={setType} disabled={(t) => !suits(t)} />
        <Radios
          name="priority"
          legend="Priority"
          options={['Normal', 'Urgent'] as const}
          value={draft.priority}
          onChange={(priority) => onChange({ priority })}
          disabled={(p) => p === 'Urgent' && !urgentOk}
          invalid={bad('priority')}
          hint="Urgent: training within two weeks, or a meeting within 24 hours"
        />
        {draft.agendaType === 'Training' && (
          <Radios name="trainingType" legend="Type of training" options={['On-Site', 'Virtual'] as const} value={draft.trainingType} onChange={(trainingType) => onChange({ trainingType })} />
        )}
      </div>
      <div className="bf-group">
        <div className={room ? undefined : 'form-row'}>
          <label>
            People
            <input type="number" required min={1} max={500} aria-invalid={bad('participants')} value={draft.participants} onChange={(e) => onChange({ participants: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          {!room && (
            <label>
              Room
              <select value={draft.roomId} aria-invalid={bad('room')} onChange={(e) => onChange({ roomId: e.target.value })}>
                <option value="">Best fit</option>
                {choices.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.floor}
                    {r.capacity ? ` · ${r.capacity}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="bf-time">
          <TimeFields slot={draft.slot} onChange={(slot) => onChange({ slot })} series={draft.repeat} invalid={!!bad('time')} />
        </div>
        <fieldset className={`bf-recurrence${bad('recurrence') ? ' is-invalid' : ''}`}>
          <label className="bf-check">
            <input type="checkbox" checked={draft.repeat} onChange={(e) => setRepeat(e.target.checked)} />
            Repeat
          </label>
          {draft.repeat && (
            <>
              <Radios name="freq" legend="Every" options={['Daily', 'Weekly', 'Monthly', 'Yearly'] as const} value={draft.freq} onChange={(freq) => onChange({ freq })} />
              <label className="bf-inline">
                Every
                <input type="number" min={1} max={99} value={draft.every} onChange={(e) => onChange({ every: Math.max(1, Number(e.target.value) || 1) })} />
                {({ Daily: 'day(s)', Weekly: 'week(s)', Monthly: 'month(s)', Yearly: 'year(s)' } as const)[draft.freq]}
              </label>
              {draft.freq === 'Weekly' && (
                <fieldset className="bf-radios bf-days">
                  <legend>On</legend>
                  {WEEKDAYS.map((w) => (
                    <label key={w} title={w}>
                      <input
                        type="checkbox"
                        aria-label={w}
                        checked={draft.days.includes(w)}
                        onChange={(e) => onChange({ days: e.target.checked ? [...draft.days, w] : draft.days.filter((x) => x !== w) })}
                      />
                      {w.slice(0, 3)}
                    </label>
                  ))}
                </fieldset>
              )}
              {draft.freq === 'Monthly' && (
                <fieldset className="bf-radios bf-monthly">
                  <label>
                    <input type="radio" name="monthly" checked={draft.monthly === 'day'} onChange={() => onChange({ monthly: 'day' })} />
                    Day
                    <input type="number" min={1} max={31} value={draft.monthDay} onChange={(e) => onChange({ monthly: 'day', monthDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
                  </label>
                  <label>
                    <input type="radio" name="monthly" checked={draft.monthly === 'nth'} onChange={() => onChange({ monthly: 'nth' })} />
                    The
                    <select value={draft.monthWeek} onChange={(e) => onChange({ monthly: 'nth', monthWeek: e.target.value as WeekOfMonth })}>
                      {WEEK_OF_MONTH.map((w) => (
                        <option key={w}>{w}</option>
                      ))}
                    </select>
                    <select value={draft.monthWeekday} onChange={(e) => onChange({ monthly: 'nth', monthWeekday: e.target.value as Weekday })}>
                      {WEEKDAYS.map((w) => (
                        <option key={w}>{w}</option>
                      ))}
                    </select>
                  </label>
                </fieldset>
              )}
              <span className="bf-help">Ends at is the last date.</span>
            </>
          )}
        </fieldset>
        <label>
          <span>
            Special instructions <span className="bf-optional">(optional)</span>
          </span>
          <input maxLength={500} value={draft.specialInstructions} onChange={(e) => onChange({ specialInstructions: e.target.value })} placeholder="Anything Admin should know" />
        </label>
        <label>
          <span>
            Hardware <span className="bf-optional">(optional)</span>
          </span>
          <select value={draft.hardware} aria-invalid={bad('hardware')} onChange={(e) => onChange({ hardware: e.target.value })}>
            <option value="">None</option>
            {HARDWARE_OPTIONS.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
          <span className="bf-help">
            Also file it in{' '}
            <a href={HANDOFFS.hardware.link} target="_blank" rel="noreferrer">
              ServiceNow
            </a>{' '}
            · Room setup:{' '}
            <a href={HANDOFFS.room_setup.link} target="_blank" rel="noreferrer">
              Non-Solus
            </a>
          </span>
        </label>
      </div>
    </div>
  );
}
