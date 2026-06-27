'use client';

import { format } from 'date-fns';
import { CalendarClock, Film, ImageOff } from 'lucide-react';

import { Chip } from '@/components/ui-kit';
import { cn } from '@/lib/utils';

export interface ApprovalPost {
  content: string;
  mediaUrls: string[];
  mediaTypes: ('image' | 'video')[];
  platforms: Array<{ platform: string; platformUsername: string }>;
  scheduledFor: string;
  timezone: string;
}

function platformLabel(platform: string): string {
  if (!platform) return 'Platform';
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function MediaThumb({ url, type }: { url: string; type: 'image' | 'video' }) {
  if (type === 'video') {
    return (
      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
        <video
          src={url}
          className="h-full w-full object-cover"
          muted
          preload="metadata"
        />
        <span className="absolute inset-0 grid place-items-center bg-black/30 text-white">
          <Film className="size-4" />
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Post media"
      className="size-14 shrink-0 rounded-lg border border-border object-cover"
    />
  );
}

/**
 * Compact preview of the underlying social post shown inside each approval
 * queue card and the approve/reject dialog so admins review in context.
 */
export function ApprovalPostPreview({
  post,
  className,
  contentClamp = 'line-clamp-3',
}: {
  post: ApprovalPost;
  className?: string;
  contentClamp?: string;
}) {
  const hasMedia = post.mediaUrls.length > 0;

  return (
    <div className={cn('space-y-3', className)}>
      {post.content ? (
        <p className={cn('whitespace-pre-wrap text-sm text-foreground', contentClamp)}>
          {post.content}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">No caption</p>
      )}

      {hasMedia ? (
        <div className="flex flex-wrap gap-2">
          {post.mediaUrls.map((url, index) => (
            <MediaThumb
              key={`${url}-${index}`}
              url={url}
              type={post.mediaTypes[index] === 'video' ? 'video' : 'image'}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImageOff className="size-3.5" />
          No media
        </div>
      )}

      {post.platforms.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {post.platforms.map((pl, index) => (
            <Chip key={`${pl.platform}-${pl.platformUsername}-${index}`} tone="info">
              {platformLabel(pl.platform)}
              {pl.platformUsername ? ` · @${pl.platformUsername}` : ''}
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="size-3.5" />
        <span>
          {format(new Date(post.scheduledFor), "MMM d, yyyy · h:mm a")}
          {post.timezone ? ` (${post.timezone})` : ''}
        </span>
      </div>
    </div>
  );
}
