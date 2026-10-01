import type { Metadata } from 'next';
import { AdminMessages } from '../../../ui/admin/AdminMessages';

export const metadata: Metadata = { title: 'Messages · Admin · REPH Rooms' };

export default function Page() {
  return <AdminMessages />;
}
