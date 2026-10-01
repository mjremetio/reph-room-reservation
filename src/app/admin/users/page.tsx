import type { Metadata } from 'next';
import { AdminUsers } from '../../../ui/admin/AdminUsers';

export const metadata: Metadata = { title: 'Users · Admin · REPH Rooms' };

export default function Page() {
  return <AdminUsers />;
}
