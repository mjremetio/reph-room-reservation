import type { Metadata } from 'next';
import { AdminDashboard } from '../../ui/admin/AdminDashboard';

export const metadata: Metadata = { title: 'Dashboard · Admin · REPH Rooms' };

export default function Page() {
  return <AdminDashboard />;
}
