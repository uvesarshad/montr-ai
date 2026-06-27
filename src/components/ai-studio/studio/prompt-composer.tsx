'use client';

/**
 * Prompt composer for the generation modes — textarea + file attachments
 * (reference images) shown as a removable thumbnail gallery + a generate bar.
 *
 * Attachments are read client-side as data URLs (no upload endpoint needed);
 * the consuming mode decides how to use them (e.g. the first as a reference /
 * first-frame image passed into the generation request).
 *
 * Composed from the ui-kit (Button / IconButton / Chip).
 */

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { Loader2, Paperclip, Sparkles, Wand2, X } from 'lucide-react';

import { Button, Chip } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { enhancePrompt, type EnhanceMediaType } from '@/ai/flows/enhance-prompt-flow';

export interface ComposerAttachment {
  url: string;
  name?: string;
}

interface PromptComposerProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  attachments: ComposerAttachment[];
  onAttachmentsChange: (next: ComposerAttachment[]) => void;
  onGenerate: () => void;
  isLoading?: boolean;
  generateLabel?: string;
  placeholder?: string;
  accept?: string;
  maxAttachments?: number;
  /** Shown under the attachments when present (e.g. "first image used as reference"). */
  attachmentHint?: string;
  /** Enables the ✨ Enhance button; tailors the rewrite to the media type. */
  enhanceMediaType?: EnhanceMediaType;
  /** Hide the file-attachment affordance (e.g. for Audio, which takes no image). */
  showAttach?: boolean;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function PromptComposer({
  prompt,
  onPromptChange,
  attachments,
  onAttachmentsChange,
  onGenerate,
  isLoading,
  generateLabel = 'Generate',
  placeholder = 'Describe what you want to create…',
  accept = 'image/*',
  maxAttachments = 4,
  attachmentHint,
  enhanceMediaType,
  showAttach = true,
}: PromptComposerProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);

  const handleEnhance = async () => {
    if (!prompt.trim() || isEnhancing) return;
    setIsEnhancing(true);
    try {
      const { enhancedPrompt } = await enhancePrompt({ prompt, mediaType: enhanceMediaType });
      onPromptChange(enhancedPrompt);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Enhance failed',
        description: e instanceof Error ? e.message : 'Could not enhance the prompt.',
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: ComposerAttachment[] = [];
    for (const file of Array.from(files)) {
      if (attachments.length + added.length >= maxAttachments) break;
      try {
        const url = await readAsDataUrl(file);
        added.push({ url, name: file.name });
      } catch {
        /* skip unreadable file */
      }
    }
    if (added.length) onAttachmentsChange([...attachments, ...added]);
  };

  const removeAt = (index: number) =>
    onAttachmentsChange(attachments.filter((_, i) => i !== index));

  const atMax = attachments.length >= maxAttachments;

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      {/* Attachment gallery */}
      {showAttach && attachments.length > 0 ? (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div
              key={`${a.url.slice(0, 24)}-${i}`}
              className="group relative size-14 overflow-hidden rounded-md border border-border"
            >
              <Image src={a.url} alt={a.name || `Attachment ${i + 1}`} fill className="object-cover" unoptimized />
              <button
                type="button"
                onClick={() => removeAt(i)}
                title="Remove"
                className="absolute right-0.5 top-0.5 hidden size-4 items-center justify-center rounded bg-card/85 text-foreground backdrop-blur group-hover:flex"
              >
                <X className="size-2.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder={placeholder}
        disabled={isLoading}
        rows={3}
        className="min-h-[88px] w-full resize-none bg-transparent px-0 text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
      />

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2.5">
        <div className="flex items-center gap-2">
          {showAttach ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={accept}
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={Paperclip}
                onClick={() => fileRef.current?.click()}
                disabled={isLoading || atMax}
                title={atMax ? `Up to ${maxAttachments} attachments` : 'Attach reference image'}
              >
                Attach
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={isEnhancing ? undefined : Sparkles}
            onClick={handleEnhance}
            disabled={isLoading || isEnhancing || !prompt.trim()}
            title="Enhance prompt with AI"
          >
            {isEnhancing ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Enhance
          </Button>
          {prompt.length > 0 ? (
            <Chip tone="gray" className="hidden sm:inline-flex">
              {prompt.length} chars
            </Chip>
          ) : null}
        </div>
        <Button
          variant="brand"
          icon={isLoading ? undefined : Wand2}
          onClick={onGenerate}
          disabled={isLoading || !prompt.trim()}
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
          {generateLabel}
        </Button>
      </div>

      {attachmentHint && attachments.length > 0 ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground/70">{attachmentHint}</p>
      ) : null}
    </div>
  );
}
