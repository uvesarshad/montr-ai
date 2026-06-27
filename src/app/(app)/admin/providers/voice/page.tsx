import { requireSuperAdmin } from '@/middleware/auth';
import VoiceProvidersClient from './voice-providers-client';
import { PageHeader } from '@/components/ui-kit';
import { Phone } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminVoiceProvidersPage() {
  await requireSuperAdmin();
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={Phone}
        title="Voice Providers"
        sub="Configure telephony providers (Twilio, Plivo, Telnyx). Credentials are encrypted at rest and never returned to the client. Use the test-call button after saving to verify a credential before enabling it for org-level traffic."
      />
      <VoiceProvidersClient />
    </div>
  );
}
