import type { Metadata } from 'next';
import { AdminReports } from '../../../ui/admin/AdminReports';

export const metadata: Metadata = { title: 'Reports · Admin · REPH Rooms' };

export default function Page() {
  return <AdminReports />;
}
