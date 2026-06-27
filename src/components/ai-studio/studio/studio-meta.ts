/**
 * Mode metadata for the unified AI Studio workspace — the type-first switcher.
 *
 * `availability`:
 *   - 'ready'   → fully wired in the new workspace (Image, M1).
 *   - 'classic' → live, but still on its standalone page; the workspace bridges
 *                 to it until it's migrated in (Video, Text — M1 fan-out).
 *   - 'soon'    → not built yet (Audio; Character is the M2 talking-avatar build).
 */

import {
  Image as ImageIcon,
  MessageSquareText,
  Mic,
  UserRound,
  Video,
  type LucideIcon,
} from 'lucide-react';

export type StudioMode = 'image' | 'video' | 'audio' | 'text' | 'character';

export type StudioModeAvailability = 'ready' | 'classic' | 'soon';

export interface StudioModeMeta {
  key: StudioMode;
  label: string;
  icon: LucideIcon;
  /** Accent color (subtle tints only — chrome stays flat per ModuleShell). */
  tone: string;
  toneBg: string;
  availability: StudioModeAvailability;
  /** For 'classic' modes — the standalone page to bridge to. */
  classicHref?: string;
  blurb: string;
}

// Accent discipline: violet (#7A5AF8 = --brand) for creation/identity modes,
// warm (#F0783C = --warm) for render/audio modes. Ceiling of two accents; status
// colors (green/sky) are reserved for data signals, not mode branding.
export const STUDIO_MODE_META: Record<StudioMode, StudioModeMeta> = {
  image: {
    key: 'image',
    label: 'Image',
    icon: ImageIcon,
    tone: '#7A5AF8',
    toneBg: 'rgba(122, 90, 248, 0.10)',
    availability: 'ready',
    blurb: 'Generate branded visuals, concept frames, and product imagery from a prompt.',
  },
  video: {
    key: 'video',
    label: 'Video',
    icon: Video,
    tone: '#F0783C',
    toneBg: 'rgba(240, 120, 60, 0.10)',
    availability: 'ready',
    blurb: 'Render motion concepts, product teasers, and short cinematic sequences.',
  },
  audio: {
    key: 'audio',
    label: 'Audio',
    icon: Mic,
    tone: '#F0783C',
    toneBg: 'rgba(240, 120, 60, 0.10)',
    availability: 'ready',
    blurb: 'Text to speech across multiple AI voices (OpenAI, ElevenLabs, Sarvam).',
  },
  text: {
    key: 'text',
    label: 'Text',
    icon: MessageSquareText,
    tone: '#7A5AF8',
    toneBg: 'rgba(122, 90, 248, 0.10)',
    availability: 'ready',
    blurb: 'Draft, reason, summarize, and iterate with conversational AI sessions.',
  },
  character: {
    key: 'character',
    label: 'Character',
    icon: UserRound,
    tone: '#7A5AF8',
    toneBg: 'rgba(122, 90, 248, 0.10)',
    availability: 'ready',
    blurb: 'Build reusable identities — attach to any generation. Talking-avatar render next.',
  },
};

/** Switcher order. */
export const STUDIO_MODE_ORDER: StudioMode[] = ['image', 'video', 'audio', 'text', 'character'];

/**
 * Normalized history entry. The sidebar is source-aware because image/video
 * live in AiStudioProject while text still lives in the Conversation model
 * (full backfill to orchestration is M3). Both render in one unified list.
 */
export interface StudioHistoryItem {
  source: 'project' | 'conversation' | 'character';
  id: string;
  kind: StudioMode | 'mixed';
  name: string;
  updatedAt: string;
  /** sessionCount (project), messageCount (conversation), or usageCount (character). */
  count: number;
}
