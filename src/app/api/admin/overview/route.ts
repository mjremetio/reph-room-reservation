/**
 * GET /api/admin/overview – the Admin dashboard (docs/spec/04-api.md, Admin): today's figures, the requests waiting
 * for Admin, today's bookings, this week by day, unread messages and the latest activity.
 */
import { buildReport, manilaToday, usesRoom, waitingForAdmin } from '../../../../domain/reports';
import { addMinutes, manilaStartOfWeek } from '../../../../domain/time';
import { getGateway } from '../../../../gateway';
import { auditView } from '../../../../lib/audit';
import { now } from '../../../../lib/clock';
import { listThreads } from '../../../../services/messages';
import { adminBooking } from '../../../../services/views';
import { getStore } from '../../../../store';
import { adminFailure, adminGuard } from '../_admin';
import { shared } from '../../_shared';

export const runtime = 'nodejs';

const DAY = 24 * 60;

export const GET = shared(async function get(request: Request): Promise<Response> {
  const admin = await adminGuard(request);
  if (admin instanceof Response) return admin;
  const gw = getGateway();
  const store = getStore();
  const t = now();
  try {
    const today = manilaToday(t);
    const weekFrom = manilaStartOfWeek(t);
    const weekTo = addMinutes(weekFrom, 7 * DAY);
    const [rooms, week, ahead] = await Promise.all([
      gw.listRooms(),
      gw.getBookings({ from: weekFrom, to: weekTo }),
      gw.getBookings({ from: t, to: addMinutes(t, 92 * DAY) }),
    ]);
    const todayList = week.filter((b) => b.start < today.to && today.from < b.end).sort((a, b) => a.start.getTime() - b.start.getTime());
    const report = buildReport({ bookings: week, rooms, from: weekFrom, to: weekTo, now: t });
    const todayReport = buildReport({ bookings: todayList, rooms, from: today.from, to: today.to, now: t });
    const waiting = waitingForAdmin(ahead, t);
    const { threads, unread } = await listThreads(gw, store, { login: admin.login, name: admin.name, email: admin.email, admin: true });
    const accounts = store.accounts.list();
    return Response.json(
      {
        ok: true,
        now: t.toISOString(),
        kpis: {
          waiting: waiting.length,
          today: todayReport.totals.bookings,
          todayHours: todayReport.totals.hours,
          inUseNow: todayList.filter((b) => usesRoom(b) && b.start <= t && t < b.end).length,
          checkedInToday: todayReport.totals.checkedIn,
          noShowsToday: todayReport.totals.noShows,
          utilisationToday: todayReport.totals.utilisation,
          utilisationWeek: report.totals.utilisation,
          unread,
          activeUsers: accounts.filter((a) => !a.disabled).length,
        },
        waiting: waiting.slice(0, 20).map((b) => adminBooking(b, admin.email)),
        today: todayList.map((b) => adminBooking(b, admin.email)),
        week: { from: weekFrom.toISOString(), byDay: report.byDay, byStatus: report.byStatus },
        threads: threads.filter((x) => x.unread > 0).slice(0, 5),
        recent: store.audit.list().slice(0, 12).map(auditView),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return adminFailure(error, 'Admin overview');
  }
});
