'use client';

/**
 * Image mode — the first fully-migrated mode in the unified workspace.
 *
 * Renders its own [center | params] layout. Generation goes through the
 * orchestration run hook (POST /sessions/run) — NOT the old `generateImage`
 * flow — so brand scoping, the asset-library bridge, and provenance all apply.
 * Hydrates from a selected project; resets on "New".
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
} from 'lucide-react';

import { IconButton, Field, Select, Spinner, EmptyState } from '@/components/ui-kit';
import { Slider } from '@/components/ui/slider';
import { ModelSelector } from '@/components/nodes/model-selector';
import { useToast } from '@/hooks/use-toast';
import { useStudioRun } from '@/hooks/ai-studio/use-studio-run';
import { useStudioProject } from '@/hooks/ai-studio/use-studio-project';
import { cn } from '@/lib/utils';
import { CharacterPicker } from './character-picker';
import { PromptComposer, type ComposerAttachment } from './prompt-composer';

const aspectRatios = [
  { value: '1:1', label: 'Square (1:1)' },
  { value: '16:9', label: 'Widescreen (16:9)' },
  { value: '9:16', label: 'Portrait (9:16)' },
  { value: '4:3', label: 'Standard (4:3)' },
  { value: '3:4', label: 'Portrait (3:4)' },
];

const stylePresets = [
  { value: 'natural', label: 'Natural' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'digital-art', label: 'Digital Art' },
  { value: 'photographic', label: 'Photographic' },
  { value: 'anime', label: 'Anime' },
  { value: '3d-model', label: '3D Model' },
];

interface ImageModeProps {
  activeProjectId: string | null;
  /** Called after a run creates/updates a project so history can refresh. */
  onProjectCreated: (projectId: string) => void;
}

export function ImageMode({ activeProjectId, onProjectCreated }: ImageModeProps) {
  const { toast } = useToast();
  const { run, isRunning } = useStudioRun();
  const { project } = useStudioProject(activeProjectId);

  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('dall-e-3');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [count, setCount] = useState(1);
  const [style, setStyle] = useState('natural');
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const hydratedRef = useRef<string | null>(null);

  // Hydrate from a selected thread / reset on New.
  useEffect(() => {
    if (!activeProjectId) {
      if (hydratedRef.current !== null) {
        setPrompt('');
        setImages([]);
        setSelectedIndex(null);
        setCharacterId(null);
        setAttachments([]);
        hydratedRef.current = null;
      }
      return;
    }
    if (project && hydratedRef.current !== activeProjectId) {
      const last = [...project.sessions]
        .reverse()
        .find((s) => s.kind === 'image' && s.status === 'completed' && (s.outputUrls?.length ?? 0) > 0);
      if (last) {
        setPrompt(last.prompt ?? '');
        setImages(last.outputUrls ?? []);
        setSelectedIndex(null);
        if (last.model) setModel(last.model);
        setCharacterId(last.characterId ?? null);
        const ref = last.settings?.referenceImage as string | undefined;
        setAttachments(ref ? [{ url: ref }] : []);
      }
      hydratedRef.current = activeProjectId;
    }
  }, [activeProjectId, project]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast({ variant: 'destructive', title: 'Add a prompt', description: 'Describe the image you want.' });
      return;
    }
    const fullPrompt = style !== 'natural' ? `Style: ${style}. ${prompt}` : prompt;
    try {
      const result = await run({
        kind: 'image',
        model,
        prompt: fullPrompt,
        projectId: activeProjectId ?? undefined,
        projectName: prompt.slice(0, 50),
        settings: {
          aspectRatio,
          count,
          ...(attachments[0] ? { referenceImage: attachments[0].url } : {}),
        },
        characterId: characterId ?? undefined,
      });
      const urls = result.session.outputUrls ?? [];
      setImages(urls);
      setSelectedIndex(null);
      hydratedRef.current = result.projectId;
      onProjectCreated(result.projectId);
      toast({ title: 'Done', description: `${urls.length} image${urls.length === 1 ? '' : 's'} ready.` });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Generation failed',
        description: e instanceof Error ? e.message : 'Could not generate the image.',
      });
    }
  }, [prompt, style, run, model, activeProjectId, aspectRatio, count, characterId, attachments, onProjectCreated, toast]);

  const primaryImage = selectedIndex !== null ? images[selectedIndex] : images[images.length - 1] ?? null;

  const handleCopyPrompt = useCallback(async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      toast({ title: 'Prompt copied' });
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed' });
    }
  }, [prompt, toast]);

  const handleDownload = useCallback(() => {
    if (!primaryImage) return;
    const link = document.createElement('a');
    link.href = primaryImage;
    link.download = `montrai-image-${Date.now()}.png`;
    link.click();
  }, [primaryImage]);

  const iconBtn = 'rounded-md border border-border bg-muted/50 hover:bg-muted disabled:opacity-40 text-foreground';

  return (
    <div className="flex h-full min-h-0">
      {/* Center */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-foreground">
            {images.length > 0 ? `${images.length} image${images.length === 1 ? '' : 's'}` : 'Image generator'}
          </span>
          <div className="flex items-center gap-1.5">
            <IconButton icon={Copy} iconSize={15} onClick={handleCopyPrompt} disabled={!prompt} title="Copy prompt" className={iconBtn} />
            {primaryImage && (
              <IconButton icon={ExternalLink} iconSize={15} onClick={() => window.open(primaryImage, '_blank', 'noopener,noreferrer')} title="Open" className={iconBtn} />
            )}
            {primaryImage && (
              <IconButton icon={Download} iconSize={15} onClick={handleDownload} title="Download" className={iconBtn} />
            )}
          </div>
        </div>

        {/* Gallery */}
        <div
          className={cn(
            'flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl border bg-secondary/20 p-3',
            images.length > 0 ? 'border-border' : 'border-dashed border-border',
          )}
        >
          {isRunning ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <Spinner size={32} />
              <p className="text-[13px] text-muted-foreground">Generating…</p>
            </div>
          ) : images.length > 0 ? (
            <div className={cn('grid h-full w-full gap-3', images.length > 1 ? 'sm:grid-cols-2' : '')}>
              {images.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-lg border transition',
                    index === selectedIndex ? 'border-[#7A5AF8]/50 ring-2 ring-[#7A5AF8]/20' : 'border-border hover:border-foreground/20',
                  )}
                >
                  <Image src={src} alt={`Generated ${index + 1}`} fill className="object-cover" unoptimized />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ImageIcon}
              title="Your images will appear here"
              note="Write a prompt below and generate."
            />
          )}
        </div>

        {/* Prompt composer */}
        <PromptComposer
          prompt={prompt}
          onPromptChange={setPrompt}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          onGenerate={handleGenerate}
          isLoading={isRunning}
          placeholder="Describe the image you want in detail…"
          attachmentHint="First image is used as a reference for image-to-image."
          enhanceMediaType="image"
        />
      </div>

      {/* Params */}
      <aside className="hidden w-[300px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-4 xl:flex">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Settings</p>

        <Field label="Model">
          <ModelSelector
            value={model}
            onValueChange={setModel}
            modelType="image"
            triggerClassName="h-9 rounded-md border-border bg-background"
            disabled={isRunning}
          />
        </Field>

        <Field label="Aspect ratio">
          <Select
            value={aspectRatio}
            onChange={setAspectRatio}
            disabled={isRunning}
            triggerClassName="h-9"
            options={aspectRatios}
          />
        </Field>

        <Field label={`Outputs · ${count}`} hint="1–4 images per run">
          <Slider value={[count]} onValueChange={(v) => setCount(v[0])} min={1} max={4} step={1} disabled={isRunning} />
        </Field>

        <Field label="Style">
          <Select
            value={style}
            onChange={setStyle}
            disabled={isRunning}
            triggerClassName="h-9"
            options={stylePresets}
          />
        </Field>

        {/* Attach a saved character — applied via orchestration applyCharacter(). */}
        <CharacterPicker value={characterId} onChange={setCharacterId} disabled={isRunning} />
      </aside>
    </div>
  );
}
