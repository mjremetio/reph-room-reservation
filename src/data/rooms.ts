import type { AgendaType, Room } from '../domain/types';

/**
 * Seed room list for Bldg. H, Manila, from the Room Reservation Guidelines v3.0 (p.8 room list, p.10, p.11,
 * appendix floor layouts p.12). Which Types of agenda each room can be booked for (`agendas`), the capacities of those
 * rooms ("Capacity: 0-5" is stored as 5) and their names in the tool (`toolName`) come from the owner's room booking
 * list (1 Oct 2026). A room on no list can't be booked in the app. capacity: null means unknown. Don't guess:
 * replace this file with the tool's room master data once the real gateway exists. Iloilo rooms are not listed yet.
 */
const H = { site: 'Manila', building: 'Bldg. H' } as const;

/** The owner's list: these rooms take Meeting and Training bookings. */
const MEETING_OR_TRAINING: AgendaType[] = ['Meeting', 'Training'];
const TRAINING: AgendaType[] = ['Training'];
const MULTI_PURPOSE: AgendaType[] = ['Multi-purpose'];
const LACTATION: AgendaType[] = ['Lactation Room'];
/** Not on the owner's list: shown on the map, never booked. */
const NONE: AgendaType[] = [];

export const ROOMS: Room[] = [
  // 2F meeting rooms
  { id: 'london', name: 'London', ...H, floor: '2F', kind: 'Meeting', av: 'VC', capacity: 20, agendas: NONE, selfBookable: true, notes: 'Capacity 20 comes from an older screenshot in the guidelines (p.4). Verify.' },
  { id: 'johannesburg', name: 'Johannesburg', ...H, floor: '2F', kind: 'Meeting', av: 'VC', capacity: 6, agendas: MEETING_OR_TRAINING, selfBookable: true },
  { id: 'saopaolo', name: 'Sao Paolo', ...H, floor: '2F', kind: 'Meeting', av: 'VC', capacity: null, agendas: NONE, selfBookable: true },
  { id: 'newyork', name: 'New York', ...H, floor: '2F', kind: 'Meeting', av: 'VC', capacity: null, agendas: NONE, selfBookable: true },
  { id: 'capetown', name: 'Cape Town', ...H, floor: '2F', kind: 'Meeting', av: 'BYOD', capacity: 5, agendas: MEETING_OR_TRAINING, selfBookable: true },
  { id: 'paris', name: 'Paris', ...H, floor: '2F', kind: 'Meeting', av: 'VC', capacity: null, agendas: NONE, selfBookable: true },
  { id: 'amsterdam', name: 'Amsterdam', ...H, floor: '2F', kind: 'Meeting', av: 'BYOD', capacity: 5, agendas: MEETING_OR_TRAINING, selfBookable: true },
  { id: 'sydney', name: 'Sydney', ...H, floor: '2F', kind: 'Meeting', av: 'BYOD', capacity: null, agendas: NONE, selfBookable: true },
  { id: 'tokyo', name: 'Tokyo', ...H, floor: '2F', kind: 'Meeting', av: 'BYOD', capacity: null, agendas: NONE, selfBookable: true },
  { id: 'rio', name: 'Rio De Janeiro', ...H, floor: '2F', kind: 'Meeting', av: 'BYOD', capacity: null, agendas: NONE, selfBookable: true },
  // 2F collaboration and training rooms
  { id: 'hydepark', name: 'Hyde Park', toolName: 'Hyde Park (Collaboration Set up)', ...H, floor: '2F', kind: 'Collaboration', av: null, capacity: 10, agendas: MEETING_OR_TRAINING, selfBookable: true },
  { id: 'centralpark', name: 'Central Park', ...H, floor: '2F', kind: 'Collaboration', av: null, capacity: 10, agendas: MEETING_OR_TRAINING, selfBookable: true },
  { id: 'snowdon', name: 'Snowdon', toolName: 'TR A – Snowdon', ...H, floor: '2F', kind: 'Training', av: 'VC', capacity: 20, agendas: TRAINING, selfBookable: true },
  { id: 'denali', name: 'Denali', toolName: 'TR B – Denali', ...H, floor: '2F', kind: 'Training', av: 'VC', capacity: 20, agendas: TRAINING, selfBookable: true },
  // 2F multi-purpose halls; used as hot desks when not reserved (p.10)
  { id: 'mph1', name: 'MPH 1', ...H, floor: '2F', kind: 'Multi-purpose', av: null, capacity: 50, agendas: MULTI_PURPOSE, selfBookable: true },
  { id: 'mph2', name: 'MPH 2', ...H, floor: '2F', kind: 'Multi-purpose', av: null, capacity: 93, agendas: MULTI_PURPOSE, selfBookable: true },
  // 2F BU visitor offices: booked through Admin by email, not self-service (p.11)
  { id: 'office-2f-024', name: 'Office 2F-024', ...H, floor: '2F', kind: 'Visitor Office', av: null, capacity: null, agendas: NONE, selfBookable: false },
  { id: 'office-2f-025', name: 'Office 2F-025', ...H, floor: '2F', kind: 'Visitor Office', av: null, capacity: null, agendas: NONE, selfBookable: false },
  { id: 'office-2f-026', name: 'Office 2F-026', ...H, floor: '2F', kind: 'Visitor Office', av: null, capacity: null, agendas: NONE, selfBookable: false },
  { id: 'office-2f-027', name: 'Office 2F-027', ...H, floor: '2F', kind: 'Visitor Office', av: null, capacity: null, agendas: NONE, selfBookable: false },

  // 3F meeting rooms
  { id: 'mactan', name: 'Mactan', ...H, floor: '3F', kind: 'Meeting', av: 'VC', capacity: null, agendas: NONE, selfBookable: true },
  { id: 'coron', name: 'Coron', toolName: 'Coron (VIP Conference Room) 3F', ...H, floor: '3F', kind: 'Meeting', av: 'VC', capacity: 10, agendas: MEETING_OR_TRAINING, selfBookable: true },
  { id: 'siargao', name: 'Siargao', toolName: 'Siargao 3F', ...H, floor: '3F', kind: 'Meeting', av: 'BYOD', capacity: null, agendas: NONE, selfBookable: true },
  { id: 'vigan', name: 'Vigan', ...H, floor: '3F', kind: 'Meeting', av: 'BYOD', capacity: null, agendas: NONE, selfBookable: true },
  { id: 'binondo', name: 'Binondo', toolName: 'Binondo 3F', ...H, floor: '3F', kind: 'Meeting', av: 'BYOD', capacity: 4, agendas: MEETING_OR_TRAINING, selfBookable: true },
  { id: 'batanes', name: 'Batanes', toolName: 'Batanes 3F', ...H, floor: '3F', kind: 'Meeting', av: 'BYOD', capacity: 6, agendas: MEETING_OR_TRAINING, selfBookable: true },
  { id: 'jolo', name: 'Jolo', ...H, floor: '3F', kind: 'Meeting', av: 'BYOD', capacity: null, agendas: NONE, selfBookable: true },
  { id: 'camiguin', name: 'Camiguin', ...H, floor: '3F', kind: 'Meeting', av: 'BYOD', capacity: null, agendas: NONE, selfBookable: true },
  { id: 'intramuros', name: 'Intramuros', toolName: 'Intramuros 3F', ...H, floor: '3F', kind: 'Meeting', av: null, capacity: 6, agendas: MEETING_OR_TRAINING, selfBookable: true, notes: 'Seen in current bookings but not in the guidelines. Confirm its AV.' },
  // 3F collaboration, huddle and training rooms
  { id: 'tagaytay', name: 'Tagaytay', ...H, floor: '3F', kind: 'Collaboration', av: null, capacity: null, agendas: NONE, selfBookable: true },
  { id: 'tanay', name: 'Tanay', ...H, floor: '3F', kind: 'Collaboration', av: null, capacity: null, agendas: NONE, selfBookable: true },
  { id: 'huddle6', name: 'Huddle Room 6', ...H, floor: '3F', kind: 'Huddle', av: null, capacity: null, agendas: NONE, selfBookable: true },
  { id: 'huddle7', name: 'Huddle Room 7', toolName: 'Huddle Room 7 – 3F', ...H, floor: '3F', kind: 'Huddle', av: null, capacity: 4, agendas: MEETING_OR_TRAINING, selfBookable: true },
  { id: 'huddle8', name: 'Huddle Room 8', toolName: 'Huddle Room 8 – 3F', ...H, floor: '3F', kind: 'Huddle', av: null, capacity: 4, agendas: MEETING_OR_TRAINING, selfBookable: true },
  { id: 'mtapo', name: 'Mt. Apo', toolName: 'Mt. Apo 3F', ...H, floor: '3F', kind: 'Training', av: 'VC', capacity: 20, agendas: TRAINING, selfBookable: true },
  { id: 'mtmayon', name: 'Mt. Mayon', toolName: 'Mt. Mayon 3F', ...H, floor: '3F', kind: 'Training', av: 'VC', capacity: 20, agendas: TRAINING, selfBookable: true },
  { id: 'elnido', name: 'El Nido', toolName: 'El Nido 3F', ...H, floor: '3F', kind: 'Training', av: 'VC', capacity: 20, agendas: TRAINING, selfBookable: true },
  // 3F rooms on the appendix layout that are missing from the p.8 list
  { id: 'bacolod', name: 'Bacolod', toolName: 'Bacolod 3F', ...H, floor: '3F', kind: 'Meeting', av: null, capacity: null, agendas: NONE, selfBookable: true, notes: 'Reservable (yellow) on the 3F layout, round table with 6 chairs drawn, and listed as "Bacolod 3F" in the tool. Not on the owner\'s room booking list.' },
  { id: 'lactation-3f', name: 'Lactation Room', toolName: 'Lactation Room 1', ...H, floor: '3F', kind: 'Lactation Room', av: null, capacity: null, agendas: LACTATION, selfBookable: true, notes: '"LAC. RM" next to the clinic on the 3F layout. The owner\'s room booking list gives no capacity.' },
];
