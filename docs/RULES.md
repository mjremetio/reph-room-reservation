# Booking rules

Sources: *Room Reservation Guidelines* v3.0 (Corporate Services – Admin, January 2025) and the current reservation form. All values live in `src/domain/rules.ts`; tests in `src/domain/__tests__/rules.test.ts`. Exact checks, order and messages: `docs/spec/appendix/B-domain.md` (B2).

## Rules in force
| Rule | Source | In code |
|---|---|---|
| Agenda must be a specific title; "Meeting" or "Training" alone is rejected | Guidelines 3.5, form | `checkAgendaTitle` |
| A submitted reservation is "In Progress" until Admin approves it | Guidelines 3.5 | `MockGateway.createBooking` (status `In Progress`); the booked card says "Requested – waiting for Admin"; it is in My bookings at once; Admin approves or turns it down with a reason at `/admin` (`approveBooking`, `rejectBooking`) and the owner gets a note in Messages [OPEN: question 2] |
| Types of agenda: Meeting, Training, Pantry, Lactation Room, Multi-purpose | Form | `AgendaType` |
| No overlapping bookings: a room is never double-booked | Guidelines objectives | `availability.ts` (`conflictsFor`), `prepareBooking`, `MockGateway.createBooking` (409 at Confirm) |
| Reminder email 1 hour before; check-in required | Guidelines p.6 | `RULES.checkInOpensMinutesBefore` [OPEN] |
| Room released if unused 15 minutes after the start | Guidelines p.6, p.11; built at the owner's request (1 Oct 2026) | `RULES.checkInGraceMinutes`, `RULES.autoReleaseNoShows` [OPEN: question 3], `shouldAutoRelease`: an Approved or In Progress booking nobody checked in to by start + 15 min is Cancelled (`releasedAt`, Modified By `SYSTEM`, Admin comments "Released: nobody checked in within 15 minutes of the start.") by `ReservationGateway.releaseNoShows`, which every API route runs first (`src/app/api/_release.ts`); audited (`booking.release`), the owner gets a note in Messages, the room is free again, and Admin's reports count it as a no-show. My bookings says "Check in by 3:15 PM, or the room is released." |
| Meeting rooms: up to 10 days ahead | Guidelines p.11 | `RULES.maxDaysAhead.Meeting` [OPEN] |
| Meeting, Training and MPH: up to 90 days ahead | Form note: "Meeting, Training, and MPH rooms can only be booked up to 90 days in advance." (seen again on the live form, Sep 2026) | `RULES.maxDaysAhead` [OPEN]; checked on submit (`TOO_FAR_AHEAD`, "<Type> bookings can be made up to N days ahead."); the forms show no hint |
| Training rooms: within one shift (6 AM–2 PM, 2 PM–10 PM, 10 PM–6 AM) | Guidelines p.11 | `fitsOneTrainingShift` |
| Multi-purpose hall for groups over 50 | Guidelines p.10 | `MPH_SMALL_GROUP` warning |
| Right-size rooms; don't book large rooms for small groups | Guidelines p.11 | `ranking.ts` |
| Urgent only if training starts within 2 weeks, or a meeting within 12–24 business hours | Form "Priority" note | `urgentAllowed`: a Training that starts in less than 14 days, a Meeting that starts within the next 24 clock hours, never other types or a start in the past; enforced by `validateRequest` (`URGENT_NOT_ALLOWED`). The forms disable Urgent otherwise and say so in a hover hint ("Urgent: training within two weeks, or a meeting within 24 hours") [OPEN: question 4, business hours] |
| Agenda and Number of Participants are required; participants ≥ 1 | Form ("Agenda is required", "Participants is required") | `checkAgendaTitle`, zod schemas |
| Type of Training: On-Site or Virtual | Form | `TrainingType`; the app's form shows it only when Type of agenda is Training and stores it for Training only (default On-Site); the tool's form shows it for every type [OPEN: question 9] |
| Recurrence: daily, weekly (weekdays), monthly (a day, or e.g. the third Thursday), yearly, until an end date | Guidelines 3.6, form | **Built (P1-23)**: `src/domain/recurrence.ts`; every date follows the rules and must be free, all or none (`prepareBooking`, `createBooking`); at most `RULES.maxSeriesDates` (100) dates; the window applies to every date (`RULES.windowAppliesToEveryDate`) [OPEN]. The tool ticks Daily by itself when Ends at is a later day; the app lets people pick |
| Approved bookings send an .ics invite; open it, accept, then Respond › Forward to attendees | Guidelines 3.7–3.8 | The assistant explains it (`src/agent/guidelines.ts`); Phase 3 replaces it with Outlook invites |
| BU visitor offices 2F-024 to 2F-027: through Admin by email | Guidelines p.11 | `selfBookable: false`, `get_handoff` |
| Extra hardware: ServiceNow. Room setup (Polycom VC, projector, sound): Non-Solus | Guidelines p.10, form notes under "Hardware Requirements" | `get_handoff`; the forms show one line under Hardware, "Also file it in ServiceNow · Room setup: Non-Solus" (links from `src/config/handoffs.ts`); the Hardware select ("None" or one of `HARDWARE_OPTIONS`, placeholders [OPEN: question 8]) stores the choice |
| VC rooms: Join on the touch panel, invite the room in Outlook, share with "Don't use audio" + Share content, Mute on the panel; BYOD: USB and HDMI on the dock; Toolkit app QR code; IT help line | Guidelines p.9 | Assistant knowledge (`src/agent/guidelines.ts`), `list_rooms`, `get_handoff it_support` |
| MPH doubles as hot desks when not reserved | Guidelines p.10 | Assistant knowledge; map label (Phase 2) |
| Cancel on time so others can use the room | Guidelines p.11 | Cancel flow, assistant knowledge, reminders (Phase 3) |

## App rules (ours, not the tool's)
| Rule | Value | In code |
|---|---|---|
| A request may start a little in the past (typing takes a moment) | up to 5 minutes; earlier → "That time has already passed." | `RULES.startGraceMinutes`, `IN_PAST` |
| An assistant or form proposal waits for Confirm | 3 minutes, single use, only the person it was prepared for | `RULES.proposalHoldMinutes`, `createProposal` / `takeProposal` |
| A proposal an AI app prepared over MCP waits for Confirm | 15 minutes (the person opens its confirm link from that app), single use, only that person; it holds no room (Confirm checks again) | `RULES.linkProposalHoldMinutes`, `peekProposal` / `takeProposal` |
| AI apps (Claude, ChatGPT, …) never book or cancel | They only prepare; the person confirms in REPH Rooms, signed in as themselves | `src/mcp/server.ts`, `POST /api/proposals/{id}` |
| A repeating booking | at most 100 dates, all or none | `RULES.maxSeriesDates` |
| The room must be at the requested site | "`<room>` is in `<site>`, not `<site>`." | `WRONG_SITE` |
| One room per person at a time: you can't book a room while you already hold another at an overlapping time (back to back is fine) | Owner's request, 28 Sep 2026 [OPEN: question 15] | `RULES.oneRoomPerPersonAtATime`, `ownConflicts`; the search warns ("You already have <room> on <time> (<ticket>). One room per person at a time: cancel it first, or pick another time."), `prepareBooking` refuses (409, "… One room per person at a time."), `MockGateway.createBooking` refuses again at Confirm (409) |
| Free times shown start now | this quarter hour while inside the 5-minute start grace, else the next quarter hour (9:04 → 9:00, 9:06 → 9:15) | `bookableFrom` (room schedule) |
| Sign-in | demo accounts only (3), username + password; the signed-in person is the Name of Requestor; 12-hour session; 10 sign-in attempts a minute per client address (counted per server instance) | `src/config/accounts.ts`, `src/lib/session.ts` |
| Only the person who made a booking, or an Admin at `/admin`, can cancel it or check it in | "Only the person who made the booking can do this." / "I can only cancel your own bookings." (the assistant and MCP never act as Admin) | `MockGateway` (`assertOwner` passes for an actor with `role: 'admin'`, set only by `requireAdmin`), `prepareCancellation` |
| Check-in window | from 60 minutes before the start until 15 minutes after (`start − 60 min ≤ now < start + 15 min`), for Approved or In Progress bookings | `checkInWindow`, `MockGateway.checkIn` |
| Right-sizing | right size (≤ 1 spare seat) ranks above roomy (≤ 50% spare) above oversized; unknown capacity −25; no VC when asked −20; ties alphabetical | `scoreRoom`, `rankRooms` (appendix B4) |
| Short free gaps don't count | free parts under 15 minutes are ignored | `freeIntervals` |
| My bookings | every upcoming booking of yours (from 1 hour ago on, no end), any status except Cancelled: requests waiting for Admin show at once (owner's request, 30 Sep 2026) | `GET /api/bookings/mine`, `my_bookings` (`days_ahead: null`) |
| Admin role | accounts are `admin` or `user`; the owner is Admin (30 Sep 2026); `/admin` and `/api/admin/*` are for Admin only, checked on every request from the account store (403 "Admin only.") | `src/config/accounts.ts`, `requireAdmin` |
| Admin changes a booking | room, start, end, participants, agenda, type of agenda, priority; the usual rules except `RULES.adminMayOverride` (booking window, Admin-only rooms, the Urgent hint) [OPEN: question 17]; the room must be free; one room per person when the time moves; a cancelled or completed booking can't change | `adminChangeIssues`, `prepareAdminChange`, `updateBooking` |
| Admin swaps rooms | two bookings exchange rooms in one step, each keeps its time; both rooms must be free for the other | `prepareAdminSwap`, `swapRooms` |
| Turning a request down | only a request still In Progress; a reason is required and the owner sees it (Admin comments) | `AdminActionBody`, `rejectBooking` |
| Admin actions tell the owner | approve, turn down, change, swap, cancel and check-in leave an automatic note in the booking's thread | `adminNote` |
| Messages | one thread per booking between its owner and Admin; nobody else can read or write it; 1–2000 characters; the badge refreshes every 15 seconds | `src/services/messages.ts`, `MESSAGES_POLL_MS` |
| Accounts | Admin adds people ("Last, First", e-mail; the login is the e-mail name) with a temporary password shown once; they choose their own (≥ 12 characters) at the first sign-in; Admin changes name, division, role, or disables them; nobody can demote or disable themselves | `src/lib/accounts.ts`, `MIN_PASSWORD_LENGTH` |
| Reset account | a new temporary password (shown once), signed out everywhere (browser sessions and AI apps), a new password at the next sign-in | `resetAccount`, `sessionsValidAfter` |
| Audit log | every write and sign-in (who, what, on what, a short summary); never message text or passwords; the last 5 000 entries, in memory until P3-06 | `src/lib/audit.ts`, `AUDIT_LIMIT` |
| Admin assistant | reads requests, bookings, schedules and reports and prepares cards; it never changes anything itself and can't manage accounts or rooms [OPEN: question 18] | `src/agent/adminAgent.ts` |

## Open questions for Admin
1. **Booking window for meeting rooms:** 10 days (guidelines p.11) or 90 days (form note, still on the live form in Sep 2026)? The app uses 10 until confirmed.
2. **Approvals:** which bookings need Admin approval, and which are approved straight away? (Statuses seen: In Progress, Approved, Checked-In, Cancelled, Completed.) The app lets Admin approve or turn down every In Progress request at `/admin`; in the real tool that must go through its own approval (P3-01).
3. **Check-in:** when does it open? The app assumes 1 hour before, at the reminder email. Does the tool release unused rooms itself? The app now cancels them itself at start + 15 min (`RULES.autoReleaseNoShows`, the owner's request); with the real tool (P3-01) the adapter should report the tool's own releases instead.
4. **Urgent:** how are "12–24 business hours" counted in a 24/7 office?
5. **Room data:** real capacities for every room (the tool shows ranges like "0–5"), the type of Intramuros 3F, photos, and the Iloilo room list.
6. **Swaps:** after an owner agrees in Teams, may the app move their booking, or must they change it themselves? Admin can now move a booking or swap two bookings' rooms at `/admin` (the owner gets a note); may the app do this in the real tool?
7. **Showing agenda titles:** the current calendar shows other people's agenda titles. Should the assistant show them too? It doesn't for now.
8. **Hardware Requirements:** the form has a select with this name. What are its options, and does choosing one do anything in the tool, or is it informational next to the ServiceNow note?
9. **Type of Training:** the tool's form shows it even for meetings. Is it stored for non-training bookings? The app shows it only for Training, keeps it for Training bookings only (On-Site unless Virtual) and drops it for other types.
10. **Sign-in:** the app has three demo accounts (username and password; the signed-in person is the Name of Requestor and nobody can book for someone else). Company sign-in (Entra ID, P3-02) should replace them before a pilot: may people then book for someone else (Admin, assistants)? Until then Admin adds people, changes roles and resets accounts at `/admin/users` (in memory; the three configured accounts come back on a restart).
11. **Rooms on the layout but not in the tool's list:** 2F has two yellow (reservable) meeting rooms with no name (the top-left corner room with an 8–10 seat table, and the room above Sydney); 3F has the yellow MPV area next to El Nido and a "Callao Cave" room next to Camiguin. What are they, and can they be booked? The map shows them as "not in the tool list".
12. **Rooms in the tool but not on the layout:** where are Huddle Rooms 6, 7 and 8 and Intramuros 3F? The map puts them in a strip under 3F until then.
13. **BU visitor offices 2F-024 to 2F-027:** which rooms on the 2F layout are they? (Four small offices in a row at the top right are a guess, not used.)
14. **Guidelines in the assistant:** the guidelines are marked confidential. May a paraphrase (no names, no room mailboxes) be sent to OpenAI with every assistant request? (IT and Legal, 05 Data sent to OpenAI.)
15. **One room per person at a time:** the app refuses a second room at an overlapping time for the same requestor (the owner's request). Does the tool allow it, and should Admin or assistants booking for several teams be exempt? (`RULES.oneRoomPerPersonAtATime` turns it off.)
16. **AI apps over MCP:** people can connect Claude, ChatGPT or another MCP app (05, MCP); tool results (room data, others' names, divisions, times, group sizes and statuses, their own bookings) then go to that app's vendor. Which vendors are allowed, and may the guidelines paraphrase be offered to them too (it isn't now)? (IT and Legal; extends question 14.)
17. **What binds Admin:** Admin changes skip the booking window, the Admin-only rooms and the Urgent hint (`RULES.adminMayOverride`); everything else still applies. Is that how the tool treats Admin?
18. **Admin assistant and OpenAI:** the Admin assistant's tool results include other people's names, divisions, agenda titles, group sizes and statuses (never e-mails). May these go to OpenAI? (IT and Legal; extends question 14.)
19. **Room master data:** Admin can change a room's name, seats, equipment, self-service and notes in the app (in memory for now). Should these changes go to the tool's room list, or stay read-only in the app?

## Demo data
Demo people are obvious test names ("Tester, Alpha" … "Tester, Echo", all `@example.com`, and a test Admin "Tester, Admin", `admin.tester`, added on 1 Oct 2026 for trying the Admin pages: always in development and tests; on a production server only when `ENABLE_TEST_ADMIN=true`, because its password is short and known), plus the three sign-in accounts the project owner asked for on 28 Sep 2026: the owner as the demo user ("Remetio, Mark Joseph"), "Sandoval, Jeremiah" and "Lagunoy, Lili" (all `@example.com`, no invented divisions). Never add any other real employee names, including names seen in screenshots of the tool or in the guidelines.
