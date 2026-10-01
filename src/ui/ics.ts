/** "Add to calendar" for Phase 1: an .ics file the user opens in Outlook (Outlook invites come in Phase 3). */

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);

export function icsFile(b: { ticketNo: string; agenda: string; start: string; end: string; location: string }, now: Date): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//REPH//Room Assistant//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${b.ticketNo}@reph-room-assistant`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(new Date(b.start))}`,
    `DTEND:${stamp(new Date(b.end))}`,
    `SUMMARY:${escape(b.agenda)}`,
    `LOCATION:${escape(b.location)}`,
    `DESCRIPTION:${escape(`Room booking ${b.ticketNo}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
