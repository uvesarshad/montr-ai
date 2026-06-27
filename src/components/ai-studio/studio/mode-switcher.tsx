'use client';

/**
 * Type-first mode switcher — the single control that replaces five route tabs.
 * Lives in the ModuleShell filter bar. Composed from the kit `Segmented`; each
 * option label is an icon + name (+ a "Soon" chip for unbuilt modes), with the
 * active segment tinted to the mode's accent.
 */

import React from 'react';
import { Segmented, type SegmentedOption } from '@/components/ui-kit';
import { STUDIO_MODE_META, STUDIO_MODE_ORDER, type StudioMode } from './studio-meta';

interface ModeSwitcherProps {
  mode: StudioMode;
  onChange: (mode: StudioMode) => void;
}

export function ModeSwitcher({ mode, onChange }: ModeSwitcherProps) {
  const options: SegmentedOption[] = STUDIO_MODE_ORDER.map((key) => {
    const meta = STUDIO_MODE_META[key];
    const Icon = meta.icon;
    const active = key === mode;
    return {
      value: key,
      label: (
        <span
          className="inline-flex items-center gap-1.5"
          style={active ? { color: meta.tone } : undefined}
        >
          <Icon className="h-[15px] w-[15px]" />
          <span>{meta.label}</span>
          {meta.availability === 'soon' ? (
            <span className="ml-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground/70">
              Soon
            </span>
          ) : null}
        </span>
      ),
    };
  });

  return (
    <div role="tablist" aria-label="Creation mode">
      <Segmented options={options} value={mode} onChange={(v) => onChange(v as StudioMode)} />
    </div>
  );
}
