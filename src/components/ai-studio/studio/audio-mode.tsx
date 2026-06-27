'use client';

/**
 * Audio mode — text-to-speech (AI Studio revamp).
 *
 * Multi-provider TTS (OpenAI / ElevenLabs / Sarvam) through the AI provider
 * `generateAudio` capability — the same providers the voice agents use. Pick a
 * provider + voice ("multiple AI"), generate, play, download. Takes persist via
 * /sessions/record (kind audio) so they appear in history.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, Mic } from 'lucide-react';

import { generateSpeech } from '@/ai/flows/generate-speech-flow';
import { IconButton, Field, Select, Spinner, EmptyState } from '@/components/ui-kit';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { useStudioRecord } from '@/hooks/ai-studio/use-studio-record';
import { useStudioProject } from '@/hooks/ai-studio/use-studio-project';
import { PromptComposer } from './prompt-composer';

type TtsProvider = 'openai' | 'elevenlabs' | 'sarvam';

const PROVIDER_MODEL: Record<TtsProvider, string> = {
  openai: 'openai-tts',
  elevenlabs: 'elevenlabs-tts',
  sarvam: 'sarvam-tts',
};

const PROVIDERS: { value: TtsProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'sarvam', label: 'Sarvam (Indic)' },
];

const VOICES: Record<TtsProvider, { id: string; label: string }[]> = {
  openai: [
    { id: 'alloy', label: 'Alloy' },
    { id: 'echo', label: 'Echo' },
    { id: 'fable', label: 'Fable' },
    { id: 'onyx', label: 'Onyx' },
    { id: 'nova', label: 'Nova' },
    { id: 'shimmer', label: 'Shimmer' },
  ],
  elevenlabs: [
    { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel' },
    { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam' },
    { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella' },
    { id: 'ErXwobaYiN019PkySvjV', label: 'Antoni' },
    { id: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi' },
  ],
  sarvam: [
    { id: 'meera', label: 'Meera' },
    { id: 'pavithra', label: 'Pavithra' },
    { id: 'maitreyi', label: 'Maitreyi' },
    { id: 'arvind', label: 'Arvind' },
    { id: 'amol', label: 'Amol' },
  ],
};

const SARVAM_LANGUAGES = [
  { value: 'en-IN', label: 'English (India)' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'ta-IN', label: 'Tamil' },
  { value: 'te-IN', label: 'Telugu' },
  { value: 'kn-IN', label: 'Kannada' },
  { value: 'ml-IN', label: 'Malayalam' },
  { value: 'mr-IN', label: 'Marathi' },
  { value: 'bn-IN', label: 'Bengali' },
  { value: 'gu-IN', label: 'Gujarati' },
];

interface AudioModeProps {
  activeProjectId: string | null;
  onProjectCreated: (projectId: string) => void;
}

export function AudioMode({ activeProjectId, onProjectCreated }: AudioModeProps) {
  const { toast } = useToast();
  const { record } = useStudioRecord();
  const { project } = useStudioProject(activeProjectId);

  const [text, setText] = useState('');
  const [provider, setProvider] = useState<TtsProvider>('openai');
  const [voice, setVoice] = useState<string>(VOICES.openai[0].id);
  const [speed, setSpeed] = useState(1);
  const [language, setLanguage] = useState('en-IN');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const hydratedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeProjectId) {
      if (hydratedRef.current !== null) {
        setText('');
        setAudioUrl(null);
        hydratedRef.current = null;
      }
      return;
    }
    if (project && hydratedRef.current !== activeProjectId) {
      const last = [...project.sessions]
        .reverse()
        .find((s) => s.kind === 'audio' && s.status === 'completed' && (s.outputUrls?.length ?? 0) > 0);
      if (last) {
        setText(last.prompt ?? '');
        setAudioUrl(last.outputUrls?.[0] ?? null);
      }
      hydratedRef.current = activeProjectId;
    }
  }, [activeProjectId, project]);

  const handleProviderChange = useCallback((p: TtsProvider) => {
    setProvider(p);
    setVoice(VOICES[p][0].id);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) {
      toast({ variant: 'destructive', title: 'Add a script', description: 'Enter the text to speak.' });
      return;
    }
    setIsLoading(true);
    setAudioUrl(null);
    try {
      const model = PROVIDER_MODEL[provider];
      const result = await generateSpeech({
        model,
        text: text.trim(),
        voice,
        speed,
        language: provider === 'sarvam' ? language : undefined,
      });
      setAudioUrl(result.audioUrl);
      const rec = await record({
        kind: 'audio',
        model,
        prompt: text.trim(),
        outputUrls: [result.audioUrl],
        projectId: activeProjectId ?? undefined,
        projectName: text.slice(0, 50),
        settings: { voice, speed, language: provider === 'sarvam' ? language : undefined },
      });
      hydratedRef.current = rec.projectId;
      onProjectCreated(rec.projectId);
      toast({ title: 'Audio ready' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Generation failed', description: e instanceof Error ? e.message : 'Could not generate audio.' });
    } finally {
      setIsLoading(false);
    }
  }, [text, provider, voice, speed, language, record, activeProjectId, onProjectCreated, toast]);

  const handleDownload = useCallback(() => {
    if (!audioUrl) return;
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `montrai-audio-${Date.now()}.mp3`;
    link.click();
  }, [audioUrl]);

  return (
    <div className="flex h-full min-h-0">
      {/* Center */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-foreground">{audioUrl ? 'Audio ready' : 'Text to speech'}</span>
          <div className="flex items-center gap-1.5">
            {audioUrl ? (
              <>
                <IconButton icon={ExternalLink} iconSize={15} onClick={() => window.open(audioUrl, '_blank', 'noopener,noreferrer')} title="Open" className="rounded-md border border-border bg-muted/50 hover:bg-muted" />
                <IconButton icon={Download} iconSize={15} onClick={handleDownload} title="Download" className="rounded-md border border-border bg-muted/50 hover:bg-muted" />
              </>
            ) : null}
          </div>
        </div>

        {/* Stage */}
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-secondary/20 p-4">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <Spinner size={32} />
              <p className="text-[13px] text-muted-foreground">Generating audio…</p>
            </div>
          ) : audioUrl ? (
            <audio src={audioUrl} controls className="w-full max-w-md" aria-label="Generated audio" />
          ) : (
            <EmptyState
              icon={Mic}
              title="Your audio will appear here"
              note="Pick a voice, write a script, and generate."
            />
          )}
        </div>

        {/* Script composer (no attachments; keeps Enhance) */}
        <PromptComposer
          prompt={text}
          onPromptChange={setText}
          attachments={[]}
          onAttachmentsChange={() => undefined}
          onGenerate={handleGenerate}
          isLoading={isLoading}
          showAttach={false}
          enhanceMediaType="audio"
          generateLabel="Generate"
          placeholder="Write what you want spoken aloud…"
        />
      </div>

      {/* Params */}
      <aside className="hidden w-[300px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-4 xl:flex">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Voice</p>

        <Field label="Provider">
          <Select
            value={provider}
            onChange={(v) => handleProviderChange(v as TtsProvider)}
            disabled={isLoading}
            triggerClassName="h-9"
            options={PROVIDERS}
          />
        </Field>

        <Field label="Voice">
          <Select
            value={voice}
            onChange={setVoice}
            disabled={isLoading}
            triggerClassName="h-9"
            options={VOICES[provider].map((v) => ({ value: v.id, label: v.label }))}
          />
        </Field>

        {provider === 'sarvam' ? (
          <Field label="Language">
            <Select
              value={language}
              onChange={setLanguage}
              disabled={isLoading}
              triggerClassName="h-9"
              options={SARVAM_LANGUAGES}
            />
          </Field>
        ) : null}

        <Field label={`Speed · ${speed.toFixed(2)}×`}>
          <Slider value={[speed]} onValueChange={(v) => setSpeed(v[0])} min={0.5} max={2} step={0.05} disabled={isLoading} />
        </Field>
      </aside>
    </div>
  );
}
