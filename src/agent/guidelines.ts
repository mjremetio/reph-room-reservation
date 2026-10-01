import { RULES } from '../domain/rules';

/**
 * What the assistant knows from the Room Reservation Guidelines v3.0 (Corporate Services – Admin, January 2025),
 * in our own words, so it can answer "how do I…" and policy questions (docs/spec/05-agent.md, Guidelines knowledge).
 * The document is confidential: no names and no room mailbox addresses here. Numbers come from RULES so the
 * answers never drift from what the code enforces; contacts come from get_handoff (src/config/handoffs.ts).
 */
const shifts = RULES.trainingShifts.map((s) => s.label).join(', ');
const days = RULES.maxDaysAhead;
const approval = RULES.needsApproval.join(', ');

export const GUIDELINES = [
  'Room Reservation Guidelines (Corporate Services – Admin, v3.0, January 2025)',
  'Answer questions about how booking works from this section, in your own short words, and name the section when it helps, like "(guidelines 3.6)" or "(guidelines p.9)". Tools and tool results win if they disagree. Points marked "Admin is confirming" are still open.',
  '- Purpose: one systematic booking process, no overlapping or conflicting bookings, and no undocumented use of rooms. Scope: booking and using training and conference rooms. Not covered: game rooms, managers\' offices, training materials, hardware and software requests.',
  '- The Room Reservation Tool is the official record; it is opened in Google Chrome. Its reservation list can be searched by reservation date, type of agenda, site, building, room and employee name, and its calendar view shows each room\'s capacity. This app books into the same tool.',
  '- The form (3.5): agenda (the exact title of the meeting or training; "Meeting" or "Training" alone is rejected), type of agenda, priority, type of training, special instructions, number of participants, hardware, building, room, start and end, and an optional recurrence. Every field must be filled.',
  `- After submitting (3.5, and the room booking list): ${approval} bookings are "In Progress" until Admin approves them; Meeting and Lactation Room bookings are Approved at once. Other statuses: Checked-In, Cancelled, Completed.`,
  '- Which rooms each type of agenda can book (the room booking list): every room takes only its listed types and up to its capacity; list_rooms shows them (bookable_for). Meeting rooms also take Training; the training rooms take Training only; the halls take Multi-purpose only; the lactation room takes Lactation Room only; no room takes Pantry yet (contact Admin). A room with no types can\'t be booked.',
  '- Approved (3.7): the requestor gets an email with an .ics file. To put it in Outlook (3.8): open the .ics file and accept it, then use Respond > Forward to send it to every attendee.',
  `- How far ahead: meeting rooms up to ${days.Meeting} days (p.11; the form note says 90, Admin is confirming), training rooms and the multi-purpose hall up to ${days.Training} days.`,
  `- Training rooms must fit one shift: ${shifts} (p.11).`,
  '- Priority: Urgent only when training starts within two weeks, or a meeting within 12–24 business hours (form; Admin is confirming how business hours count in a 24/7 office). Otherwise Normal.',
  '- Recurrence (3.6): daily, weekly on chosen weekdays, monthly (a day of the month, or e.g. the third Thursday) or yearly, up to an end date. In the tool, an end date on a later day ticks Daily by itself; here the user picks the pattern.',
  `- Check-in (p.5–6): the REPH-MNL Room Reservation mailbox emails a reminder 1 hour before the start, and the requestor must check in before the start. This app opens check-in ${RULES.checkInOpensMinutesBefore} minutes before (Admin is confirming). Check in with check_in or from My bookings.`,
  `- A room not checked in or not used ${RULES.checkInGraceMinutes} minutes after the start is cancelled automatically and freed for others (p.6, p.11).`,
  '- Cancelling (3.9): in the tool, open the reservation with the edit icon and press Cancel Reservation; it leaves the list. Here: request_cancellation, or Cancel in My bookings. Cancel as soon as a meeting is called off or moved.',
  '- Meeting room reminders (p.11): book only when a dedicated room is really needed; match the room to the group (no big rooms for small groups, or the reverse); start and end on time and don\'t overrun; cancel on time.',
  '- Multi-purpose halls (p.10): MPH 1 and MPH 2, for town halls, training, team building, rehearsals and other REPH-wide events, always booked as Multi-purpose (list_rooms has their capacities). They need a specific agenda and the number of participants. When not reserved, they are used as hot desks.',
  '- BU visitor offices (p.11): the "Office for the Day" rooms 2F-024 to 2F-027 are full offices for visiting business units. Booked through Admin by email, not the tool (get_handoff visitor_office); onsite leaders also arrange them with Admin.',
  '- Equipment and setup (p.10): rooms support video calls. Extra equipment is requested in ServiceNow (get_handoff hardware); extra chairs or tables, sound systems or food go through the Non-Solus service desk (get_handoff room_setup).',
  '- Room types (p.8): meeting, collaboration, training (Snowdon is Training Room A, Denali Training Room B) and huddle rooms, plus the halls. Each room is VC (a room video-conference system) or BYOD (bring your own laptop). Use list_rooms for which room is which; never guess.',
  '- VC rooms (p.9): tap Join on the touch panel to start the meeting. If the meeting doesn\'t show, the room must be invited as an attendee in the Outlook invite. To share a laptop screen, join the same meeting on the laptop and choose "Don\'t use audio", then press the Share content icon in the meeting on the laptop (not on the touch panel). Mute or unmute with the Mute icon on the touch panel. The remote control is kept by the lobby guard.',
  '- BYOD rooms (p.9): plug the docking station\'s USB cable into the laptop to extend to the room screen; the dock\'s USB and HDMI cables must be connected.',
  '- Each room shows a QR code for the Conference Room Toolkit app (corporate phones only): report a problem, book a room, open the room guide. Still stuck with the room\'s equipment: get_handoff it_support.',
].join('\n');
