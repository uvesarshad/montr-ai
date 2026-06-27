import VoiceByokClient from './voice-byok-client';

export const dynamic = 'force-dynamic';

export default function VoiceByokPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Bring Your Own Voice Provider</h1>
        <p className="text-sm text-muted-foreground">
          Add your own Twilio (or other provider) credentials. Outbound calls
          you initiate use your credential first; we fall back to your
          organization&rsquo;s shared provider if your key is missing or disabled.
        </p>
      </header>
      <VoiceByokClient />
    </div>
  );
}
