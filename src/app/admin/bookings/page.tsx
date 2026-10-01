import type { Metadata } from 'next';
import { AdminBookings } from '../../../ui/admin/AdminBookings';

export const metadata: Metadata = { title: 'Bookings · Admin · REPH Rooms' };

export default function Page() {
  return <AdminBookings />;
}
