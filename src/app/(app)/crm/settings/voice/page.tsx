/**
 * Voice settings overview page.
 *
 * Two sub-pages today:
 *   - Numbers — provision and route phone numbers
 *   - BYOK    — bring your own Twilio (or future provider) credential
 *
 * Linked from the CRM settings landing page once Phase 7 of the design refresh
 * folds voice into the main settings nav.
 */

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Phone, KeyRound } from 'lucide-react';

export default function VoiceSettingsPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Voice Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage phone numbers, provider credentials, and inbound routing.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/crm/settings/voice/numbers">
          <Card className="hover:bg-muted/30 cursor-pointer">
            <CardContent className="p-6 flex items-start gap-4">
              <Phone className="size-6 text-primary mt-1" />
              <div>
                <h2 className="font-semibold">Phone Numbers</h2>
                <p className="text-sm text-muted-foreground">
                  Provision numbers, configure where inbound calls route to
                  (workflow, AI bot, voicemail, forward).
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/crm/settings/voice/byok">
          <Card className="hover:bg-muted/30 cursor-pointer">
            <CardContent className="p-6 flex items-start gap-4">
              <KeyRound className="size-6 text-primary mt-1" />
              <div>
                <h2 className="font-semibold">Bring Your Own Key</h2>
                <p className="text-sm text-muted-foreground">
                  Add your own Twilio (or other provider) credentials. You pay
                  the provider directly; MontrAI just orchestrates the calls.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
