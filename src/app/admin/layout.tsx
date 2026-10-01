/**
 * /admin – the Admin area (docs/spec/06-ui.md, Admin). Only an Admin who is signed in (and has chosen their own
 * password) gets here; everyone else goes to the home page, which signs them in. This check is for the page only:
 * the data comes from /api/admin/*, which checks the Admin role on every request.
 */
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { accountByLogin, readSession, SESSION_COOKIE } from '../../lib/session';
import { pullShared } from '../../services/sharedState';
import { AdminShell } from '../../ui/admin/AdminShell';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin · REPH Rooms', robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await pullShared(); // the account as every server instance sees it (a role just changed elsewhere)
  const session = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  const account = session ? accountByLogin(session.login, session.issuedAt) : undefined;
  if (!account || account.role !== 'admin' || account.mustChangePassword) redirect('/');
  return <AdminShell>{children}</AdminShell>;
}
