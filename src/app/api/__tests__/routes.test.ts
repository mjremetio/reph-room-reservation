/**
 * API routes on the demo scenario (docs/spec/04-api.md): status codes, validation and the privacy filter.
 * Route handlers are called directly with Request objects; the demo clock starts Mon, Sep 28, 9:00 AM.
 */
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createSession, SESSION_COOKIE } from '../../../lib/session';

process.env.DEMO_NOW = '2026-09-28T09:00:00+08:00';
process.env.RESERVATION_GATEWAY = 'mock';
process.env.MOCK_SCENARIO = 'demo';

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
let routes: {
  bookings: Handler;
  rooms: Handler;
  availability: Handler;
  search: Handler;
  propose: Handler;
  confirm: Handler;
  mine: Handler;
  checkIn: Handler;
  health: Handler;
  session: Handler;
  signIn: Handler;
  signOut: Handler;
};

before(async () => {
  routes = {
    bookings: (await import('../bookings/route')).GET as Handler,
    rooms: (await import('../rooms/route')).GET as Handler,
    availability: (await import('../availability/route')).GET as Handler,
    search: (await import('../search/route')).POST as Handler,
    propose: (await import('../proposals/route')).POST as Handler,
    confirm: (await import('../proposals/[id]/route')).POST as Handler,
    mine: (await import('../bookings/mine/route')).GET as Handler,
    checkIn: (await import('../bookings/[ticketNo]/check-in/route')).POST as Handler,
    health: (await import('../health/route')).GET as Handler,
    session: (await import('../session/route')).GET as Handler,
    signIn: (await import('../session/route')).POST as Handler,
    signOut: (await import('../session/route')).DELETE as Handler,
  };
});

const BASE = 'http://localhost:3000';
const noParams = { params: Promise.resolve({}) };
/** Signed in as someone: the session cookie that POST /api/session sets. Pass {} for nobody signed in. */
const as = (login: string) => ({ cookie: `${SESSION_COOKIE}=${createSession(login)}` });
const AS_DEMO_USER = as('MARKJOSEPH.REMETIO');
const get = (path: string, headers: Record<string, string> = AS_DEMO_USER) => new Request(BASE + path, { headers });
const post = (path: string, body?: unknown, headers: Record<string, string> = AS_DEMO_USER) =>
  new Request(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost:3000', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const json = async (res: Response) => (await res.json()) as Record<string, any>;

const bookAmsterdam = {
  roomId: 'amsterdam',
  agendaType: 'Meeting',
  agenda: 'Q4 pipeline review',
  start: '2026-09-28T15:00:00+08:00',
  end: '2026-09-28T16:00:00+08:00',
  participants: 5,
};

test('GET /api/rooms lists rooms and filters by floor', async () => {
  const all = await json(await routes.rooms(get('/api/rooms?site=Manila'), noParams));
  assert.equal(all.ok, true);
  assert.ok(all.rooms.length > 30);
  const third = await json(await routes.rooms(get('/api/rooms?floor=3F'), noParams));
  assert.ok(third.rooms.every((r: { floor: string }) => r.floor === '3F'));
  const bad = await routes.rooms(get('/api/rooms?site=Cebu'), noParams);
  assert.equal(bad.status, 400);
  assert.equal((await json(bad)).code, 'INVALID');
});

test('GET /api/availability shares only owner, division, time and size of other bookings', async () => {
  const res = await routes.availability(get('/api/availability?floor=2F&from=2026-09-28T00:00:00%2B08:00&to=2026-09-29T00:00:00%2B08:00'), noParams);
  assert.equal(res.status, 200);
  const body = await json(res);
  const central = body.rooms.find((r: { roomId: string }) => r.roomId === 'centralpark');
  const alphas = central.busy.find((b: { ticketNo: string }) => b.ticketNo === 'RM-0129908');
  assert.deepEqual(Object.keys(alphas).sort(), ['division', 'end', 'mine', 'owner', 'participants', 'roomId', 'start', 'status', 'ticketNo']);
  assert.equal(alphas.owner, 'Tester, Alpha');
  assert.equal(alphas.mine, false);
  assert.ok(!JSON.stringify(body).includes('Team sync'), 'no agenda titles of others');
  assert.ok(!JSON.stringify(body).includes('@example.com'), 'no emails');

  const tokyo = body.rooms.find((r: { roomId: string }) => r.roomId === 'tokyo');
  const mine = tokyo.busy.find((b: { ticketNo: string }) => b.ticketNo === 'RM-0129902');
  assert.equal(mine.mine, true);
  assert.equal(mine.agenda, 'Weekly touchpoint meeting');
});

test('GET /api/availability rejects ranges over 7 days', async () => {
  const res = await routes.availability(get('/api/availability?from=2026-09-28T00:00:00%2B08:00&to=2026-10-07T00:00:00%2B08:00'), noParams);
  assert.equal(res.status, 400);
});

test('POST /api/search runs the shared search (flow B) and 400s on rule problems', async () => {
  const res = await routes.search(
    post('/api/search', { agendaType: 'Meeting', start: '2026-09-28T14:00:00+08:00', end: '2026-09-28T16:00:00+08:00', participants: 8 }),
    noParams,
  );
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.flow, 'B');
  const cp = body.results.find((m: { roomId: string }) => m.roomId === 'centralpark');
  assert.equal(cp.availability, 'partial');
  assert.equal(cp.conflicts[0].owner, 'Tester, Alpha');
  assert.equal(cp.conflicts[0].agenda, undefined, 'no agenda of others');
  assert.equal(cp.conflicts[0].participants, 4);

  const past = await routes.search(
    post('/api/search', { agendaType: 'Meeting', start: '2026-09-28T07:00:00+08:00', end: '2026-09-28T08:00:00+08:00', participants: 2 }),
    noParams,
  );
  assert.equal(past.status, 400);
  assert.deepEqual((await json(past)).problems, ['That time has already passed.']);

  const noOffset = await routes.search(post('/api/search', { agendaType: 'Meeting', start: '2026-09-28 14:00', end: '2026-09-28 15:00', participants: 2 }), noParams);
  assert.equal(noOffset.status, 400);
});

test('POST /api/proposals validates like propose_booking: 400 generic agenda, 404 unknown room, 409 taken', async () => {
  const generic = await routes.propose(post('/api/proposals', { ...bookAmsterdam, agenda: 'Meeting' }), noParams);
  assert.equal(generic.status, 400);
  const unknown = await routes.propose(post('/api/proposals', { ...bookAmsterdam, roomId: 'atlantis' }), noParams);
  assert.equal(unknown.status, 404);
  const taken = await routes.propose(post('/api/proposals', { ...bookAmsterdam, roomId: 'centralpark' }), noParams);
  assert.equal(taken.status, 409);
  const visitor = await routes.propose(post('/api/proposals', { ...bookAmsterdam, roomId: 'office-2f-025' }), noParams);
  assert.equal(visitor.status, 400);
});

test('a proposal books once on confirm; a second confirm gets 410 (AC-5.1, AC-5.2)', async () => {
  const created = await json(await routes.propose(post('/api/proposals', bookAmsterdam), noParams));
  assert.equal(created.ok, true);
  const id = created.proposal.id as string;

  const before = await json(await routes.mine(get('/api/bookings/mine'), noParams));
  assert.ok(!before.bookings.some((b: { roomId: string }) => b.roomId === 'amsterdam'), 'nothing booked before Confirm');

  const first = await routes.confirm(post(`/api/proposals/${id}`), { params: Promise.resolve({ id }) });
  assert.equal(first.status, 200);
  const booked = (await json(first)).booking;
  assert.equal(booked.roomId, 'amsterdam');
  assert.equal(booked.status, 'Approved', "the owner's room booking list: a Meeting needs no approval");
  const after = await json(await routes.mine(get('/api/bookings/mine'), noParams));
  assert.equal(after.bookings.find((b: { ticketNo: string }) => b.ticketNo === booked.ticketNo)?.status, 'Approved', 'in My bookings at once');

  const second = await routes.confirm(post(`/api/proposals/${id}`), { params: Promise.resolve({ id }) });
  assert.equal(second.status, 410);

  // The room is now taken for anyone else.
  const again = await routes.propose(post('/api/proposals', { ...bookAmsterdam, agenda: 'Another review' }), noParams);
  assert.equal(again.status, 409);
});

test("another user can't confirm someone's proposal (AC-5.3)", async () => {
  // An hour the demo user has free (they took Amsterdam at 3 PM above: one room per person at a time).
  const later = { start: '2026-09-28T17:00:00+08:00', end: '2026-09-28T18:00:00+08:00' };
  const created = await json(await routes.propose(post('/api/proposals', { ...bookAmsterdam, ...later, roomId: 'capetown' }), noParams));
  const id = created.proposal.id as string;
  const res = await routes.confirm(post(`/api/proposals/${id}`, undefined, as('JEREMIAH.SANDOVAL')), { params: Promise.resolve({ id }) });
  assert.equal(res.status, 410);
});

test('sign-in: every data route needs a session; the signed-in person is the requestor', async () => {
  // Nobody signed in: 401 everywhere, browsing included.
  assert.equal((await routes.rooms(get('/api/rooms?site=Manila', {}), noParams)).status, 401);
  assert.equal((await routes.bookings(get('/api/bookings?from=2026-09-28T00:00:00%2B08:00&to=2026-09-29T00:00:00%2B08:00', {}), noParams)).status, 401);
  assert.equal((await routes.mine(get('/api/bookings/mine', {}), noParams)).status, 401);
  const noOne = await routes.propose(post('/api/proposals', bookAmsterdam, {}), noParams);
  assert.equal(noOne.status, 401);
  assert.equal((await json(noOne)).code, 'UNAUTHORIZED');
  assert.deepEqual((await json(await routes.session(get('/api/session', {}), noParams))).user, null);

  // A tampered, foreign or unknown-account cookie counts as nobody.
  const token = createSession('MARKJOSEPH.REMETIO') as string;
  const [payload, signature] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ login: 'LILI.LAGUNOY', exp: Date.now() + 3_600_000 })).toString('base64url');
  for (const bad of [`${forged}.${signature}`, `${payload}.x${signature}`, 'garbage', createSession('ALPHA.TESTER') as string]) {
    assert.equal((await routes.mine(get('/api/bookings/mine', { cookie: `${SESSION_COOKIE}=${bad}` }), noParams)).status, 401, bad);
  }

  // Wrong password or unknown username: 401 with the same message; nothing about which part was wrong.
  const wrong = await routes.signIn(post('/api/session', { username: 'markjoseph.remetio', password: 'not the password' }, {}), noParams);
  const unknown = await routes.signIn(post('/api/session', { username: 'nobody', password: 'not the password' }, {}), noParams);
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal((await json(wrong)).message, (await json(unknown)).message);
  assert.equal(wrong.headers.get('set-cookie'), null);
  assert.equal((await routes.signIn(post('/api/session', { username: '', password: '' }, {}), noParams)).status, 400);

  // Signed in: the session names the person (no e-mail) and they see their own bookings.
  const me = await json(await routes.session(get('/api/session', as('LILI.LAGUNOY')), noParams));
  assert.deepEqual(me.user, { login: 'LILI.LAGUNOY', name: 'Lagunoy, Lili', division: null, role: 'user', mustChangePassword: false });
  const lili = await json(await routes.mine(get('/api/bookings/mine', as('LILI.LAGUNOY')), noParams));
  const mark = await json(await routes.mine(get('/api/bookings/mine'), noParams));
  assert.deepEqual(lili.bookings, []);
  assert.ok(mark.bookings.length > 0);
  const list = await json(await routes.bookings(get('/api/bookings?from=2026-09-28T00:00:00%2B08:00&to=2026-09-29T00:00:00%2B08:00', as('JEREMIAH.SANDOVAL')), noParams));
  assert.ok(list.bookings.every((b: { mine: boolean; agenda?: string }) => !b.mine && b.agenda === undefined), "someone else's agendas stay private");

  // Sign out clears the cookie.
  const out = await routes.signOut(new Request(BASE + '/api/session', { method: 'DELETE', headers: { host: 'localhost:3000' } }), noParams);
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie') ?? '', /^reph-session=; .*Max-Age=0/);
});

test('POST /api/session signs in with the password and sets an HttpOnly session cookie', async () => {
  const { hashPassword } = await import('../../../lib/passwords');
  const { getStore } = await import('../../../store');
  // The real hashes stay secret; swap in a known one for this test only.
  const original = getStore().accounts.find('JEREMIAH.SANDOVAL')?.passwordHash as string;
  getStore().accounts.update('JEREMIAH.SANDOVAL', { passwordHash: await hashPassword('correct horse battery') });
  try {
    const res = await routes.signIn(post('/api/session', { username: 'Jeremiah.Sandoval@lexisnexis.com', password: 'correct horse battery' }, {}), noParams);
    assert.equal(res.status, 200);
    assert.deepEqual((await json(res)).user, { login: 'JEREMIAH.SANDOVAL', name: 'Sandoval, Jeremiah', division: null, role: 'user', mustChangePassword: false });
    const cookie = res.headers.get('set-cookie') ?? '';
    assert.match(cookie, /^reph-session=[\w-]+\.[\w-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=43200$/);
    const token = cookie.split(';')[0] ?? '';
    const me = await json(await routes.session(get('/api/session', { cookie: token }), noParams));
    assert.equal(me.user.login, 'JEREMIAH.SANDOVAL');
  } finally {
    getStore().accounts.update('JEREMIAH.SANDOVAL', { passwordHash: original });
  }
});

test('every account is in the demo employee list with the same name, e-mail and division', async () => {
  const { ACCOUNTS } = await import('../../../config/accounts');
  const { DEMO_SCENARIO } = await import('../../../data/scenarios');
  // The test Admin is there outside production builds only (its password is known).
  assert.deepEqual(ACCOUNTS.map((a) => a.login), ['MARKJOSEPH.REMETIO', 'JEREMIAH.SANDOVAL', 'LILI.LAGUNOY', 'TAEHWAN.KIM', 'ALBERT.VILLAGRACIA', 'DUMMY.ACCOUNT', 'ADMIN.TEST']);
  assert.deepEqual(ACCOUNTS.filter((a) => a.role === 'admin').map((a) => a.login), ['MARKJOSEPH.REMETIO', 'ADMIN.TEST']);
  for (const a of ACCOUNTS) {
    const p = DEMO_SCENARIO.people.find((x) => x.email === a.email);
    assert.ok(p, a.login);
    assert.equal(p.name, a.name);
    assert.equal(p.division, a.division);
    assert.equal(a.login, a.email.split('@')[0]?.toUpperCase(), 'the login is the e-mail name, like the tool');
    assert.match(a.passwordHash, /^scrypt\$[\w-]{22}\$[\w-]{43}$/, 'only a hash is stored');
  }
});

test('the empty scenario lists exactly the sign-in accounts as its people, with the same name, e-mail and division', async () => {
  const { ACCOUNTS } = await import('../../../config/accounts');
  const { EMPTY_SCENARIO } = await import('../../../data/scenarios');
  assert.deepEqual(EMPTY_SCENARIO.people.map((p) => p.email), ACCOUNTS.map((a) => a.email));
  for (const a of ACCOUNTS) {
    const p = EMPTY_SCENARIO.people.find((x) => x.email === a.email);
    assert.equal(p?.name, a.name, a.login);
    assert.equal(p?.division, a.division, a.login);
  }
});

test('one room per person: a second room at the same time is refused before and at Confirm', async () => {
  // Jeremiah prepares two rooms for the same hour, confirms the first, and the second card is refused.
  const jeremiah = as('JEREMIAH.SANDOVAL');
  const at = { start: '2026-09-30T13:00:00+08:00', end: '2026-09-30T14:00:00+08:00' };
  const first = await json(await routes.propose(post('/api/proposals', { ...bookAmsterdam, ...at, roomId: 'capetown', agenda: 'Vendor call' }, jeremiah), noParams));
  const second = await json(await routes.propose(post('/api/proposals', { ...bookAmsterdam, ...at, roomId: 'johannesburg', agenda: 'Vendor call' }, jeremiah), noParams));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true, 'nothing held yet, so both cards can show');
  const id1 = first.proposal.id as string;
  const id2 = second.proposal.id as string;
  assert.equal((await routes.confirm(post(`/api/proposals/${id1}`, undefined, jeremiah), { params: Promise.resolve({ id: id1 }) })).status, 200);
  const refused = await routes.confirm(post(`/api/proposals/${id2}`, undefined, jeremiah), { params: Promise.resolve({ id: id2 }) });
  assert.equal(refused.status, 409);
  assert.match((await json(refused)).message, /One room per person at a time/);

  // Preparing a third one now fails straight away and names the booking they already have.
  const third = await routes.propose(post('/api/proposals', { ...bookAmsterdam, ...at, roomId: 'batanes', agenda: 'Vendor call' }, jeremiah), noParams);
  assert.equal(third.status, 409);
  const body = await json(third);
  assert.match(body.message, /^You already have Cape Town, 2F /);
  assert.deepEqual(body.fields, ['time']);

  // The search warns too, and marks his own booking as his (no "Ask to swap" with himself).
  const search = await json(await routes.search(post('/api/search', { agendaType: 'Meeting', ...at, participants: 3 }, jeremiah), noParams));
  assert.ok(search.warnings.some((w: string) => w.startsWith('You already have Cape Town, 2F')));
  const cape = search.results.find((r: { roomId: string }) => r.roomId === 'capetown');
  assert.equal(cape?.conflicts?.[0]?.mine, true);
  const others = await json(await routes.search(post('/api/search', { agendaType: 'Meeting', ...at, participants: 3 }, as('LILI.LAGUNOY')), noParams));
  assert.equal(others.results.find((r: { roomId: string }) => r.roomId === 'capetown')?.conflicts?.[0]?.mine, false);
  assert.deepEqual(others.warnings, []);
  // No warning when there is no room to book at the site anyway.
  const iloilo = await json(await routes.search(post('/api/search', { site: 'Iloilo', agendaType: 'Meeting', ...at, participants: 3 }, jeremiah), noParams));
  assert.equal(iloilo.flow, 'none');
  assert.deepEqual(iloilo.warnings, []);
});

test('cancellation needs a proposal and only works on your own bookings (AC-8.1)', async () => {
  const others = await routes.propose(post('/api/proposals', { action: 'cancel', ticketNo: 'RM-0129908' }), noParams);
  assert.equal(others.status, 403);

  const created = await json(await routes.propose(post('/api/proposals', { action: 'cancel', ticketNo: 'RM-0129912' }), noParams));
  assert.equal(created.ok, true);
  const stillThere = await json(await routes.mine(get('/api/bookings/mine'), noParams));
  assert.ok(stillThere.bookings.some((b: { ticketNo: string }) => b.ticketNo === 'RM-0129912'), 'not cancelled before the button');

  const id = created.cancel.proposalId as string;
  const res = await routes.confirm(post(`/api/proposals/${id}`), { params: Promise.resolve({ id }) });
  assert.equal(res.status, 200);
  const after = await json(await routes.mine(get('/api/bookings/mine'), noParams));
  assert.ok(!after.bookings.some((b: { ticketNo: string }) => b.ticketNo === 'RM-0129912'), 'cancelled bookings are hidden (AC-6.1)');
});

test('check-in: open window → 200; outside → 403 with the window; not yours → 403', async () => {
  const mine = await json(await routes.mine(get('/api/bookings/mine'), noParams));
  const tokyo = mine.bookings.find((b: { ticketNo: string }) => b.ticketNo === 'RM-0129902');
  assert.equal(tokyo.checkIn.open, true);

  const ok = await routes.checkIn(post('/api/bookings/RM-0129902/check-in'), { params: Promise.resolve({ ticketNo: 'RM-0129902' }) });
  assert.equal(ok.status, 200);
  assert.equal((await json(ok)).booking.status, 'Checked-In');

  const alphas = await routes.checkIn(post('/api/bookings/RM-0129908/check-in'), { params: Promise.resolve({ ticketNo: 'RM-0129908' }) });
  assert.equal(alphas.status, 403);

  const unknown = await routes.checkIn(post('/api/bookings/RM-0000000/check-in'), { params: Promise.resolve({ ticketNo: 'RM-0000000' }) });
  assert.equal(unknown.status, 404);
});

test('POSTs from another origin are refused', async () => {
  const res = await routes.propose(post('/api/proposals', bookAmsterdam, { origin: 'https://evil.example.com' }), noParams);
  assert.equal(res.status, 403);
});

test('GET /api/health reports configuration without secrets', async () => {
  const body = await json(await routes.health(get('/api/health'), noParams));
  assert.equal(body.ok, true);
  assert.equal(body.gateway, 'mock');
  assert.equal(body.clock, 'demo');
  assert.match(body.now, /^2026-09-28T01:0/);
  assert.ok(!JSON.stringify(body).includes('sk-'));
});

test('the form fields travel with the proposal; Urgent follows the form rule', async () => {
  const training = {
    roomId: 'mtapo',
    agendaType: 'Training',
    agenda: 'Excel basics',
    start: '2026-09-29T14:00:00+08:00',
    end: '2026-09-29T16:00:00+08:00',
    participants: 12,
    priority: 'Urgent',
    trainingType: 'Virtual',
    specialInstructions: 'U-shape seating',
  };
  const created = await json(await routes.propose(post('/api/proposals', training), noParams));
  assert.equal(created.ok, true, created.message);
  assert.equal(created.proposal.priority, 'Urgent');
  assert.equal(created.proposal.trainingType, 'Virtual');
  assert.equal(created.proposal.specialInstructions, 'U-shape seating');

  const id = created.proposal.id as string;
  const booked = (await json(await routes.confirm(post(`/api/proposals/${id}`), { params: Promise.resolve({ id }) }))).booking;
  assert.equal(booked.priority, 'Urgent');
  assert.equal(booked.trainingType, 'Virtual');
  assert.equal(booked.createdBy, 'MARKJOSEPH.REMETIO');
  assert.ok(booked.createdAt);
  assert.equal(booked.status, 'In Progress', "the owner's room booking list: Training waits for Admin's approval");

  // Type of Training is for training only: a meeting drops it even though the form always sends one.
  const meeting = await json(
    await routes.propose(post('/api/proposals', { ...bookAmsterdam, start: '2026-09-28T18:00:00+08:00', end: '2026-09-28T19:00:00+08:00', roomId: 'capetown', trainingType: 'Virtual' }), noParams),
  );
  assert.equal(meeting.ok, true);
  assert.equal(meeting.proposal.trainingType, undefined);

  // A meeting on Friday is more than 24 hours away: Urgent is refused.
  const late = await routes.propose(post('/api/proposals', { ...bookAmsterdam, start: '2026-10-02T15:00:00+08:00', end: '2026-10-02T16:00:00+08:00', priority: 'Urgent' }), noParams);
  assert.equal(late.status, 400);
  assert.match((await json(late)).message, /Urgent/);
});

test("other people's bookings never carry the form's private fields", async () => {
  const body = await json(await routes.availability(get('/api/availability?floor=2F&from=2026-09-28T00:00:00%2B08:00&to=2026-09-29T00:00:00%2B08:00'), noParams));
  for (const room of body.rooms) {
    for (const b of room.busy) {
      if (b.mine) continue;
      for (const key of ['agenda', 'agendaType', 'priority', 'trainingType', 'specialInstructions', 'createdBy', 'createdAt', 'modifiedBy', 'adminComments']) {
        assert.equal(b[key], undefined, `${b.ticketNo} exposes ${key}`);
      }
    }
  }
});

test('GET /api/bookings is the tool list: every status, the search panel filters, privacy kept', async () => {
  const day = 'from=2026-09-28T00:00:00%2B08:00&to=2026-09-29T06:00:00%2B08:00';
  const all = await json(await routes.bookings(get(`/api/bookings?${day}`), noParams));
  assert.ok(all.bookings.some((b: { status: string }) => b.status === 'Cancelled'), 'cancelled rows are listed like in the tool');
  const cape = await json(await routes.bookings(get(`/api/bookings?${day}&roomId=capetown`), noParams));
  assert.ok(cape.bookings.every((b: { roomId: string }) => b.roomId === 'capetown'));
  const alpha = await json(await routes.bookings(get(`/api/bookings?${day}&employee=alpha`), noParams));
  assert.ok(alpha.bookings.length > 0 && alpha.bookings.every((b: { owner: string }) => b.owner === 'Tester, Alpha'));
  // Type of agenda: others are matched by whether their room takes that type, so their category is never revealed.
  const { ROOMS } = await import('../../../data/rooms');
  const takes = (t: string) => ROOMS.filter((r) => (r.agendas as string[]).includes(t)).map((r) => r.id);
  const training = await json(await routes.bookings(get(`/api/bookings?${day}&agendaType=Training`), noParams));
  assert.ok(training.bookings.length > 0);
  assert.ok(training.bookings.every((b: { roomId: string }) => takes('Training').includes(b.roomId)));
  assert.ok(training.bookings.every((b: { mine: boolean; agendaType?: string }) => b.mine || b.agendaType === undefined));
  const halls = await json(await routes.bookings(get(`/api/bookings?from=2026-10-02T00:00:00%2B08:00&to=2026-10-03T00:00:00%2B08:00&agendaType=Multi-purpose`), noParams));
  assert.deepEqual(halls.bookings.map((b: { roomId: string }) => b.roomId).sort(), ['mph1', 'mph2']);
  // Without dates: every booking, past and future (the owner's request); any range may be asked for, "to" after "from".
  const everything = await json(await routes.bookings(get('/api/bookings'), noParams));
  assert.ok(everything.bookings.some((b: { ticketNo: string }) => b.ticketNo === 'RM-0129901'), 'Monday');
  assert.ok(everything.bookings.some((b: { roomId: string }) => b.roomId === 'mph1'), 'Friday');
  assert.ok(everything.bookings.every((b: Record<string, unknown>) => b.mine || b.agenda === undefined), 'privacy kept');
  const fromFriday = await json(await routes.bookings(get('/api/bookings?from=2026-10-02T00:00:00%2B08:00'), noParams));
  assert.ok(fromFriday.bookings.length > 0 && fromFriday.bookings.every((b: { end: string }) => Date.parse(b.end) > Date.parse('2026-10-02T00:00:00+08:00')));
  assert.equal((await routes.bookings(get('/api/bookings?from=2026-09-01T00:00:00%2B08:00&to=2026-10-15T00:00:00%2B08:00'), noParams)).status, 200);
  assert.equal((await routes.bookings(get('/api/bookings?from=2026-10-15T00:00:00%2B08:00&to=2026-09-01T00:00:00%2B08:00'), noParams)).status, 400);
});

test('a weekly series books every date or none, and says which dates clash', async () => {
  const weekly = {
    roomId: 'binondo',
    agendaType: 'Meeting',
    agenda: 'Sprint planning',
    start: '2026-09-29T09:00:00+08:00',
    end: '2026-09-29T10:00:00+08:00',
    participants: 3,
    hardwareRequirements: ['Webcam'],
    recurrence: { freq: 'Weekly', every: 1, days: ['Tuesday'], until: '2026-10-06T23:59:00+08:00' },
  };
  const created = await json(await routes.propose(post('/api/proposals', weekly), noParams));
  assert.equal(created.ok, true, created.message);
  assert.equal(created.proposal.dates.length, 2);
  assert.deepEqual(created.proposal.hardwareRequirements, ['Webcam']);
  const id = created.proposal.id as string;
  const confirmed = await json(await routes.confirm(post(`/api/proposals/${id}`), { params: Promise.resolve({ id }) }));
  assert.equal(confirmed.dates, 2);
  assert.equal(confirmed.booking.recurrence.freq, 'Weekly');

  // The same series again clashes on both dates: nothing is booked and the dates are listed.
  const again = await routes.propose(post('/api/proposals', { ...weekly, agenda: 'Another planning' }), noParams);
  assert.equal(again.status, 409);
  const problems = (await json(again)).problems as string[];
  assert.match(problems[0] ?? '', /2 of 2 dates/);
  assert.ok(problems.some((p) => p.startsWith('Tue, Oct 6')));

  const badHardware = await routes.propose(post('/api/proposals', { ...weekly, hardwareRequirements: ['Jetpack'] }), noParams);
  assert.equal(badHardware.status, 400);
});

test('errors name the form fields to mark red', async () => {
  const clash = await routes.propose(post('/api/proposals', { ...bookAmsterdam, roomId: 'centralpark', agenda: 'Team sync' }), noParams);
  assert.equal(clash.status, 409);
  assert.deepEqual((await json(clash)).fields, ['room', 'time']);

  const generic = await json(await routes.propose(post('/api/proposals', { ...bookAmsterdam, roomId: 'capetown', agenda: 'Meeting' }), noParams));
  assert.deepEqual(generic.fields, ['agenda']);

  const past = await json(await routes.propose(post('/api/proposals', { ...bookAmsterdam, roomId: 'capetown', start: '2026-09-28T06:00:00+08:00', end: '2026-09-28T07:00:00+08:00' }), noParams));
  assert.deepEqual(past.fields, ['time']);

  // The owner's room booking list: the room's types of agenda and its capacity, checked when booking too.
  const wrongType = await routes.propose(post('/api/proposals', { ...bookAmsterdam, roomId: 'mph1', agenda: 'Team sync' }), noParams);
  assert.equal(wrongType.status, 400);
  assert.deepEqual(await json(wrongType).then((b) => [b.problems, b.fields]), [['MPH 1 can be booked for Multi-purpose only, not Meeting.'], ['room']]);
  const crowded = await json(await routes.propose(post('/api/proposals', { ...bookAmsterdam, roomId: 'capetown', participants: 6, agenda: 'Team sync' }), noParams));
  assert.deepEqual([crowded.problems, crowded.fields], [['Cape Town holds up to 5 people, not 6.'], ['participants']]);
  const closed = await json(await routes.propose(post('/api/proposals', { ...bookAmsterdam, roomId: 'tokyo', agenda: 'Team sync', participants: 2 }), noParams));
  assert.deepEqual([closed.problems, closed.fields], [["Tokyo can't be booked."], ['room']]);

});

test('bad input answers 400 with a message that names the field', async () => {
  // A time without an offset is a 400, not a 500 (the range checks only compare real dates).
  const noOffset = 'from=2026-09-28T06:00:00&to=2026-09-29T06:00:00%2B08:00';
  for (const route of [routes.availability, routes.bookings]) {
    const res = await route(get(`/api/${route === routes.availability ? 'availability' : 'bookings'}?${noOffset}`), noParams);
    assert.equal(res.status, 400);
    assert.match((await json(res)).message, /^from: /);
  }
  // A booking body without "action" is read as a booking, so a bad field is named.
  const badHardware = await routes.propose(post('/api/proposals', { ...bookAmsterdam, hardwareRequirements: ['Jetpack'] }), noParams);
  assert.equal(badHardware.status, 400);
  assert.match((await json(badHardware)).message, /^hardwareRequirements\.0: /);
});

test('My bookings lists every upcoming booking, however far ahead, including requests waiting for Admin', async () => {
  // Training can be booked 90 days ahead (RULES.maxDaysAhead): one a month out must still show.
  const training = { roomId: 'mtapo', agendaType: 'Training', agenda: 'Onboarding week 1', start: '2026-10-28T09:00:00+08:00', end: '2026-10-28T11:00:00+08:00', participants: 10 };
  const created = await json(await routes.propose(post('/api/proposals', training), noParams));
  const id = created.proposal.id as string;
  const booked = (await json(await routes.confirm(post(`/api/proposals/${id}`), { params: Promise.resolve({ id }) }))).booking;
  assert.equal(booked.status, 'In Progress');
  const mine = await json(await routes.mine(get('/api/bookings/mine'), noParams));
  assert.equal(mine.bookings.find((b: { ticketNo: string }) => b.ticketNo === booked.ticketNo)?.status, 'In Progress');
  const nextWeek = await json(await routes.mine(get('/api/bookings/mine?to=2026-10-05T00:00:00%2B08:00'), noParams));
  assert.ok(!nextWeek.bookings.some((b: { ticketNo: string }) => b.ticketNo === booked.ticketNo), '`to` still limits the list');
});

test('several Training rooms at once: no one-room warning when searching, and both cards confirm', async () => {
  const lili = as('LILI.LAGUNOY');
  const at = { start: '2026-09-30T14:00:00+08:00', end: '2026-09-30T16:00:00+08:00' };
  const training = { agendaType: 'Training', agenda: 'Onboarding bootcamp', participants: 12, ...at };
  const confirm = async (roomId: string) => {
    const card = await json(await routes.propose(post('/api/proposals', { ...training, roomId }, lili), noParams));
    assert.equal(card.ok, true, card.message);
    const id = card.proposal.id as string;
    return routes.confirm(post(`/api/proposals/${id}`, undefined, lili), { params: Promise.resolve({ id }) });
  };
  assert.equal((await confirm('snowdon')).status, 200);
  const search = await json(await routes.search(post('/api/search', { agendaType: 'Training', participants: 12, ...at }, lili), noParams));
  assert.deepEqual(search.warnings, [], 'no "one room per person" warning for a second training room');
  assert.equal((await confirm('denali')).status, 200);
  const mine = await json(await routes.mine(get('/api/bookings/mine', lili), noParams));
  assert.deepEqual(mine.bookings.filter((b: { start: string }) => b.start === new Date(at.start).toISOString()).map((b: { roomId: string }) => b.roomId).sort(), ['denali', 'snowdon']);
});
