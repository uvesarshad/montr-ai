import VoiceNumbersClient from './voice-numbers-client';

export const dynamic = 'force-dynamic';

export default function VoiceNumbersPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Phone Numbers</h1>
        <p className="text-sm text-muted-foreground">
          Numbers your organization owns through any connected voice provider.
          Inbound calls route based on each number&rsquo;s configuration.
        </p>
      </header>
      <VoiceNumbersClient />
    </div>
  );
}
