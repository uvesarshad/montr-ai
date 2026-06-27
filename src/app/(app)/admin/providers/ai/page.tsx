/**
 * Super admin — AI Provider configuration.
 *
 * Lists every AI provider in the registry with:
 *   - capability flags (text / image / video / audio / streaming / vision / cache)
 *   - SDK in use (genkit / native / aisdk / openrouter)
 *   - whether the system API key is configured (env var present)
 *   - env var name (so admins know what to set in .env)
 *
 * The page is read-only for the moment — system keys are managed via env vars.
 * Per-plan provider mapping lands in B2-3.10 once the plan model is extended;
 * test-key and edit-key actions land in B2-3.10/3.14 follow-ups.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Chip, PageHeader, EmptyState, Spinner } from '@/components/ui-kit';
import { Sparkles } from 'lucide-react';

interface ProviderInfo {
  id: string;
  label: string;
  sdk: 'genkit' | 'native' | 'aisdk' | 'openrouter';
  capabilities: {
    text: boolean;
    image: boolean;
    video: boolean;
    audio: boolean;
    transcription?: boolean;
    streaming: boolean;
    toolCalling: boolean;
    vision: boolean;
    promptCaching: boolean;
  };
  envVar: string;
  systemKeyConfigured: boolean;
}

const CAPABILITY_LABELS: Record<keyof ProviderInfo['capabilities'], string> = {
  text: 'Text',
  image: 'Image',
  video: 'Video',
  audio: 'Audio (TTS)',
  transcription: 'STT',
  streaming: 'Streaming',
  toolCalling: 'Tools',
  vision: 'Vision',
  promptCaching: 'Cache',
};

export default function AdminAiProvidersPage() {
  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: ['admin-ai-providers'],
    queryFn: async () => {
      const res = await fetch('/api/v2/admin/providers/ai');
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      return await res.json() as { providers: ProviderInfo[] };
    },
  });

  const providers = data?.providers ?? [];
  const error = queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        icon={Sparkles}
        title="AI Provider Configuration"
        sub="Status of every AI provider wired into the router. System keys are managed via environment variables. Per-plan mapping and runtime toggles land in a follow-up task."
      />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size={14} /> Loading…
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && providers.length === 0 && (
        <EmptyState icon={Sparkles} title="No providers found" note="No AI providers are registered in the router." />
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {providers.map(p => (
          <Card
            key={p.id}
            title={p.label}
            meta={<span className="font-mono text-xs text-muted-foreground">{p.id} · {p.sdk} SDK</span>}
            action={
              p.systemKeyConfigured
                ? <Chip tone="ok">Live</Chip>
                : <Chip tone="gray">No key</Chip>
            }
            spotlight
          >
            <div className="px-4 pb-4 space-y-2">
              <p className="font-mono text-[11px] text-muted-foreground truncate">{p.envVar}</p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(p.capabilities) as Array<[keyof ProviderInfo['capabilities'], boolean | undefined]>)
                  .filter(([, on]) => on === true)
                  .map(([cap]) => (
                    <Chip key={cap} tone="info">{CAPABILITY_LABELS[cap]}</Chip>
                  ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
