import { redirect } from 'next/navigation';

export default function CrmSettingsPage() {
  redirect('/settings?tab=crm');
}
