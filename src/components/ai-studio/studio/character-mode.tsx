'use client';

/**
 * Character builder mode (AI Studio revamp M2 — slice 1).
 *
 * Define a reusable identity (name, look, voice, personality, style) and save
 * it to the library. Saved characters attach into Image/Video/Audio/Text via
 * the orchestration `applyCharacter()` (which already exists). The talking-
 * avatar render (script → video) is a later slice — this is identity authoring.
 *
 * Layout mirrors the design: center stage (portrait) + right definition panel.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import useSWR from 'swr';
import { Loader2, Save, UserRound, Wand2, X } from 'lucide-react';

import { Button, Chip, Spinner, Input, Field, Select, Textarea, EmptyState } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { useCharacters, type CharacterInput } from '@/hooks/ai-studio/use-characters';
import { useStudioRecord } from '@/hooks/ai-studio/use-studio-record';
import type { StudioCharacter } from '@/hooks/ai-studio/types';
import { startAvatarGeneration, checkAvatarOperation } from '@/ai/flows/generate-avatar-flow';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then((res) => res.json());
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const voiceProviders = [
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'sarvam', label: 'Sarvam' },
];

interface CharacterModeProps {
  characterId: string | null;
  onSaved: (id: string) => void;
}

export function CharacterMode({ characterId, onSaved }: CharacterModeProps) {
  const { toast } = useToast();
  const { createCharacter, updateCharacter } = useCharacters();
  const { record } = useStudioRecord();
  const { data } = useSWR<{ character: StudioCharacter }>(
    characterId ? `/api/v2/ai-studio/characters/${characterId}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [style, setStyle] = useState(''); // comma/newline separated
  const [personality, setPersonality] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [sourceImageUrl, setSourceImageUrl] = useState('');
  const [voiceProvider, setVoiceProvider] = useState('elevenlabs');
  const [voiceId, setVoiceId] = useState('');
  const [voiceLanguage, setVoiceLanguage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Talking-avatar take (script → video).
  const [script, setScript] = useState('');
  const [takes, setTakes] = useState<string[]>([]);
  const [activeTake, setActiveTake] = useState<number | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const cancelRenderRef = useRef(false);

  const hydratedRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setName('');
    setDescription('');
    setStyle('');
    setPersonality('');
    setNegativePrompt('');
    setSourceImageUrl('');
    setVoiceProvider('elevenlabs');
    setVoiceId('');
    setVoiceLanguage('');
    setScript('');
    setTakes([]);
    setActiveTake(null);
  }, []);

  useEffect(() => {
    if (!characterId) {
      if (hydratedRef.current !== null) {
        reset();
        hydratedRef.current = null;
      }
      return;
    }
    const c = data?.character;
    if (c && hydratedRef.current !== characterId) {
      setName(c.name ?? '');
      setDescription(c.description ?? '');
      setStyle((c.styleDescriptors ?? []).join(', '));
      setPersonality(c.personality ?? '');
      setNegativePrompt(c.negativePrompt ?? '');
      setSourceImageUrl(c.avatar?.sourceImageUrl ?? c.referenceImages?.[0]?.url ?? '');
      setVoiceProvider(c.voice?.provider ?? 'elevenlabs');
      setVoiceId(c.voice?.voiceId ?? '');
      setVoiceLanguage(c.voice?.language ?? '');
      hydratedRef.current = characterId;
    }
  }, [characterId, data, reset]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast({ variant: 'destructive', title: 'Name required', description: 'Give your character a name.' });
      return;
    }
    const styleDescriptors = style
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const payload: CharacterInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      styleDescriptors: styleDescriptors.length ? styleDescriptors : undefined,
      personality: personality.trim() || undefined,
      negativePrompt: negativePrompt.trim() || undefined,
      voice: voiceId.trim()
        ? { provider: voiceProvider, voiceId: voiceId.trim(), language: voiceLanguage.trim() || undefined }
        : undefined,
      avatar: sourceImageUrl.trim()
        ? { mode: 'image-driven', sourceImageUrl: sourceImageUrl.trim() }
        : undefined,
      referenceImages: sourceImageUrl.trim() ? [{ url: sourceImageUrl.trim() }] : undefined,
    };

    setIsSaving(true);
    try {
      const saved = characterId
        ? await updateCharacter(characterId, payload)
        : await createCharacter(payload);
      hydratedRef.current = saved._id;
      onSaved(saved._id);
      toast({ title: characterId ? 'Character updated' : 'Character saved', description: `${saved.name} is in your library.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Save failed', description: e instanceof Error ? e.message : 'Could not save the character.' });
    } finally {
      setIsSaving(false);
    }
  }, [name, style, description, personality, negativePrompt, voiceId, voiceProvider, voiceLanguage, sourceImageUrl, characterId, updateCharacter, createCharacter, onSaved, toast]);

  const handleCancelRender = useCallback(() => {
    cancelRenderRef.current = true;
    setIsRendering(false);
    toast({ title: 'Cancelled', description: 'Stopped waiting for the take.' });
  }, [toast]);

  const handleGenerateTake = useCallback(async () => {
    if (!sourceImageUrl.trim()) {
      toast({ variant: 'destructive', title: 'Add a face first', description: 'A face image is required for a photo-driven take.' });
      return;
    }
    if (!script.trim()) {
      toast({ variant: 'destructive', title: 'Write a script', description: 'Give the character something to say.' });
      return;
    }
    setIsRendering(true);
    cancelRenderRef.current = false;
    toast({ title: 'Rendering take…', description: 'Talking-avatar renders take a couple of minutes.' });
    try {
      const start = await startAvatarGeneration({
        model: 'd-id-talk',
        script: script.trim(),
        sourceImageUrl: sourceImageUrl.trim(),
        voiceId: voiceId.trim() || undefined,
        language: voiceLanguage.trim() || undefined,
        aspectRatio: '9:16',
      });

      const maxPollTime = 5 * 60 * 1000;
      const pollInterval = 6000;
      const t0 = Date.now();
      while (Date.now() - t0 < maxPollTime) {
        if (cancelRenderRef.current) return;
        const res = await checkAvatarOperation({ model: start.model, jobId: start.jobId });
        if (res.done) {
          if (res.error) throw new Error(res.error);
          if (!res.videoUrl) throw new Error('Render finished but no video was returned.');
          if (cancelRenderRef.current) return;
          setTakes((prev) => {
            const next = [...prev, res.videoUrl!];
            setActiveTake(next.length - 1);
            return next;
          });
          // Persist the take as a brand-scoped video session (asset bridge fires).
          await record({
            kind: 'video',
            model: 'd-id-talk',
            prompt: script.trim(),
            outputUrls: [res.videoUrl],
            characterId: characterId ?? undefined,
            projectName: `${name || 'Character'} — take`,
          }).catch(() => undefined);
          toast({ title: 'Take ready' });
          setIsRendering(false);
          return;
        }
        await sleep(pollInterval);
      }
      throw new Error('Talking-avatar render timed out after 5 minutes.');
    } catch (e) {
      if (cancelRenderRef.current) return;
      toast({ variant: 'destructive', title: 'Render failed', description: e instanceof Error ? e.message : 'Could not render the take.' });
    } finally {
      setIsRendering(false);
    }
  }, [sourceImageUrl, script, voiceId, voiceLanguage, characterId, name, record, toast]);

  const currentTake = activeTake !== null ? takes[activeTake] : null;

  return (
    <div className="flex h-full min-h-0">
      {/* Center — stage */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-foreground">
            {characterId ? name || 'Character' : 'New character'}
          </span>
          <Chip tone={currentTake ? 'brand' : 'gray'}>{currentTake ? 'Take' : 'Identity'}</Chip>
        </div>

        {/* Stage: latest take video, else portrait, else empty */}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-secondary/20 p-4">
          {isRendering ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <Spinner size={32} />
              <div>
                <p className="text-[13px] font-medium text-foreground">Rendering take…</p>
                <p className="text-[12px] text-muted-foreground">Talking-avatar renders take a couple of minutes.</p>
              </div>
              <Button variant="outline" size="sm" icon={X} onClick={handleCancelRender} className="mt-1">
                Cancel
              </Button>
            </div>
          ) : currentTake ? (
            <video src={currentTake} controls autoPlay loop aria-label="Character take preview" className="max-h-full rounded-lg" />
          ) : sourceImageUrl ? (
            <div className="relative aspect-square w-full max-w-[340px] overflow-hidden rounded-xl border border-border">
              <Image src={sourceImageUrl} alt={name || 'Character portrait'} fill className="object-cover" unoptimized />
            </div>
          ) : (
            <EmptyState
              icon={UserRound}
              title="No portrait yet"
              note="Paste a face image URL in the panel, then write a script."
            />
          )}
        </div>

        {/* Takes strip */}
        {takes.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Takes:</span>
            {takes.map((take, i) => (
              <button
                key={take}
                type="button"
                onClick={() => setActiveTake(i)}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                  i === activeTake
                    ? 'border-[#7A5AF8]/50 bg-[#7A5AF8]/10 text-[#7A5AF8]'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                v{i + 1}
              </button>
            ))}
          </div>
        ) : null}

        {/* Script → take */}
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <Textarea
            placeholder="Write what the character says on camera…"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            disabled={isRendering}
            rows={3}
            className="min-h-[72px] resize-none border-0 bg-transparent px-0 text-[14px] leading-relaxed shadow-none focus-visible:ring-0"
          />
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2.5">
            <span className="text-[11px] text-muted-foreground">
              {sourceImageUrl.trim() ? 'Photo-driven · D-ID' : 'Add a face image to enable'}
            </span>
            <Button
              variant="brand"
              icon={isRendering ? undefined : Wand2}
              onClick={handleGenerateTake}
              disabled={isRendering || !script.trim() || !sourceImageUrl.trim()}
            >
              {isRendering ? <Loader2 className="size-4 animate-spin" /> : null}
              Generate take
            </Button>
          </div>
        </div>
      </div>

      {/* Right — definition */}
      <aside className="hidden w-[340px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-4 xl:flex">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Definition</p>
          <Button variant="primary" size="sm" icon={isSaving ? undefined : Save} onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>

        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aria" wrapClassName="h-9" />
        </Field>

        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short summary" wrapClassName="h-9" />
        </Field>

        <Field label="Face image URL">
          <Input value={sourceImageUrl} onChange={(e) => setSourceImageUrl(e.target.value)} placeholder="https://… (upload/generate coming soon)" wrapClassName="h-9" />
        </Field>

        <Field label="Style descriptors">
          <Textarea
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder="cinematic, warm tone, 35mm (comma or newline separated)"
            className="min-h-[60px]"
          />
        </Field>

        <Field label="Personality">
          <Textarea
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            placeholder="Tone & character used in text/audio"
            className="min-h-[60px]"
          />
        </Field>

        <Field label="Voice">
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={voiceProvider}
              onChange={setVoiceProvider}
              triggerClassName="h-9"
              options={voiceProviders}
            />
            <Input value={voiceLanguage} onChange={(e) => setVoiceLanguage(e.target.value)} placeholder="lang (en)" wrapClassName="h-9" />
          </div>
          <Input value={voiceId} onChange={(e) => setVoiceId(e.target.value)} placeholder="voice / speaker id" wrapClassName="mt-2 h-9" />
        </Field>

        <Field label="Negative prompt">
          <Input value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="image/video: what to avoid" wrapClassName="h-9" />
        </Field>
      </aside>
    </div>
  );
}
