import type { Room, RoomRequest } from './types';

/** Someone can book this room in the app: self-service, with at least one Type of agenda (src/data/rooms.ts). */
export const bookable = (room: Pick<Room, 'selfBookable' | 'agendas'>): boolean => room.selfBookable && room.agendas.length > 0;

export type Fit = 'right size' | 'roomy' | 'oversized' | 'unknown size';

export interface Scored {
  room: Room;
  score: number;
  fit: Fit;
  reasons: string[];
}

/**
 * Scores one room for a request, or returns null if it cannot host it.
 * Right-sizing follows the guidelines' "optimize room occupancy" reminder (p.11).
 * Availability is checked separately (availability.ts).
 */
export function scoreRoom(room: Room, req: RoomRequest, walkSeconds?: number): Scored | null {
  if (!room.selfBookable || room.site !== req.site) return null;
  // The owner's room booking list: only the room's Types of agenda, up to its capacity (rules.ts, roomIssues).
  if (!room.agendas.includes(req.agendaType)) return null;
  if (room.capacity !== null && room.capacity < req.participants) return null;

  let score = 100;
  let fit: Fit;
  const reasons: string[] = [];
  if (room.capacity === null) {
    score -= 25;
    fit = 'unknown size';
    reasons.push('capacity not on file');
  } else {
    const spare = room.capacity - req.participants;
    const spareRatio = spare / room.capacity;
    if (spare <= 1) {
      fit = 'right size';
      reasons.push('right size');
    } else if (spareRatio <= 0.5) {
      fit = 'roomy';
      score -= spareRatio * 30;
      reasons.push(`${spare} spare seats`);
    } else {
      fit = 'oversized';
      score -= 30 + spareRatio * 30;
      reasons.push(`seats ${room.capacity}, much bigger than needed`);
    }
  }
  if (req.needsVC) {
    if (room.av === 'VC') {
      reasons.push('has video conferencing');
    } else {
      score -= 20;
      reasons.push('no video conferencing kit');
    }
  }
  if (walkSeconds !== undefined) {
    score -= Math.min(30, walkSeconds / 10);
    reasons.push(walkSeconds < 60 ? 'under 1 min away' : `about ${Math.round(walkSeconds / 60)} min away`);
  }
  return { room, score: Math.round(score * 10) / 10, fit, reasons };
}

/** Rooms that can host the request, best first. Pass walking times once routing exists (Phase 2). */
export function rankRooms(rooms: Room[], req: RoomRequest, walkSecondsTo?: (roomId: string) => number | undefined): Scored[] {
  return rooms
    .map((r) => scoreRoom(r, req, walkSecondsTo?.(r.id)))
    .filter((s): s is Scored => s !== null)
    .sort((a, b) => b.score - a.score || a.room.name.localeCompare(b.room.name));
}
