# Appendix A · Data

Everything the app needs as data, exactly as the code has it, so the app can be rebuilt without the codebase. Prose and rules for these fields are in 03 (Data model); the domain logic that uses them is in appendix B.

- A1 Rooms (`src/data/rooms.ts`)
- A2 Demo scenario (`data/scenarios/demo.json`) and how it is loaded
- A3 Random scenario (`MOCK_SCENARIO=random`)
- A4 How the mock gateway fills and creates bookings
- A5 Hardware options and hand-offs (`src/config/*`)
- A6 Data checks (tests)

## A1 Rooms
File `src/data/rooms.ts` exports `ROOMS: Room[]` (39 rooms), in this order. Every room has `site: 'Manila'` and `building: 'Bldg. H'` (a shared constant `H = { site: 'Manila', building: 'Bldg. H' } as const` spread into each entry). `toolName` and `notes` are left out when empty (`undefined`, not `''`). `capacity: null` means unknown; the demo scenario fills demo values (A2, `capacityOverrides`). The file's header comment says: seed list from the guidelines v3.0 (p.8 room list, p.10, p.11, appendix layouts p.12) plus capacities shown in the tool ("Capacity: 0-5" is stored as 5); never guess; Iloilo rooms are not listed yet.

Groups, as comments in the file: 2F meeting rooms (london … rio); 2F collaboration and training rooms (hydepark … denali); 2F multi-purpose halls "for groups over 50; used as hot desks when not reserved (p.10)"; 2F BU visitor offices "booked through Admin by email, not self-service (p.11)"; 3F meeting rooms (mactan … intramuros); 3F collaboration, huddle and training rooms (tagaytay … elnido); "3F rooms on the appendix layout that are missing from the p.8 list" (bacolod, lactation-3f).

Verbatim values from `src/data/rooms.ts` (26 Sep 2026):

| id | name | toolName | site | building | floor | kind | av | capacity | selfBookable | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `london` | London |  | Manila | Bldg. H | 2F | Meeting | VC | 20 | true | Capacity 20 comes from an older screenshot in the guidelines (p.4). Verify. |
| `johannesburg` | Johannesburg |  | Manila | Bldg. H | 2F | Meeting | VC | null | true |  |
| `saopaolo` | Sao Paolo |  | Manila | Bldg. H | 2F | Meeting | VC | null | true |  |
| `newyork` | New York |  | Manila | Bldg. H | 2F | Meeting | VC | null | true |  |
| `capetown` | Cape Town |  | Manila | Bldg. H | 2F | Meeting | BYOD | 5 | true |  |
| `paris` | Paris |  | Manila | Bldg. H | 2F | Meeting | VC | null | true |  |
| `amsterdam` | Amsterdam |  | Manila | Bldg. H | 2F | Meeting | BYOD | 5 | true |  |
| `sydney` | Sydney |  | Manila | Bldg. H | 2F | Meeting | BYOD | null | true |  |
| `tokyo` | Tokyo |  | Manila | Bldg. H | 2F | Meeting | BYOD | null | true |  |
| `rio` | Rio De Janeiro |  | Manila | Bldg. H | 2F | Meeting | BYOD | null | true |  |
| `hydepark` | Hyde Park |  | Manila | Bldg. H | 2F | Collaboration | null | null | true |  |
| `centralpark` | Central Park |  | Manila | Bldg. H | 2F | Collaboration | null | 10 | true |  |
| `snowdon` | Snowdon | Snowdon – TRA | Manila | Bldg. H | 2F | Training | VC | null | true |  |
| `denali` | Denali | Denali – TRB | Manila | Bldg. H | 2F | Training | VC | null | true |  |
| `mph1` | MPH 1 |  | Manila | Bldg. H | 2F | Multi-purpose | null | null | true |  |
| `mph2` | MPH 2 |  | Manila | Bldg. H | 2F | Multi-purpose | null | null | true |  |
| `office-2f-024` | Office 2F-024 |  | Manila | Bldg. H | 2F | Visitor Office | null | null | false |  |
| `office-2f-025` | Office 2F-025 |  | Manila | Bldg. H | 2F | Visitor Office | null | null | false |  |
| `office-2f-026` | Office 2F-026 |  | Manila | Bldg. H | 2F | Visitor Office | null | null | false |  |
| `office-2f-027` | Office 2F-027 |  | Manila | Bldg. H | 2F | Visitor Office | null | null | false |  |
| `mactan` | Mactan |  | Manila | Bldg. H | 3F | Meeting | VC | null | true |  |
| `coron` | Coron |  | Manila | Bldg. H | 3F | Meeting | VC | null | true |  |
| `siargao` | Siargao | Siargao 3F | Manila | Bldg. H | 3F | Meeting | BYOD | null | true |  |
| `vigan` | Vigan |  | Manila | Bldg. H | 3F | Meeting | BYOD | null | true |  |
| `binondo` | Binondo | Binondo 3F | Manila | Bldg. H | 3F | Meeting | BYOD | 4 | true |  |
| `batanes` | Batanes | Batanes 3F | Manila | Bldg. H | 3F | Meeting | BYOD | 6 | true |  |
| `jolo` | Jolo |  | Manila | Bldg. H | 3F | Meeting | BYOD | null | true |  |
| `camiguin` | Camiguin |  | Manila | Bldg. H | 3F | Meeting | BYOD | null | true |  |
| `intramuros` | Intramuros | Intramuros 3F | Manila | Bldg. H | 3F | Meeting | null | null | true | Seen in current bookings but not in the guidelines. Confirm type and capacity. |
| `tagaytay` | Tagaytay |  | Manila | Bldg. H | 3F | Collaboration | null | null | true |  |
| `tanay` | Tanay |  | Manila | Bldg. H | 3F | Collaboration | null | null | true |  |
| `huddle6` | Huddle Room 6 |  | Manila | Bldg. H | 3F | Huddle | null | null | true |  |
| `huddle7` | Huddle Room 7 | Huddle Room 7 - 3F | Manila | Bldg. H | 3F | Huddle | null | null | true |  |
| `huddle8` | Huddle Room 8 |  | Manila | Bldg. H | 3F | Huddle | null | null | true |  |
| `mtapo` | Mt. Apo |  | Manila | Bldg. H | 3F | Training | VC | 20 | true | "Mount Apo 20 pax" on the 3F layout (guidelines appendix). |
| `mtmayon` | Mt. Mayon |  | Manila | Bldg. H | 3F | Training | VC | 20 | true | "Mount Mayon 20 pax" on the 3F layout (guidelines appendix). |
| `elnido` | El Nido |  | Manila | Bldg. H | 3F | Training | VC | null | true |  |
| `bacolod` | Bacolod | Bacolod 3F | Manila | Bldg. H | 3F | Meeting | null | null | true | Reservable (yellow) on the 3F layout, round table with 6 chairs drawn, and listed as "Bacolod 3F" in the tool. Not in the p.8 list: confirm type, AV and capacity. |
| `lactation-3f` | Lactation Room |  | Manila | Bldg. H | 3F | Lactation Room | null | null | true | "LAC. RM" next to the clinic on the 3F layout; "Lactation Room" is a Type of Agenda in the tool. Confirm it is booked through the tool. |

Which rooms are drawn on the map, and where, is floor data (07, appendix on the floor trace). Visitor offices have no map shape; `huddle6`, `huddle7`, `huddle8` and `intramuros` are "unplaced" (drawn in a strip under 3F).

## A2 Demo scenario
`MOCK_SCENARIO=demo` (the default) loads `data/scenarios/demo.json` through `parseScenario` (`src/data/scenarios.ts`) into `DEMO_SCENARIO`. People: the project owner's own name as the demo user and the two other sign-in accounts (Sandoval, Jeremiah and Lagunoy, Lili), all at the owner's request (28 Sep 2026), and obvious test names for everyone else, including "Tester, Admin" (`admin.tester@example.com`), the test Admin account used outside production builds (1 Oct 2026). Never add any other real employee names.

Verbatim from `data/scenarios/demo.json` (28 Sep 2026):

<!-- verbatim: data/scenarios/demo.json -->
```json
{
  "name": "demo",
  "description": "Demo week for Bldg. H. Start the clock at Mon, Sep 28, 2026, 9:00 AM (DEMO_NOW). Reproduces the prototype: flow A (5 people, Mon 3:00-4:00 PM), flow B (8 people, Mon 2:00-4:00 PM, Central Park partly free), flow C (hall for 60, Fri Oct 2, 1:00-5:00 PM). The Tester people are placeholders; the sign-in accounts (src/config/accounts.ts) were added at the owner's request.",
  "now": "2026-09-28T09:00:00+08:00",
  "demoUser": {
    "name": "Remetio, Mark Joseph",
    "email": "markjoseph.remetio@lexisnexis.com",
    "division": "Sales"
  },
  "capacityOverrides": {
    "saopaolo": 6,
    "newyork": 6,
    "paris": 6,
    "sydney": 4,
    "tokyo": 4,
    "rio": 4,
    "mactan": 10,
    "siargao": 4,
    "vigan": 4,
    "jolo": 4,
    "camiguin": 4,
    "tagaytay": 12,
    "tanay": 6,
    "huddle6": 3,
    "bacolod": 6
  },
  "people": [
    {
      "name": "Remetio, Mark Joseph",
      "email": "markjoseph.remetio@lexisnexis.com",
      "division": "Sales"
    },
    {
      "name": "Sandoval, Jeremiah",
      "email": "jeremiah.sandoval@lexisnexis.com"
    },
    {
      "name": "Lagunoy, Lili",
      "email": "lili.lagunoy@lexisnexis.com"
    },
    {
      "name": "Kim, Tae Hwan S.",
      "email": "taehwan.kim@reedelsevier.com"
    },
    {
      "name": "Villagracia, Albert",
      "email": "albert.villagracia@reedelsevier.com"
    },
    {
      "name": "Account, Dummy",
      "email": "dummy.account@example.com",
      "division": "External Judge"
    },
    {
      "name": "Tester, Alpha",
      "email": "alpha.tester@example.com",
      "division": "Operations"
    },
    {
      "name": "Tester, Bravo",
      "email": "bravo.tester@example.com",
      "division": "HR"
    },
    {
      "name": "Tester, Charlie",
      "email": "charlie.tester@example.com",
      "division": "Learning"
    },
    {
      "name": "Tester, Delta",
      "email": "delta.tester@example.com",
      "division": "Sales"
    },
    {
      "name": "Tester, Echo",
      "email": "echo.tester@example.com",
      "division": "Technology"
    },
    {
      "name": "Tester, Admin",
      "email": "admin.test@email.com"
    }
  ],
  "bookings": [
    {
      "ticketNo": "RM-0129901",
      "roomId": "amsterdam",
      "start": "2026-09-28T09:30:00+08:00",
      "end": "2026-09-28T10:30:00+08:00",
      "status": "Approved",
      "agenda": "Daily huddle",
      "agendaType": "Meeting",
      "participants": 4,
      "owner": "alpha.tester@example.com"
    },
    {
      "ticketNo": "RM-0129902",
      "roomId": "tokyo",
      "start": "2026-09-28T10:00:00+08:00",
      "end": "2026-09-28T11:00:00+08:00",
      "status": "Approved",
      "agenda": "Weekly touchpoint meeting",
      "agendaType": "Meeting",
      "participants": 4,
      "owner": "markjoseph.remetio@lexisnexis.com"
    },
    {
      "ticketNo": "RM-0129903",
      "roomId": "london",
      "start": "2026-09-28T13:00:00+08:00",
      "end": "2026-09-28T17:00:00+08:00",
      "status": "Approved",
      "agenda": "Client workshop",
      "agendaType": "Meeting",
      "participants": 14,
      "owner": "delta.tester@example.com"
    },
    {
      "ticketNo": "RM-0129904",
      "roomId": "coron",
      "start": "2026-09-28T13:30:00+08:00",
      "end": "2026-09-28T15:30:00+08:00",
      "status": "Approved",
      "agenda": "Panel interviews",
      "agendaType": "Meeting",
      "participants": 5,
      "owner": "bravo.tester@example.com"
    },
    {
      "ticketNo": "RM-0129905",
      "roomId": "hydepark",
      "start": "2026-09-28T14:00:00+08:00",
      "end": "2026-09-28T16:00:00+08:00",
      "status": "Approved",
      "agenda": "Sprint review",
      "agendaType": "Meeting",
      "participants": 9,
      "owner": "echo.tester@example.com"
    },
    {
      "ticketNo": "RM-0129906",
      "roomId": "elnido",
      "start": "2026-09-28T14:00:00+08:00",
      "end": "2026-09-28T17:00:00+08:00",
      "status": "In Progress",
      "agenda": "Coaching circle",
      "agendaType": "Training",
      "participants": 10,
      "owner": "charlie.tester@example.com"
    },
    {
      "ticketNo": "RM-0129907",
      "roomId": "newyork",
      "start": "2026-09-28T14:30:00+08:00",
      "end": "2026-09-28T15:30:00+08:00",
      "status": "Approved",
      "agenda": "Vendor call",
      "agendaType": "Meeting",
      "participants": 3,
      "owner": "echo.tester@example.com"
    },
    {
      "ticketNo": "RM-0129908",
      "roomId": "centralpark",
      "start": "2026-09-28T15:00:00+08:00",
      "end": "2026-09-28T16:30:00+08:00",
      "status": "Approved",
      "agenda": "Team sync",
      "agendaType": "Meeting",
      "participants": 4,
      "owner": "alpha.tester@example.com"
    },
    {
      "ticketNo": "RM-0129909",
      "roomId": "paris",
      "start": "2026-09-28T15:00:00+08:00",
      "end": "2026-09-28T16:00:00+08:00",
      "status": "Approved",
      "agenda": "Client call prep",
      "agendaType": "Meeting",
      "participants": 4,
      "owner": "delta.tester@example.com"
    },
    {
      "ticketNo": "RM-0129910",
      "roomId": "snowdon",
      "start": "2026-09-28T22:00:00+08:00",
      "end": "2026-09-29T02:00:00+08:00",
      "status": "Approved",
      "agenda": "Night shift onboarding",
      "agendaType": "Training",
      "participants": 18,
      "owner": "charlie.tester@example.com"
    },
    {
      "ticketNo": "RM-0129911",
      "roomId": "capetown",
      "start": "2026-09-28T11:00:00+08:00",
      "end": "2026-09-28T12:00:00+08:00",
      "status": "Cancelled",
      "agenda": "Benefits Q&A",
      "agendaType": "Meeting",
      "participants": 5,
      "owner": "bravo.tester@example.com"
    },
    {
      "ticketNo": "RM-0129912",
      "roomId": "batanes",
      "start": "2026-09-29T14:00:00+08:00",
      "end": "2026-09-29T15:00:00+08:00",
      "status": "Approved",
      "agenda": "Client call prep",
      "agendaType": "Meeting",
      "participants": 5,
      "owner": "markjoseph.remetio@lexisnexis.com"
    },
    {
      "ticketNo": "RM-0129913",
      "roomId": "mph1",
      "start": "2026-10-02T12:00:00+08:00",
      "end": "2026-10-02T18:00:00+08:00",
      "status": "Approved",
      "agenda": "Q4 town hall",
      "agendaType": "Multi-purpose",
      "participants": 50,
      "owner": "bravo.tester@example.com"
    },
    {
      "ticketNo": "RM-0129914",
      "roomId": "mph2",
      "start": "2026-10-02T13:00:00+08:00",
      "end": "2026-10-02T17:00:00+08:00",
      "status": "Approved",
      "agenda": "New hire training",
      "agendaType": "Multi-purpose",
      "participants": 24,
      "owner": "charlie.tester@example.com"
    },
    {
      "ticketNo": "RM-0129915",
      "roomId": "mtmayon",
      "start": "2026-10-02T13:00:00+08:00",
      "end": "2026-10-02T17:00:00+08:00",
      "status": "Approved",
      "agenda": "Product training",
      "agendaType": "Training",
      "participants": 20,
      "owner": "echo.tester@example.com"
    }
  ]
}
```

### Scenario type
```ts
interface Scenario {
  name: string;
  description: string;
  now: Date;                                   // suggested clock start: set DEMO_NOW to it
  demoUser: Person & { email: string };
  capacityOverrides: Record<string, number>;   // demo capacities for rooms whose real capacity is null
  people: Array<Person & { email: string }>;
  bookings: Booking[];
}
```
The raw JSON has the same keys with ISO strings for `now`, `start` and `end`, and each booking's `owner` is an email from `people` (case-insensitive). Raw bookings have only `ticketNo, roomId, start, end, status, agenda, agendaType, participants, owner`.

### `parseScenario(raw)` checks, in order, and messages
`where = Scenario "<name>"`; per booking `at = <where>, <ticketNo>`. It throws `Error` with these messages:

| Check | Message |
|---|---|
| every key of `capacityOverrides` is a room id | `<where>: capacityOverrides has unknown room "<id>"` |
| ticket numbers are unique | `<at>: duplicate ticket number` |
| `roomId` is a room | `<at>: unknown room "<roomId>"` |
| `status` is one of Held, In Progress, Approved, Checked-In, Completed, Cancelled | `<at>: unknown status "<status>"` |
| `agendaType` is one of Meeting, Training, Pantry, Lactation Room, Multi-purpose | `<at>: unknown agenda type "<agendaType>"` |
| `owner` email is in `people` | `<at>: owner "<owner>" is not in people` |
| `start`, `end` parse as dates | `<at>: invalid date "<value>"` (for `now`: `<where>: invalid date "<value>"`) |
| `end` after `start` | `<at>: end must be after start` |
| `participants` is a whole number ≥ 1 | `<at>: participants must be a positive whole number` |
| no two bookings overlap in the same room: for each booking `b`, `conflictsFor(b.roomId, b, all others, now)` with the scenario's `now` (so other bookings that are Cancelled, Completed, or Held without a hold time don't count); a Cancelled `b` is never reported; the first clash (earliest start) is named | `<where>: <ticketNo> overlaps <otherTicketNo> in <roomId>` |

Each booking's `owner` becomes a copy of the person object (`{ name, email, division }`). `demoUser`, `capacityOverrides` and `people` are copied as they are.

### On the real clock: `scenarioInWeekOf(scenario, now)`
With `DEMO_NOW` set, `getGateway()` uses `DEMO_SCENARIO` as it is (the dates above). Without it (the default since v0.10) it uses `scenarioInWeekOf(DEMO_SCENARIO, now())`: `weeks = round((manilaStartOfWeek(now) − manilaStartOfWeek(scenario.now)) / 7 days)`; 0 weeks returns the same object; otherwise a copy with `now` and every booking's `start` and `end` moved by `weeks × 7` days (same weekday and Manila time; Manila has no daylight saving). `manilaStartOfWeek(d)` is Manila midnight on the Monday of `d`'s week (B1). So on Tue, Sep 29, 2026 nothing moves, and on Thu, Nov 12 the Monday bookings fall on Mon, Nov 9.

## A3 Random scenario
`MOCK_SCENARIO=random` (any value other than `demo`): the mock gateway has no scenario, so it uses placeholder people and generated bookings.

People (the directory and the owners), verbatim from `src/gateway/mockGateway.ts`:
```ts
const OWNERS: Person[] = [
  { name: 'Tester, Alpha', email: 'alpha.tester@example.com', division: 'Operations' },
  { name: 'Tester, Bravo', email: 'bravo.tester@example.com', division: 'HR' },
  { name: 'Tester, Charlie', email: 'charlie.tester@example.com', division: 'Learning' },
  { name: 'Tester, Delta', email: 'delta.tester@example.com', division: 'Sales' },
  { name: 'Tester, Echo', email: 'echo.tester@example.com', division: 'Technology' },
];
const AGENDAS = ['Team sync', 'Weekly touchpoint meeting', 'Client call prep', '1:1 coaching', 'Q4 planning', 'New Doc Process – Content Analysis'];
```
Room capacities stay as in A1 (no overrides), so unknown ones stay `null`.

`makeSampleBookings(rooms, now, seed = 7, days = 7)`, deterministic:
```ts
// mulberry32: small seeded random generator (returns numbers in [0, 1))
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
pick(items) = items[floor(rand() * items.length)]

rand = mulberry32(seed); ticket = 120001; firstDay = manilaStartOfDay(now)
for d in 0 … days-1:
  dayStart = firstDay + d × 24 h
  for room in rooms (A1 order):
    if !room.selfBookable: continue
    count = floor(rand() × 4)                      // 0–3 per room per day
    repeat count times:
      start = dayStart + 7 h + floor(rand() × 26) × 30 min   // 7:00 AM … 7:30 PM Manila
      end   = start + pick([30, 60, 60, 90, 120]) min
      if it overlaps an earlier generated booking in the same room: skip (no ticket used)
      capacity = room.capacity ?? 8
      push { ticketNo: 'RM-0' + ticket++, roomId, start, end, status: 'Approved',
             agenda: pick(AGENDAS), agendaType: Training room → 'Training', Multi-purpose room → 'Multi-purpose', else 'Meeting',
             participants: max(1, min(capacity, 2 + floor(rand() × 7))), owner: copy of pick(OWNERS) }
```
The random calls happen in exactly this order (count, then per booking: start, length, agenda, participants, owner), which fixes the data for a seed. `withSamples: false` (tests) starts empty.

## A4 How the mock gateway fills and creates bookings
`MockGateway` (`src/gateway/mockGateway.ts`), options `{ now?: () => Date, scenario?: Scenario, withSamples?: boolean (default true), seed?: number (7), sampleDays?: number (7) }`. `getGateway()` builds it once with the app clock and `DEMO_SCENARIO` when `MOCK_SCENARIO` is `demo` (default); `resetGateway()` forgets it (evals and tests).
- **Rooms**: `ROOMS` copied, `capacity = room.capacity ?? scenario.capacityOverrides[id] ?? null`. `listRooms(site?)` filters by site and returns copies.
- **People** (`listPeople`): with a scenario, `[demoUser, ...people]`; without, `OWNERS`; deduplicated by email (first wins, `sameEmail`), people without email dropped, each returned as `{ name, email, division, login }` where `login = email before "@", upper-case` (e.g. `MARKJOSEPH.REMETIO`). The first person is the default requestor for `scripts/ask.ts`, the evals and tests; in the browser the requestor is the signed-in account (`src/config/accounts.ts`), not this list.
- **Scenario bookings**: copied with `priority: 'Normal'` and `createdBy: <owner login>` added (the tool fills both; the JSON leaves them out). No `createdAt`.
- **Queries**: `getBookings({ roomIds?, from, to })` returns every booking (any status) with `start < to` and `from < end`, in stored order; `getBooking(ticketNo)`; `listMyBookings(email, from, to?)` returns the owner's (case-insensitive) overlapping bookings sorted by start (no `to`: every one with `from < end`). All return copies.
- **`createBooking(req)`**: unknown room → `NotFoundError('Unknown room "<id>".')`; not self-bookable → `NotAllowedError('<name> is booked through Admin.')`. Dates = `expandRecurrence(req, req.recurrence)` (max 100) or the single interval. Any date with a blocking conflict (`conflictsFor`) → `ConflictError(conflicts)`, nothing written. Then, with `RULES.oneRoomPerPersonAtATime` and a requester email, any date where the requester already holds a blocking booking in any room (`ownConflicts`) → `ConflictError(ownBookings, 'requester')`, nothing written. Otherwise one booking per date: `ticketNo: 'RM-0' + nextTicket++` (starting at **130001**, so the first is `RM-0130001`), `status: 'In Progress'` (guidelines 3.5), `agenda, agendaType, participants`, `owner` = copy of the requester, `priority: req.priority ?? 'Normal'`, and when given `trainingType`, `specialInstructions`, `hardwareRequirements` (non-empty only), `recurrence`; `createdBy` = requester login; `createdAt` = the clock. Returns a copy of the first date's booking.
- **`cancelBooking(ticketNo, by)`**: not found → `NotFoundError('Booking <ticketNo> not found.')`; not the owner → `NotAllowedError('Only the person who made the booking can do this.')`; sets `status = 'Cancelled'`.
- **`checkIn(ticketNo, by)`**: same not-found and owner errors; status not Approved or In Progress → `NotAllowedError('This booking is <status>.')`; outside `checkInWindow` (`now < start − 60 min` or `now ≥ start + 15 min`) → `NotAllowedError('Check-in is open from <formatManila(window.start)> until <formatManila(window.end)>.')`; else `status = 'Checked-In'`.
- **`moveBooking(ticketNo, toRoomId, by)`** (swaps, not used by any route yet): not found / unknown room (`Unknown room "<id>".`) → `NotFoundError`; a blocking clash in the target room (ignoring the booking itself) → `ConflictError`; else changes `roomId`. The mock does not check the owner (the real tool must).
- Everything lives in memory: restart the server (or `resetGateway()`) to get the scenario week back.

## A5 Hardware options and hand-offs
Verbatim from `src/config/hardware.ts` (26 Sep 2026). Placeholders [OPEN, RULES question 8]:
```ts
export const HARDWARE_OPTIONS = ['Projector', 'Speakerphone', 'Webcam', 'Extra monitor', 'Laptop', 'HDMI adapter'] as const;
export type HardwareOption = (typeof HARDWARE_OPTIONS)[number];
```

Verbatim from `src/config/handoffs.ts` (26 Sep 2026). Source comment: Room Reservation Guidelines v3.0 (p.6, p.9, p.10, p.11) and the reservation form; keep in sync with Admin.
<!-- verbatim: src/config/handoffs.ts -->
```ts
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
```

## A6 Data checks (tests)
`src/data/__tests__/data.test.ts`:
- Room ids are unique; every capacity is `null` or > 0.
- `selfBookable` is false exactly for kind `Visitor Office`.
- The demo scenario has 15 bookings, the demo user is "Remetio, Mark Joseph", and `now` is `2026-09-28T01:00:00.000Z` (Mon 9:00 AM Manila).
- `parseScenario` accepts a minimal valid scenario and rejects an overlap (`/overlaps/`), an unknown room (`/unknown room/`) and an unknown status (`/unknown status/`).
- `scenarioInWeekOf` leaves the demo week as it is for a time in that week and moves it six weeks for Thu, Nov 12 (Mon, Nov 9, 9:00 AM; RM-0129901 at 9:30 AM); `manilaStartOfWeek` treats Sunday 11:59 PM as the end of the week.
