'use client';

/**
 * Read-only viewer for legacy image/video history.
 *
 * Image/video made on the old standalone pages were saved to the Conversation
 * model (assistant message = JSON.stringify(urls)), not AiStudioProject. They
 * show in the unified history sidebar but can't be re-run here — this renders
 * them read-only. Full backfill into AiStudioProject sessions is M3.
 */

import React, { useMemo } from 'react';
import Image from 'next/image';
import useSWR from 'swr';
import { Copy, Download, ExternalLink } from 'lucide-react';

import { IconButton, Chip, Spinner } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationDoc {
  _id: string;
  title: string;
  messages: ConversationMessage[];
}

function parseUrls(content: string | undefined): string[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed.filter((u): u is string => typeof u === 'string');
  } catch {
    // not JSON — treat as a single url/data string if it looks like one
    if (/^(https?:|data:|blob:|\/)/.test(content)) return [content];
  }
  return [];
}

interface LegacyMediaViewerProps {
  conversationId: string;
  kind: 'image' | 'video';
}

export function LegacyMediaViewer({ conversationId, kind }: LegacyMediaViewerProps) {
  const { toast } = useToast();
  const { data, isLoading } = useSWR<ConversationDoc>(
    `/api/v2/conversations/${conversationId}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const prompt = useMemo(
    () => data?.messages?.find((m) => m.role === 'user')?.content ?? '',
    [data],
  );
  const urls = useMemo(() => {
    const assistant = [...(data?.messages ?? [])].reverse().find((m) => m.role === 'assistant');
    return parseUrls(assistant?.content);
  }, [data]);

  const copyPrompt = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      toast({ title: 'Prompt copied' });
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed' });
    }
  };

  const download = (url: string, i: number) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `montrai-${kind}-${i + 1}-${Date.now()}.${kind === 'image' ? 'png' : 'mp4'}`;
    link.click();
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground">{data?.title || 'Legacy item'}</span>
          <Chip tone="gray">Legacy · read-only</Chip>
        </div>
        {prompt ? (
          <IconButton icon={Copy} iconSize={15} onClick={copyPrompt} title="Copy prompt" className="rounded-md border border-border bg-muted/50 hover:bg-muted" />
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-secondary/20 p-3">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : urls.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-[12.5px] text-muted-foreground">
            No saved output found for this item.
          </div>
        ) : kind === 'video' ? (
          <video src={urls[0]} controls className="mx-auto max-h-full rounded-lg" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {urls.map((src, i) => (
              <div key={src} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
                <Image src={src} alt={`Legacy image ${i + 1}`} fill className="object-cover" unoptimized />
                <div className="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex">
                  <IconButton
                    icon={ExternalLink}
                    iconSize={15}
                    onClick={() => window.open(src, '_blank', 'noopener,noreferrer')}
                    title="Open"
                    className="bg-card/80 text-foreground backdrop-blur hover:bg-card"
                  />
                  <IconButton
                    icon={Download}
                    iconSize={15}
                    onClick={() => download(src, i)}
                    title="Download"
                    className="bg-card/80 text-foreground backdrop-blur hover:bg-card"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {prompt ? (
        <div className="mt-3 rounded-xl border border-border bg-secondary/20 p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Prompt</p>
          <p className="text-[13px] text-foreground">{prompt}</p>
        </div>
      ) : null}
    </div>
  );
}
