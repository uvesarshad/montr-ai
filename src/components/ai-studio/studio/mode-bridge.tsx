'use client';

/**
 * Placeholder center for modes not yet migrated into the unified workspace.
 *
 *  - 'classic' → live on its standalone page; we bridge to it so there's no
 *    functional regression during the M1 fan-out (Video, Text).
 *  - 'soon'    → not built yet (Audio; Character is the M2 talking-avatar build).
 *
 * Composed from the ui-kit (Button / Chip).
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Construction } from 'lucide-react';

import { Button, Chip } from '@/components/ui-kit';
import type { StudioModeMeta } from './studio-meta';

export function ModeBridge({ meta }: { meta: StudioModeMeta }) {
  const Icon = meta.icon;
  const router = useRouter();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <span
        className="flex size-14 items-center justify-center rounded-2xl"
        style={{ background: meta.toneBg, color: meta.tone }}
      >
        <Icon className="size-6" />
      </span>
      <div className="max-w-sm space-y-1.5">
        <h2 className="text-[16px] font-semibold text-foreground">{meta.label}</h2>
        <p className="text-[13px] text-muted-foreground">{meta.blurb}</p>
      </div>

      {meta.availability === 'classic' && meta.classicHref ? (
        <Button
          variant="primary"
          iconRight={ArrowRight}
          onClick={() => router.push(meta.classicHref!)}
        >
          Open the current {meta.label} workspace
        </Button>
      ) : (
        <Chip tone="gray" icon={Construction}>
          Coming soon
        </Chip>
      )}
    </div>
  );
}
