import type { Metadata } from 'next';
import { AdminRooms } from '../../../ui/admin/AdminRooms';

export const metadata: Metadata = { title: 'Rooms · Admin · REPH Rooms' };

export default function Page() {
  return <AdminRooms />;
}
