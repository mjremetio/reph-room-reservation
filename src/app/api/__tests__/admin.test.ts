/**
 * Admin routes and messages on the demo scenario (docs/spec/04-api.md, Admin and Messages): who may call them,
 * approve / turn down / change / swap, users and resets, rooms, reports and the audit log.
 * Handlers are called directly; the demo clock starts Mon, Sep 28, 9:00 AM. Tests share one gateway and store, in order.
 */
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createSession, SESSION_COOKIE } from '../../../lib/session';

process.env.DEMO_NOW = '2026-09-28T09:00:00+08:00';
process.env.RESERVATION_GATEWAY = 'mock';
process.env.MOCK_SCENARIO = 'demo';

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const r: Record<string, Handler> = {};

before(async () => {
  const load = async (path: string, method = 'GET') => (await import(path))[method] as Handler;
  Object.assign(r, {
    overview: await load('../admin/overview/route'),
    changes: await load('../admin/changes/route'),
    bookings: await load('../admin/bookings/route'),
    act: await load('../admin/bookings/[ticketNo]/route', 'POST'),
    change: await load('../admin/bookings/[ticketNo]/route', 'PATCH'),
    bulk: await load('../admin/bookings/approve/route', 'POST'),
    swap: await load('../admin/bookings/swap/route', 'POST'),
    reports: await load('../admin/reports/route'),
    audit: await load('../admin/audit/route'),
    users: await load('../admin/users/route'),
    addUser: await load('../admin/users/route', 'POST'),
    editUser: await load('../admin/users/[login]/route', 'PATCH'),
    reset: await load('../admin/users/[login]/reset/route', 'POST'),
    signOutUser: await load('../admin/users/[login]/signout/route', 'POST'),
    rooms: await load('../admin/rooms/route'),
    editRoom: await load('../admin/rooms/[roomId]/route', 'PATCH'),
    threads: await load('../messages/route'),
    thread: await load('../messages/[ticketNo]/route'),
    send: await load('../messages/[ticketNo]/route', 'POST'),
    propose: await load('../proposals/route', 'POST'),
    confirm: await load('../proposals/[id]/route', 'POST'),
    mine: await load('../bookings/mine/route'),
    publicRooms: await load('../rooms/route'),
    session: await load('../session/route'),
    signIn: await load('../session/route', 'POST'),
    password: await load('../session/password/route', 'POST'),
  });
});

const BASE = 'http://localhost:3000';
const as = (login: string) => ({ cookie: `${SESSION_COOKIE}=${createSession(login)}` });
const ADMIN = 'MARKJOSEPH.REMETIO';
const JEREMIAH = 'JEREMIAH.SANDOVAL';
const LILI = 'LILI.LAGUNOY';
const req = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  new Request(BASE + path, { method, headers: { 'content-type': 'application/json', host: 'localhost:3000', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (p: Record<string, string> = {}) => ({ params: Promise.resolve(p) });
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const WEEK = 'from=2026-09-28T00:00:00%2B08:00&to=2026-10-05T00:00:00%2B08:00';

/** A signed-in person books through the normal flow (prepare, then Confirm) and gets the new ticket. */
async function book(login: string, body: Record<string, unknown>): Promise<string> {
  const who = as(login);
  const created = await json(await r.propose!(req('POST', '/api/proposals', who, { agendaType: 'Meeting', participants: 4, ...body }), params()));
  assert.equal(created.ok, true, JSON.stringify(created));
  const id = created.proposal.id as string;
  const confirmed = await json(await r.confirm!(req('POST', `/api/proposals/${id}`, who), params({ id })));
  return confirmed.booking.ticketNo as string;
}

test('every Admin route needs an Admin: 401 signed out, 403 for everyone else', async () => {
  const gets: Array<[string, string]> = [['overview', '/api/admin/overview'], ['bookings', `/api/admin/bookings?${WEEK}`], ['reports', `/api/admin/reports?${WEEK}`], ['audit', '/api/admin/audit'], ['users', '/api/admin/users'], ['rooms', '/api/admin/rooms']];
  for (const [name, path] of gets) {
    assert.equal((await r[name]!(req('GET', path, {}), params())).status, 401, name);
    const user = await r[name]!(req('GET', path, as(JEREMIAH)), params());
    assert.equal(user.status, 403, name);
    assert.equal((await json(user)).message, 'Admin only.');
  }
  const writes: Array<[string, string, string, unknown, Record<string, string>]> = [
    ['act', 'POST', '/api/admin/bookings/RM-0129906', { action: 'approve' }, { ticketNo: 'RM-0129906' }],
    ['change', 'PATCH', '/api/admin/bookings/RM-0129906', { participants: 3 }, { ticketNo: 'RM-0129906' }],
    ['bulk', 'POST', '/api/admin/bookings/approve', { ticketNos: ['RM-0129906'] }, {}],
    ['swap', 'POST', '/api/admin/bookings/swap', { a: 'RM-0129901', b: 'RM-0129902' }, {}],
    ['addUser', 'POST', '/api/admin/users', { name: 'Tester, Golf', email: 'golf.tester@example.com' }, {}],
    ['editUser', 'PATCH', `/api/admin/users/${JEREMIAH}`, { role: 'admin' }, { login: JEREMIAH }],
    ['reset', 'POST', `/api/admin/users/${LILI}/reset`, undefined, { login: LILI }],
    ['signOutUser', 'POST', `/api/admin/users/${LILI}/signout`, undefined, { login: LILI }],
    ['editRoom', 'PATCH', '/api/admin/rooms/tokyo', { capacity: 99 }, { roomId: 'tokyo' }],
  ];
  for (const [name, method, path, body, p] of writes) {
    assert.equal((await r[name]!(req(method, path, as(JEREMIAH), body), params(p))).status, 403, name);
  }
  const overview = await json(await r.overview!(req('GET', '/api/admin/overview', as(ADMIN)), params()));
  assert.equal(overview.ok, true);
  assert.equal(overview.kpis.waiting, 1, "Charlie's El Nido training request (In Progress) waits for Admin");
  assert.equal(overview.waiting[0].ticketNo, 'RM-0129906');
  assert.equal(overview.waiting[0].ownerEmail, 'charlie.tester@example.com', 'Admin sees the e-mail');
  assert.equal(overview.week.byDay.length, 7);
});

test('Admin approves a request: the owner sees it in My bookings with the note, and a message waits for them', async () => {
  const ticketNo = await book(JEREMIAH, { roomId: 'capetown', agendaType: 'Training', agenda: 'Sprint review', start: '2026-09-29T10:00:00+08:00', end: '2026-09-29T11:00:00+08:00' });
  const approved = await json(await r.act!(req('POST', `/api/admin/bookings/${ticketNo}`, as(ADMIN), { action: 'approve', comment: 'Enjoy' }), params({ ticketNo })));
  assert.equal(approved.booking.status, 'Approved');
  assert.equal(approved.booking.adminComments, 'Enjoy');
  assert.equal(approved.booking.modifiedBy, ADMIN);

  const mine = await json(await r.mine!(req('GET', '/api/bookings/mine', as(JEREMIAH)), params()));
  const b = mine.bookings.find((x: { ticketNo: string }) => x.ticketNo === ticketNo);
  assert.deepEqual([b.status, b.adminComments], ['Approved', 'Enjoy']);

  // The automatic note is unread for Jeremiah until he opens the thread.
  const inbox = await json(await r.threads!(req('GET', '/api/messages', as(JEREMIAH)), params()));
  assert.equal(inbox.unread, 1);
  assert.equal(inbox.threads[0].ticketNo, ticketNo);
  const thread = await json(await r.thread!(req('GET', `/api/messages/${ticketNo}`, as(JEREMIAH)), params({ ticketNo })));
  assert.equal(thread.thread.messages[0].system, true);
  assert.equal(thread.thread.messages[0].text, 'Admin approved this booking. Note: Enjoy');
  assert.equal((await json(await r.threads!(req('GET', '/api/messages', as(JEREMIAH)), params()))).unread, 0);

  // He replies; Admin sees it as unread. Lili can neither read nor write there.
  const sent = await r.send!(req('POST', `/api/messages/${ticketNo}`, as(JEREMIAH), { text: 'Thanks! Can we get the projector too?' }), params({ ticketNo }));
  assert.equal(sent.status, 200);
  assert.equal((await json(sent)).message.mine, true);
  const adminInbox = await json(await r.threads!(req('GET', '/api/messages', as(ADMIN)), params()));
  assert.equal(adminInbox.threads.find((t: { ticketNo: string }) => t.ticketNo === ticketNo).unread, 1);
  assert.equal((await r.thread!(req('GET', `/api/messages/${ticketNo}`, as(LILI)), params({ ticketNo }))).status, 403);
  assert.equal((await r.send!(req('POST', `/api/messages/${ticketNo}`, as(LILI), { text: 'Hi' }), params({ ticketNo }))).status, 403);
  assert.equal((await r.send!(req('POST', `/api/messages/${ticketNo}`, as(JEREMIAH), { text: '   ' }), params({ ticketNo }))).status, 400);

  const again = await r.act!(req('POST', `/api/admin/bookings/${ticketNo}`, as(ADMIN), { action: 'approve' }), params({ ticketNo }));
  assert.equal(again.status, 403);
  assert.match((await json(again)).message, /Only requests waiting for Admin/);

  const log = await json(await r.audit!(req('GET', '/api/admin/audit', as(ADMIN)), params()));
  assert.ok(log.entries.some((e: { action: string; target: string }) => e.action === 'booking.approve' && e.target === ticketNo));
  assert.ok(log.entries.some((e: { action: string; target: string }) => e.action === 'message.send' && e.target === ticketNo));
  assert.ok(!JSON.stringify(log).includes('projector'), 'the log never holds message text');
});

test('Admin turns down with a reason, changes a booking within the rules, and swaps rooms', async () => {
  const t906 = { ticketNo: 'RM-0129906' };
  assert.equal((await r.act!(req('POST', '/api/admin/bookings/RM-0129906', as(ADMIN), { action: 'reject' }), params(t906))).status, 400);
  const rejected = await json(await r.act!(req('POST', '/api/admin/bookings/RM-0129906', as(ADMIN), { action: 'reject', comment: 'El Nido is kept for the audit' }), params(t906)));
  assert.equal(rejected.booking.status, 'Cancelled');

  // Alpha's Amsterdam 9:30–10:30 onto Tue 2–3 PM in Batanes: the demo user has Batanes then.
  const t901 = { ticketNo: 'RM-0129901' };
  const taken = await r.change!(req('PATCH', '/api/admin/bookings/RM-0129901', as(ADMIN), { roomId: 'batanes', start: '2026-09-29T14:00:00+08:00', end: '2026-09-29T15:00:00+08:00' }), params(t901));
  assert.equal(taken.status, 409);
  const clash = await json(taken);
  assert.match(clash.message, /^The room is taken then\. Remetio, Mark Joseph has Batanes/);
  assert.deepEqual(clash.fields, ['room', 'time']);
  const generic = await json(await r.change!(req('PATCH', '/api/admin/bookings/RM-0129901', as(ADMIN), { agenda: 'Meeting' }), params(t901)));
  assert.deepEqual(generic.fields, ['agenda']);
  assert.equal((await r.change!(req('PATCH', '/api/admin/bookings/RM-0129901', as(ADMIN), {}), params(t901))).status, 400);
  const moved = await json(await r.change!(req('PATCH', '/api/admin/bookings/RM-0129901', as(ADMIN), { roomId: 'batanes', participants: 6 }), params(t901)));
  assert.deepEqual([moved.booking.roomId, moved.booking.participants], ['batanes', 6]);
  // The room's rules bind Admin too: Amsterdam holds 5, and a training room takes Training only.
  const crowded = await json(await r.change!(req('PATCH', '/api/admin/bookings/RM-0129901', as(ADMIN), { roomId: 'amsterdam', participants: 6 }), params(t901)));
  assert.deepEqual([crowded.problems, crowded.fields], [['Amsterdam holds up to 5 people, not 6.'], ['participants']]);
  const wrongType = await json(await r.change!(req('PATCH', '/api/admin/bookings/RM-0129901', as(ADMIN), { roomId: 'snowdon' }), params(t901)));
  assert.deepEqual([wrongType.problems, wrongType.fields], [['Snowdon can be booked for Training only, not Meeting.'], ['room']]);

  // Alpha's Central Park 15:00–16:30 and Bravo's Coron 1:30–3:30 PM exchange rooms; Echo's 9 can't take Batanes (6).
  const swapped = await json(await r.swap!(req('POST', '/api/admin/bookings/swap', as(ADMIN), { a: 'RM-0129908', b: 'RM-0129904' }), params()));
  assert.deepEqual(swapped.bookings.map((b: { roomId: string }) => b.roomId), ['coron', 'centralpark']);
  const tooBig = await json(await r.swap!(req('POST', '/api/admin/bookings/swap', as(ADMIN), { a: 'RM-0129905', b: 'RM-0129901' }), params()));
  assert.deepEqual(tooBig.problems, ['RM-0129905: Batanes holds up to 6 people, not 9.']);

  const log = await json(await r.audit!(req('GET', '/api/admin/audit?action=booking.update', as(ADMIN)), params()));
  assert.equal(log.entries.length, 1);
  assert.match(log.entries[0].detail, /^room Amsterdam, 2F → Batanes, 3F; people 4 → 6$/);
});

test('bulk approve approves what is waiting and says why the rest was not', async () => {
  const ticketNo = await book(LILI, { roomId: 'johannesburg', agendaType: 'Training', agenda: 'Design critique', start: '2026-09-29T16:00:00+08:00', end: '2026-09-29T17:00:00+08:00' });
  const res = await json(await r.bulk!(req('POST', '/api/admin/bookings/approve', as(ADMIN), { ticketNos: [ticketNo, 'RM-0129902', 'RM-9'] }), params()));
  assert.deepEqual(res.approved, [ticketNo]);
  assert.deepEqual(res.failed.map((f: { ticketNo: string }) => f.ticketNo), ['RM-0129902', 'RM-9']);
  assert.equal((await r.bulk!(req('POST', '/api/admin/bookings/approve', as(ADMIN), { ticketNos: [] }), params())).status, 400);
});

test('users: Admin adds, resets and disables accounts; a temporary password must be changed', async () => {
  const created = await json(await r.addUser!(req('POST', '/api/admin/users', as(ADMIN), { name: 'Tester, Foxtrot', email: 'foxtrot.tester@example.com' }), params()));
  assert.equal(created.user.login, 'FOXTROT.TESTER');
  assert.equal(created.user.role, 'user');
  assert.equal(created.user.mustChangePassword, true);
  assert.match(created.password, /^[A-Za-z2-9]{16}$/);
  assert.equal((await r.addUser!(req('POST', '/api/admin/users', as(ADMIN), { name: 'Tester, Foxtrot', email: 'Foxtrot.Tester@example.com' }), params())).status, 409);
  assert.equal((await r.addUser!(req('POST', '/api/admin/users', as(ADMIN), { name: 'Foxtrot', email: 'f@example.com' }), params())).status, 400);
  const list = await json(await r.users!(req('GET', '/api/admin/users', as(ADMIN)), params()));
  assert.ok(!JSON.stringify(list).includes('scrypt$'), 'no password hashes leave the server');

  // Sign in with the temporary password; the app asks for a new one first.
  const signIn = (password: string) => r.signIn!(req('POST', '/api/session', {}, { username: 'foxtrot.tester', password }), params());
  const first = await signIn(created.password);
  assert.equal((await json(first)).user.mustChangePassword, true);
  const cookie = { cookie: (first.headers.get('set-cookie') ?? '').split(';')[0] as string };
  const change = (body: unknown) => r.password!(req('POST', '/api/session/password', cookie, body), params());
  assert.equal((await change({ current: created.password, next: 'short' })).status, 400);
  assert.equal((await change({ current: 'not it', next: 'a much longer password' })).status, 403);
  assert.equal((await change({ current: created.password, next: 'a much longer password' })).status, 200);
  assert.equal((await json(await r.session!(req('GET', '/api/session', cookie), params()))).user.mustChangePassword, false);

  // Reset: the old session and password stop working; the new temporary one works.
  const reset = await json(await r.reset!(req('POST', '/api/admin/users/FOXTROT.TESTER/reset', as(ADMIN)), params({ login: 'FOXTROT.TESTER' })));
  assert.equal(reset.user.mustChangePassword, true);
  assert.equal((await json(await r.session!(req('GET', '/api/session', cookie), params()))).user, null);
  assert.equal((await signIn('a much longer password')).status, 401);
  const again = await signIn(reset.password);
  assert.equal(again.status, 200);
  const cookie2 = { cookie: (again.headers.get('set-cookie') ?? '').split(';')[0] as string };

  // Disabled: no sign-in, and the open session ends at once.
  const disabled = await json(await r.editUser!(req('PATCH', '/api/admin/users/FOXTROT.TESTER', as(ADMIN), { disabled: true, division: 'Learning' }), params({ login: 'FOXTROT.TESTER' })));
  assert.deepEqual([disabled.user.disabled, disabled.user.division], [true, 'Learning']);
  assert.equal((await signIn(reset.password)).status, 401);
  assert.equal((await r.mine!(req('GET', '/api/bookings/mine', cookie2), params())).status, 401);

  // An Admin can't take away their own role or access.
  assert.equal((await r.editUser!(req('PATCH', `/api/admin/users/${ADMIN}`, as(ADMIN), { role: 'user' }), params({ login: ADMIN }))).status, 403);
  assert.equal((await r.editUser!(req('PATCH', `/api/admin/users/${ADMIN}`, as(ADMIN), { disabled: true }), params({ login: ADMIN }))).status, 403);
  assert.equal((await r.editUser!(req('PATCH', '/api/admin/users/NOBODY', as(ADMIN), { role: 'user' }), params({ login: 'NOBODY' }))).status, 404);

  // Sign out everywhere ends Lili's open session; a new sign-in works.
  const before = as(LILI);
  await r.signOutUser!(req('POST', `/api/admin/users/${LILI}/signout`, as(ADMIN)), params({ login: LILI }));
  assert.equal((await r.mine!(req('GET', '/api/bookings/mine', before), params())).status, 401);
  await new Promise((done) => setTimeout(done, 5));
  assert.equal((await r.mine!(req('GET', '/api/bookings/mine', as(LILI)), params())).status, 200);

  // A promoted user can use the Admin pages.
  await r.editUser!(req('PATCH', `/api/admin/users/${JEREMIAH}`, as(ADMIN), { role: 'admin' }), params({ login: JEREMIAH }));
  assert.equal((await r.users!(req('GET', '/api/admin/users', as(JEREMIAH)), params())).status, 200);
  await r.editUser!(req('PATCH', `/api/admin/users/${JEREMIAH}`, as(ADMIN), { role: 'user' }), params({ login: JEREMIAH }));

  const log = JSON.stringify(await json(await r.audit!(req('GET', '/api/admin/audit', as(ADMIN)), params())));
  for (const secret of [created.password, reset.password, 'a much longer password']) assert.ok(!log.includes(secret), 'no passwords in the log');
  for (const action of ['user.create', 'user.reset', 'user.update', 'user.signout', 'session.password', 'session.signin', 'session.signin_failed']) assert.ok(log.includes(`"${action}"`), action);
});

test('rooms: Admin changes details and everyone sees them; the data notes stay with Admin', async () => {
  const edited = await json(await r.editRoom!(req('PATCH', '/api/admin/rooms/capetown', as(ADMIN), { capacity: 6, notes: 'New screen' }), params({ roomId: 'capetown' })));
  assert.deepEqual([edited.room.capacity, edited.room.notes], [6, 'New screen']);
  const pub = await json(await r.publicRooms!(req('GET', '/api/rooms?site=Manila', as(LILI)), params()));
  const capetown = pub.rooms.find((x: { id: string }) => x.id === 'capetown');
  assert.equal(capetown.capacity, 6);
  assert.equal(capetown.notes, undefined);
  assert.equal((await r.editRoom!(req('PATCH', '/api/admin/rooms/atlantis', as(ADMIN), { capacity: 6 }), params({ roomId: 'atlantis' }))).status, 404);
  assert.equal((await r.editRoom!(req('PATCH', '/api/admin/rooms/capetown', as(ADMIN), { capacity: 0 }), params({ roomId: 'capetown' }))).status, 400);
  const log = await json(await r.audit!(req('GET', '/api/admin/audit?action=room.update', as(ADMIN)), params()));
  assert.equal(log.entries[0].detail, 'capacity 5 → 6; notes – → New screen');
});

test('reports cover the range; a range over 92 days is refused', async () => {
  const res = await json(await r.reports!(req('GET', `/api/admin/reports?${WEEK}`, as(ADMIN)), params()));
  assert.equal(res.report.byDay.length, 7);
  assert.equal(res.report.heatmap.length, 7);
  assert.ok(res.report.totals.bookings > 10);
  assert.ok(res.report.byRoom.some((x: { roomId: string; count: number }) => x.roomId === 'london' && x.count === 1));
  const tooLong = await r.reports!(req('GET', '/api/admin/reports?from=2026-01-01T00:00:00%2B08:00&to=2026-06-01T00:00:00%2B08:00', as(ADMIN)), params());
  assert.equal(tooLong.status, 400);
  const list = await json(await r.bookings!(req('GET', `/api/admin/bookings?${WEEK}&status=Cancelled`, as(ADMIN)), params()));
  assert.ok(list.bookings.every((b: { status: string; agenda?: string }) => b.status === 'Cancelled' && b.agenda), 'Admin sees every field');
});

test('the change feed tells Admin what happened since it last looked, so new bookings show at once', async () => {
  assert.equal((await r.changes!(req('GET', '/api/admin/changes', as(JEREMIAH)), params())).status, 403);
  const start = await json(await r.changes!(req('GET', '/api/admin/changes', as(ADMIN)), params()));
  assert.deepEqual(start.entries, [], 'without "after": only where the log is now');
  assert.ok(start.last > 0);
  const ticketNo = await book(LILI, { roomId: 'intramuros', agenda: 'Quarterly review', start: '2026-09-29T08:00:00+08:00', end: '2026-09-29T09:00:00+08:00' });
  const next = await json(await r.changes!(req('GET', `/api/admin/changes?after=${start.last}`, as(ADMIN)), params()));
  const created = next.entries.find((e: { action: string }) => e.action === 'booking.create');
  assert.equal(created.target, ticketNo);
  assert.equal(created.actorName, 'Lagunoy, Lili');
  assert.match(created.detail, /^Intramuros, 3F · Tue, Sep 29, 8:00 AM – 9:00 AM$/);
  assert.ok(next.last > start.last);
  assert.deepEqual((await json(await r.changes!(req('GET', `/api/admin/changes?after=${next.last}`, as(ADMIN)), params()))).entries, []);
  // More than 20 since the last look: the oldest 20 first, and `last` where they stop, so nothing is skipped.
  const first = await json(await r.changes!(req('GET', '/api/admin/changes?after=0', as(ADMIN)), params()));
  assert.ok(next.last > 20);
  assert.deepEqual(first.entries.map((e: { id: number }) => e.id), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(first.last, 20);
  assert.equal((await json(await r.changes!(req('GET', '/api/admin/changes?after=20', as(ADMIN)), params()))).entries[0].id, 21);
});


test('nobody checked in 15 minutes after the start: the next request releases the booking, logs it and tells the owner', async () => {
  // RM-0129901 (Tester, Alpha) starts Mon 9:30 AM and nobody checks in. Move the demo clock past 9:45.
  process.env.DEMO_NOW = '2026-09-28T09:46:00+08:00';
  try {
    const list = await json(await r.bookings!(req('GET', `/api/admin/bookings?${WEEK}`, as(ADMIN)), params()));
    const b = list.bookings.find((x: { ticketNo: string }) => x.ticketNo === 'RM-0129901');
    assert.deepEqual([b.status, b.modifiedBy, b.adminComments], ['Cancelled', 'SYSTEM', 'Released: nobody checked in within 15 minutes of the start.']);
    assert.equal(list.bookings.find((x: { ticketNo: string }) => x.ticketNo === 'RM-0129902').status, 'Approved', 'Tokyo at 10:00 is not due yet');
    const log = await json(await r.audit!(req('GET', '/api/admin/audit', as(ADMIN)), params()));
    const entry = log.entries.find((e: { action: string; target: string }) => e.action === 'booking.release' && e.target === 'RM-0129901');
    assert.deepEqual([entry?.actor, entry?.actorName], ['SYSTEM', 'REPH Rooms']);
    assert.equal(log.entries.filter((e: { action: string }) => e.action === 'booking.release').length, 1, 'released once');
    const thread = await json(await r.thread!(req('GET', '/api/messages/RM-0129901', as(ADMIN)), params({ ticketNo: 'RM-0129901' })));
    assert.match(thread.thread.messages.at(-1).text, /^Released: nobody checked in within 15 minutes of the start/);
  } finally {
    process.env.DEMO_NOW = '2026-09-28T09:00:00+08:00';
  }
});
