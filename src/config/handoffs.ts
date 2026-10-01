/**
 * Requests the assistant must hand off instead of booking.
 * Source: Room Reservation Guidelines v3.0 (p.6, p.9, p.10, p.11) and the reservation form. Keep in sync with Admin.
 */
export const HANDOFFS = {
  visitor_office: {
    label: 'BU visitor offices (2F-024 to 2F-027) are booked through Admin. Email REPH-MNLAdmin@ReedElsevier.com.',
    link: 'mailto:REPH-MNLAdmin@ReedElsevier.com',
  },
  hardware: {
    label: 'Extra equipment is requested through ServiceNow.',
    link: 'https://reedelsevier.service-now.com/navpage.do',
  },
  room_setup: {
    label: 'Room setup (chairs, tables, sound, food) is requested through the Non-Solus service desk.',
    link: 'https://nonsolus.science.regn.net/facilities/servicedesk/index.asp',
  },
  /** The IT line printed on the room guides (p.9). */
  it_support: {
    label: "For help with a room's video conference or screen, call IT on +63 2 8273 2900, option 5.",
    link: 'tel:+63282732900',
  },
} as const;

export type HandoffTopic = keyof typeof HANDOFFS;
