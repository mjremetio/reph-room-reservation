/**
 * Several server instances share one state through Redis (docs/spec/09-quality.md, Deployment, Shared state), as on
 * Vercel. Each "instance" here starts with fresh memory (a new gateway, store and sync point) and shares one key-value
 * store (src/lib/kv.ts memoryKv standing in for Redis). The demo clock starts Mon, Sep 28, 9:00 AM.
 */
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { RunContext } from '@openai/agents';
import type { AssistantContext } from '../../../agent/context';
import { checkIn } from '../../../agent/tools';
import { resetGateway } from '../../../gateway';
import { memoryKv, type Kv } from '../../../lib/kv';
import { createSession, SESSION_COOKIE } from '../../../lib/session';
import { resetStore } from '../../../store';
import { shareThroughForTests } from '../../../services/sharedState';

process.env.DEMO_NOW = '2026-09-28T09:00:00+08:00';
process.env.RESERVATION_GATEWAY = 'mock';
process.env.MOCK_SCENARIO = 'demo';

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const r: Record<string, Handler> = {};

before(async () => {
  const load = async (path: string, method = 'GET') => (await import(path))[method] as Handler;
  Object.assign(r, {
    propose: await load('../proposals/route', 'POST'),
    confirm: await load('../proposals/[id]/route', 'POST'),
    mine: await load('../bookings/mine/route'),
    adminBookings: await load('../admin/bookings/route'),
    act: await load('../admin/bookings/[ticketNo]/route', 'POST'),
    editUser: await load('../admin/users/[login]/route', 'PATCH'),
    overview: await load('../admin/overview/route'),
    session: await load('../session/route'),
    audit: await load('../admin/audit/route'),
    thread: await load('../messages/[ticketNo]/route'),
    send: await load('../messages/[ticketNo]/route', 'POST'),
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

let redis: Kv;
/** A new server instance: its own empty memory, the same Redis. */
function instance(): void {
  resetGateway();
  resetStore();
  shareThroughForTests(redis);
}

async function propose(login: string, body: Record<string, unknown>): Promise<string> {
  const created = await json(await r.propose!(req('POST', '/api/proposals', as(login), { agendaType: 'Meeting', participants: 4, ...body }), params()));
  assert.equal(created.ok, true, JSON.stringify(created));
  return created.proposal.id as string;
}

async function confirm(login: string, id: string): Promise<Record<string, any>> {
  return json(await r.confirm!(req('POST', `/api/proposals/${id}`, as(login)), params({ id })));
}

test('a booking confirmed on one instance is in My bookings and Admin on the others, waiting for Admin', async () => {
  redis = memoryKv();
  instance();
  // A training waits for Admin's approval (the owner's room booking list).
  const id = await propose(LILI, { roomId: 'capetown', agendaType: 'Training', agenda: 'Sprint review', start: '2026-09-29T10:00:00+08:00', end: '2026-09-29T11:00:00+08:00' });
  instance(); // the confirm lands on another instance: the proposal is in Redis too
  const ticketNo = (await confirm(LILI, id)).booking.ticketNo as string;

  instance();
  const mine = await json(await r.mine!(req('GET', '/api/bookings/mine', as(LILI)), params()));
  assert.equal(mine.bookings.find((b: { ticketNo: string }) => b.ticketNo === ticketNo)?.status, 'In Progress');
  instance();
  const all = await json(await r.adminBookings!(req('GET', `/api/admin/bookings?${WEEK}`, as(ADMIN)), params()));
  assert.ok(all.bookings.some((b: { ticketNo: string }) => b.ticketNo === ticketNo));

  instance();
  const approved = await r.act!(req('POST', `/api/admin/bookings/${ticketNo}`, as(ADMIN), { action: 'approve' }), params({ ticketNo }));
  assert.equal(approved.status, 200, 'the booking is found on an instance that never saw it made');
  instance();
  const after = await json(await r.mine!(req('GET', '/api/bookings/mine', as(LILI)), params()));
  assert.equal(after.bookings.find((b: { ticketNo: string }) => b.ticketNo === ticketNo)?.status, 'Approved');
});

test('a confirm card works once across instances', async () => {
  instance();
  const id = await propose(JEREMIAH, { roomId: 'johannesburg', agenda: 'Design critique', start: '2026-09-29T16:00:00+08:00', end: '2026-09-29T17:00:00+08:00' });
  instance();
  assert.equal((await confirm(JEREMIAH, id)).ok, true);
  instance();
  assert.equal((await confirm(JEREMIAH, id)).ok, false);
});

test('a role change on one instance reaches the others: the Admin link and the Admin pages follow it', async () => {
  instance();
  const made = await r.editUser!(req('PATCH', `/api/admin/users/${LILI}`, as(ADMIN), { role: 'admin' }), params({ login: LILI }));
  assert.equal(made.status, 200);
  instance();
  assert.equal((await json(await r.session!(req('GET', '/api/session', as(LILI)), params()))).user.role, 'admin');
  assert.equal((await r.overview!(req('GET', '/api/admin/overview', as(LILI)), params())).status, 200);

  instance();
  assert.equal((await r.editUser!(req('PATCH', `/api/admin/users/${LILI}`, as(ADMIN), { role: 'user' }), params({ login: LILI }))).status, 200);
  instance();
  assert.equal((await json(await r.session!(req('GET', '/api/session', as(LILI)), params()))).user.role, 'user');
  assert.equal((await r.overview!(req('GET', '/api/admin/overview', as(LILI)), params())).status, 403);
});

test('writes at the same time take turns: both bookings stay, with their own ticket numbers', async () => {
  instance();
  const a = await propose(LILI, { roomId: 'capetown', agenda: 'Vendor call', start: '2026-09-30T13:00:00+08:00', end: '2026-09-30T14:00:00+08:00' });
  const b = await propose(JEREMIAH, { roomId: 'johannesburg', agenda: 'Hiring sync', start: '2026-09-30T13:00:00+08:00', end: '2026-09-30T14:00:00+08:00' });
  instance();
  const [x, y] = await Promise.all([confirm(LILI, a), confirm(JEREMIAH, b)]);
  assert.equal(x.ok && y.ok, true, JSON.stringify([x, y]));
  assert.notEqual(x.booking.ticketNo, y.booking.ticketNo);
  instance();
  const all = await json(await r.adminBookings!(req('GET', `/api/admin/bookings?${WEEK}`, as(ADMIN)), params()));
  const tickets = all.bookings.map((b: { ticketNo: string }) => b.ticketNo);
  assert.ok(tickets.includes(x.booking.ticketNo) && tickets.includes(y.booking.ticketNo));
});

test('a check-in by the assistant or an AI app stays on every instance and is in the log', async () => {
  // The assistant's reply streams after its route has saved, so the check_in tool saves under the lock itself.
  instance();
  const user = { login: ADMIN, name: 'Remetio, Mark Joseph', email: 'markjoseph.remetio@lexisnexis.com', division: 'Sales' };
  const ctx: AssistantContext = { user, now: new Date('2026-09-28T09:00:00+08:00'), defaultSite: 'Manila', emit: () => {} };
  const out = JSON.parse(String(await checkIn.invoke(new RunContext(ctx), JSON.stringify({ ticket_no: 'RM-0129902' }))));
  assert.deepEqual(out, { ok: true, status: 'Checked-In' });
  instance();
  const mine = await json(await r.mine!(req('GET', '/api/bookings/mine', as(ADMIN)), params()));
  assert.equal(mine.bookings.find((b: { ticketNo: string }) => b.ticketNo === 'RM-0129902')?.status, 'Checked-In');
  const log = await json(await r.audit!(req('GET', '/api/admin/audit', as(ADMIN)), params()));
  assert.ok(log.entries.some((e: { action: string; target: string }) => e.action === 'booking.checkin' && e.target === 'RM-0129902'));
});

test('opening a thread with nothing new saves nothing, so polling an open thread costs no write', async () => {
  instance();
  const path = '/api/messages/RM-0129902';
  assert.equal((await r.send!(req('POST', path, as(ADMIN), { text: 'Is the screen working?' }), params({ ticketNo: 'RM-0129902' }))).status, 200);
  instance();
  assert.equal((await r.thread!(req('GET', path, as('ADMIN.TEST')), params({ ticketNo: 'RM-0129902' }))).status, 200); // new message: marked read
  const version = await redis.get('reph:state:version');
  assert.equal((await r.thread!(req('GET', path, as('ADMIN.TEST')), params({ ticketNo: 'RM-0129902' }))).status, 200);
  assert.equal(await redis.get('reph:state:version'), version);
});
