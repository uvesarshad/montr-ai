'use client';

/**
 * Video mode for the unified workspace.
 *
 * Generation reuses the proven client-side polling flow
 * (startVideoGeneration → checkVideoOperation) because orchestration's async
 * video path has no Studio worker/poller. The finished render is persisted via
 * the record hook (brand-scoped, fires the asset bridge). Interim until
 * server-side render jobs exist.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Download, ExternalLink, Video as VideoIcon, X } from 'lucide-react';

import { checkVideoOperation, startVideoGeneration } from '@/ai/flows/generate-video-flow';
import { Button, IconButton, Field, Select, Spinner, EmptyState, Chip } from '@/components/ui-kit';
import { Slider } from '@/components/ui/slider';
import { ModelSelector } from '@/components/nodes/model-selector';
import { useToast } from '@/hooks/use-toast';
import { useStudioRecord } from '@/hooks/ai-studio/use-studio-record';
import { useStudioProject } from '@/hooks/ai-studio/use-studio-project';
import { PromptComposer, type ComposerAttachment } from './prompt-composer';

const aspectRatios = [
  { value: '16:9', label: 'Widescreen (16:9)' },
  { value: '9:16', label: 'Portrait (9:16)' },
];

const stylePresets = [
  { value: 'natural', label: 'Natural' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'dramatic', label: 'Dramatic' },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface VideoModeProps {
  activeProjectId: string | null;
  onProjectCreated: (projectId: string) => void;
}

export function VideoMode({ activeProjectId, onProjectCreated }: VideoModeProps) {
  const { toast } = useToast();
  const { record } = useStudioRecord();
  const { project } = useStudioProject(activeProjectId);

  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('veo-3.1');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState(5);
  const [style, setStyle] = useState('natural');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const cancelledRef = useRef(false);
  const hydratedRef = useRef<string | null>(null);

  // Hydrate from a selected thread / reset on New.
  useEffect(() => {
    if (!activeProjectId) {
      if (hydratedRef.current !== null) {
        setPrompt('');
        setVideoUrl(null);
        setAttachments([]);
        hydratedRef.current = null;
      }
      return;
    }
    if (project && hydratedRef.current !== activeProjectId) {
      const last = [...project.sessions]
        .reverse()
        .find((s) => s.kind === 'video' && s.status === 'completed' && (s.outputUrls?.length ?? 0) > 0);
      if (last) {
        setPrompt(last.prompt ?? '');
        setVideoUrl(last.outputUrls?.[0] ?? null);
        if (last.model) setModel(last.model);
        const ref = last.settings?.referenceImage as string | undefined;
        setAttachments(ref ? [{ url: ref }] : []);
      }
      hydratedRef.current = activeProjectId;
    }
  }, [activeProjectId, project]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setIsLoading(false);
    toast({ title: 'Cancelled', description: 'Stopped waiting for the render.' });
  }, [toast]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast({ variant: 'destructive', title: 'Add a prompt', description: 'Describe the shot you want.' });
      return;
    }
    setIsLoading(true);
    setVideoUrl(null);
    cancelledRef.current = false;
    const fullPrompt = style !== 'natural' ? `Style: ${style}. ${prompt}` : prompt;
    toast({ title: 'Rendering video…', description: 'This takes 2–5 minutes.' });

    try {
      let { operation } = await startVideoGeneration({
        prompt: fullPrompt,
        aspectRatio,
        durationSeconds: duration,
        style,
        model,
        referenceImage: attachments[0]?.url,
      });

      const maxPollTime = 5 * 60 * 1000;
      const pollInterval = 10000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxPollTime) {
        if (cancelledRef.current) return;
        const result = await checkVideoOperation({ operation });
        operation = result.operation;
        if (result.done) {
          if (result.error) throw new Error(result.error);
          if (!result.videoUrl) throw new Error('Render finished but no video URL was returned.');
          if (cancelledRef.current) return;
          setVideoUrl(result.videoUrl);
          const rec = await record({
            kind: 'video',
            model,
            prompt: fullPrompt,
            settings: {
              aspectRatio,
              durationSeconds: duration,
              style,
              ...(attachments[0] ? { referenceImage: attachments[0].url } : {}),
            },
            outputUrls: [result.videoUrl],
            projectId: activeProjectId ?? undefined,
            projectName: prompt.slice(0, 50),
          });
          hydratedRef.current = rec.projectId;
          onProjectCreated(rec.projectId);
          toast({ title: 'Video ready' });
          setIsLoading(false);
          return;
        }
        await sleep(pollInterval);
      }
      throw new Error('Video generation timed out after 5 minutes.');
    } catch (e) {
      if (cancelledRef.current) return;
      toast({
        variant: 'destructive',
        title: 'Generation failed',
        description: e instanceof Error ? e.message : 'Could not generate the video.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [prompt, style, aspectRatio, duration, model, attachments, record, activeProjectId, onProjectCreated, toast]);

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
    if (!videoUrl) return;
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = `montrai-video-${Date.now()}.mp4`;
    link.click();
  }, [videoUrl]);

  const iconBtn = 'rounded-md border border-border bg-muted/50 hover:bg-muted disabled:opacity-40';

  return (
    <div className="flex h-full min-h-0">
      {/* Center */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-foreground">
            {videoUrl ? 'Video ready' : 'Video generator'}
          </span>
          <div className="flex items-center gap-1.5">
            <IconButton icon={Copy} iconSize={15} onClick={handleCopyPrompt} disabled={!prompt} title="Copy prompt" className={iconBtn} />
            {videoUrl && (
              <IconButton icon={ExternalLink} iconSize={15} onClick={() => window.open(videoUrl, '_blank', 'noopener,noreferrer')} title="Open" className={iconBtn} />
            )}
            {videoUrl && (
              <IconButton icon={Download} iconSize={15} onClick={handleDownload} title="Download" className={iconBtn} />
            )}
          </div>
        </div>

        <div
          className={`flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border bg-secondary/20 p-3 ${
            videoUrl ? 'border-border' : 'border-dashed border-border'
          }`}
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <Spinner size={32} />
              <div>
                <p className="text-[13px] font-medium text-foreground">Rendering video…</p>
                <p className="text-[12px] text-muted-foreground">Polling every 10s · takes 2–5 minutes.</p>
              </div>
              <Button variant="outline" size="sm" icon={X} onClick={handleCancel} className="mt-1">
                Cancel
              </Button>
            </div>
          ) : videoUrl ? (
            <video src={videoUrl} controls autoPlay loop aria-label="Generated video preview" className="h-full w-full rounded-lg object-contain" />
          ) : (
            <EmptyState
              icon={VideoIcon}
              title="Your video will appear here"
              note="Write a motion prompt below and generate."
            />
          )}
        </div>

        <PromptComposer
          prompt={prompt}
          onPromptChange={setPrompt}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          onGenerate={handleGenerate}
          isLoading={isLoading}
          placeholder="Describe the shot, movement, lighting, and pacing…"
          attachmentHint="First image is used as the first-frame reference (image-to-video)."
          enhanceMediaType="video"
        />
      </div>

      {/* Params */}
      <aside className="hidden w-[300px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-4 xl:flex">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Settings</p>

        <Field label="Model">
          <ModelSelector
            value={model}
            onValueChange={setModel}
            modelType="video"
            triggerClassName="h-9 rounded-md border-border bg-background"
            disabled={isLoading}
          />
        </Field>

        <Field label="Aspect ratio">
          <Select
            value={aspectRatio}
            onChange={setAspectRatio}
            disabled={isLoading}
            triggerClassName="h-9"
            options={aspectRatios}
          />
        </Field>

        <Field label={`Duration · ${duration}s`} hint="5–15 seconds">
          <Slider value={[duration]} onValueChange={(v) => setDuration(v[0])} min={5} max={15} step={1} disabled={isLoading} />
        </Field>

        <Field label="Style">
          <Select
            value={style}
            onChange={setStyle}
            disabled={isLoading}
            triggerClassName="h-9"
            options={stylePresets}
          />
        </Field>

        <Field label="Character" hint="Attach a character — coming with the Character builder">
          <div className="flex h-9 items-center gap-2 rounded-md border border-dashed border-border px-3">
            <span className="flex-1 text-[12.5px] text-muted-foreground/60">+ Attach character</span>
            <Chip tone="gray">Soon</Chip>
          </div>
        </Field>
      </aside>
    </div>
  );
}
