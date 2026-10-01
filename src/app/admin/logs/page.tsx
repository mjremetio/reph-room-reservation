import type { Metadata } from 'next';
import { AdminLogs } from '../../../ui/admin/AdminLogs';

export const metadata: Metadata = { title: 'Logs · Admin · REPH Rooms' };

export default function Page() {
  return <AdminLogs />;
}
