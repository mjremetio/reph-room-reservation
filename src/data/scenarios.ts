import demoJson from '../../data/scenarios/demo.json';
import emptyJson from '../../data/scenarios/empty.json';
import { conflictsFor } from '../domain/availability';
import { manilaStartOfWeek } from '../domain/time';
import type { AgendaType, Booking, BookingStatus, Person } from '../domain/types';
import { ROOMS } from './rooms';

/** A fixed data set for demos and tests. People are placeholders; capacities here are demo values only. */
export interface Scenario {
  name: string;
  description: string;
  /** Suggested clock start (set DEMO_NOW to this). */
  now: Date;
  demoUser: Person & { email: string };
  /** Demo capacities for rooms whose real capacity is unknown. Real known capacities always win. */
  capacityOverrides: Record<string, number>;
  people: Array<Person & { email: string }>;
  bookings: Booking[];
}

interface RawScenario {
  name: string;
  description: string;
  now: string;
  demoUser: { name: string; email: string; division?: string };
  capacityOverrides: Record<string, number>;
  people: Array<{ name: string; email: string; division?: string }>;
  bookings: Array<{
    ticketNo: string;
    roomId: string;
    start: string;
    end: string;
    status: string;
    agenda: string;
    agendaType: string;
    participants: number;
    /** Email of someone in `people`. */
    owner: string;
  }>;
}

const STATUSES: readonly BookingStatus[] = ['Held', 'In Progress', 'Approved', 'Checked-In', 'Completed', 'Cancelled'];
const AGENDA_TYPES: readonly AgendaType[] = ['Meeting', 'Training', 'Pantry', 'Lactation Room', 'Multi-purpose'];

function toDate(value: string, where: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`${where}: invalid date "${value}"`);
  return d;
}

/** Parses and validates a scenario. Throws with a clear message if the data breaks a rule. */
export function parseScenario(raw: RawScenario): Scenario {
  const where = `Scenario "${raw.name}"`;
  const roomIds = new Set(ROOMS.map((r) => r.id));
  const people = new Map(raw.people.map((p) => [p.email.toLowerCase(), p] as const));
  const tickets = new Set<string>();

  for (const id of Object.keys(raw.capacityOverrides)) {
    if (!roomIds.has(id)) throw new Error(`${where}: capacityOverrides has unknown room "${id}"`);
  }

  const bookings: Booking[] = raw.bookings.map((b) => {
    const at = `${where}, ${b.ticketNo}`;
    if (tickets.has(b.ticketNo)) throw new Error(`${at}: duplicate ticket number`);
    tickets.add(b.ticketNo);
    if (!roomIds.has(b.roomId)) throw new Error(`${at}: unknown room "${b.roomId}"`);
    if (!STATUSES.includes(b.status as BookingStatus)) throw new Error(`${at}: unknown status "${b.status}"`);
    if (!AGENDA_TYPES.includes(b.agendaType as AgendaType)) throw new Error(`${at}: unknown agenda type "${b.agendaType}"`);
    const owner = people.get(b.owner.toLowerCase());
    if (!owner) throw new Error(`${at}: owner "${b.owner}" is not in people`);
    const start = toDate(b.start, at);
    const end = toDate(b.end, at);
    if (end.getTime() <= start.getTime()) throw new Error(`${at}: end must be after start`);
    if (!Number.isInteger(b.participants) || b.participants < 1) throw new Error(`${at}: participants must be a positive whole number`);
    return {
      ticketNo: b.ticketNo,
      roomId: b.roomId,
      start,
      end,
      status: b.status as BookingStatus,
      agenda: b.agenda,
      agendaType: b.agendaType as AgendaType,
      participants: b.participants,
      owner: { ...owner },
    };
  });

  const now = toDate(raw.now, where);
  for (const b of bookings) {
    const clash = conflictsFor(b.roomId, b, bookings.filter((x) => x !== b), now);
    if (clash.length > 0 && clash[0] && b.status !== 'Cancelled') {
      throw new Error(`${where}: ${b.ticketNo} overlaps ${clash[0].ticketNo} in ${b.roomId}`);
    }
  }

  return {
    name: raw.name,
    description: raw.description,
    now,
    demoUser: { ...raw.demoUser },
    capacityOverrides: { ...raw.capacityOverrides },
    people: raw.people.map((p) => ({ ...p })),
    bookings,
  };
}

export const DEMO_SCENARIO: Scenario = parseScenario(demoJson);

/** No bookings, and the sign-in accounts as the people (MOCK_SCENARIO=empty): the app as people really use it. */
export const EMPTY_SCENARIO: Scenario = parseScenario(emptyJson);

const WEEK_MS = 7 * 24 * 3_600_000;

/**
 * The scenario moved by whole weeks into the Manila week of `now`, so with the real clock (no DEMO_NOW) the demo
 * bookings fall on this week's days at the same weekday and time instead of staying in the past.
 */
export function scenarioInWeekOf(s: Scenario, now: Date): Scenario {
  const weeks = Math.round((manilaStartOfWeek(now).getTime() - manilaStartOfWeek(s.now).getTime()) / WEEK_MS);
  if (weeks === 0) return s;
  const move = (d: Date) => new Date(d.getTime() + weeks * WEEK_MS);
  return { ...s, now: move(s.now), bookings: s.bookings.map((b) => ({ ...b, start: move(b.start), end: move(b.end) })) };
}
