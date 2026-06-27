export type AiStudioToolKey =
  | 'overview'
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'character';

export type AiStudioToolStatus = 'live' | 'coming-soon';

export interface AiStudioAction {
  label: string;
  href: string;
}

export interface AiStudioToolDefinition {
  key: Exclude<AiStudioToolKey, 'overview'>;
  label: string;
  href: string;
  description: string;
  status: AiStudioToolStatus;
  section: string;
  icon: 'text' | 'image' | 'video' | 'audio' | 'character';
  accentClassName: string;
  surfaceClassName: string;
  ringClassName: string;
  metricLabel: string;
}

export interface AiStudioNavItem {
  key: AiStudioToolKey;
  label: string;
  href: string;
  exact?: boolean;
  description: string;
  status: AiStudioToolStatus;
}

export interface AiStudioNavSection {
  title: string;
  items: AiStudioNavItem[];
}

export interface AiStudioShellMeta {
  title: string;
  section: string;
  toolKey: AiStudioToolKey;
  status: AiStudioToolStatus;
  primaryAction: AiStudioAction;
}

const aiStudioToolDefinitions: Record<Exclude<AiStudioToolKey, 'overview'>, AiStudioToolDefinition> = {
  text: {
    key: 'text',
    label: 'Text',
    href: '/ai-studio/text',
    description: 'Draft, reason, summarize, and iterate with conversational AI sessions.',
    status: 'live',
    section: 'Language systems',
    icon: 'text',
    accentClassName: 'from-sky-500/20 via-cyan-500/10 to-transparent',
    surfaceClassName: 'border-sky-500/20 bg-sky-500/[0.06]',
    ringClassName: 'ring-sky-400/40',
    metricLabel: 'Session lane',
  },
  image: {
    key: 'image',
    label: 'Image',
    href: '/ai-studio/image',
    description: 'Generate branded visuals, concept frames, and product imagery from prompts.',
    status: 'live',
    section: 'Visual assets',
    icon: 'image',
    accentClassName: 'from-fuchsia-500/20 via-violet-500/10 to-transparent',
    surfaceClassName: 'border-fuchsia-500/20 bg-fuchsia-500/[0.06]',
    ringClassName: 'ring-fuchsia-400/40',
    metricLabel: 'Prompt canvas',
  },
  video: {
    key: 'video',
    label: 'Video',
    href: '/ai-studio/video',
    description: 'Render motion concepts, product teasers, and short cinematic sequences.',
    status: 'live',
    section: 'Visual assets',
    icon: 'video',
    accentClassName: 'from-amber-500/20 via-orange-500/10 to-transparent',
    surfaceClassName: 'border-amber-500/20 bg-amber-500/[0.06]',
    ringClassName: 'ring-amber-400/40',
    metricLabel: 'Render lane',
  },
  audio: {
    key: 'audio',
    label: 'Audio',
    href: '/ai-studio/audio',
    description: 'Prepare music, voice, and sound design workflows for upcoming releases.',
    status: 'coming-soon',
    section: 'Narrative systems',
    icon: 'audio',
    accentClassName: 'from-emerald-500/20 via-green-500/10 to-transparent',
    surfaceClassName: 'border-emerald-500/20 bg-emerald-500/[0.06]',
    ringClassName: 'ring-emerald-400/40',
    metricLabel: 'Voice lane',
  },
  character: {
    key: 'character',
    label: 'Character',
    href: '/ai-studio/character',
    description: 'Shape repeatable personas, casts, and visual identities for story worlds.',
    status: 'coming-soon',
    section: 'Narrative systems',
    icon: 'character',
    accentClassName: 'from-rose-500/20 via-pink-500/10 to-transparent',
    surfaceClassName: 'border-rose-500/20 bg-rose-500/[0.06]',
    ringClassName: 'ring-rose-400/40',
    metricLabel: 'Persona lane',
  },
};

export const aiStudioNavSections: AiStudioNavSection[] = [
  {
    title: 'Studio',
    items: [
      {
        key: 'overview',
        label: 'Overview',
        href: '/ai-studio',
        exact: true,
        description: 'See every active generation lane and pick the next workspace.',
        status: 'live',
      },
      {
        key: 'text',
        label: 'Text',
        href: '/ai-studio/text',
        description: aiStudioToolDefinitions.text.description,
        status: aiStudioToolDefinitions.text.status,
      },
      {
        key: 'image',
        label: 'Image',
        href: '/ai-studio/image',
        description: aiStudioToolDefinitions.image.description,
        status: aiStudioToolDefinitions.image.status,
      },
      {
        key: 'video',
        label: 'Video',
        href: '/ai-studio/video',
        description: aiStudioToolDefinitions.video.description,
        status: aiStudioToolDefinitions.video.status,
      },
    ],
  },
  {
    title: 'Labs',
    items: [
      {
        key: 'audio',
        label: 'Audio',
        href: '/ai-studio/audio',
        description: aiStudioToolDefinitions.audio.description,
        status: aiStudioToolDefinitions.audio.status,
      },
      {
        key: 'character',
        label: 'Character',
        href: '/ai-studio/character',
        description: aiStudioToolDefinitions.character.description,
        status: aiStudioToolDefinitions.character.status,
      },
    ],
  },
];

const defaultMeta: AiStudioShellMeta = {
  title: 'Overview',
  section: 'Creative operations',
  toolKey: 'overview',
  status: 'live',
  primaryAction: {
    label: 'Open text studio',
    href: '/ai-studio/text',
  },
};

export function getAiStudioToolDefinition(
  key: Exclude<AiStudioToolKey, 'overview'>,
): AiStudioToolDefinition {
  return aiStudioToolDefinitions[key];
}

export function getAiStudioToolDefinitions(): AiStudioToolDefinition[] {
  return Object.values(aiStudioToolDefinitions);
}

export function getAiStudioShellMeta(pathname: string): AiStudioShellMeta {
  if (pathname === '/ai-studio') {
    return defaultMeta;
  }

  if (pathname.startsWith('/ai-studio/text')) {
    return {
      title: 'Text generation',
      section: 'Language systems',
      toolKey: 'text',
      status: aiStudioToolDefinitions.text.status,
      primaryAction: {
        label: 'New text session',
        href: '/ai-studio/text',
      },
    };
  }

  if (pathname.startsWith('/ai-studio/image')) {
    return {
      title: 'Image generation',
      section: 'Visual assets',
      toolKey: 'image',
      status: aiStudioToolDefinitions.image.status,
      primaryAction: {
        label: 'New image session',
        href: '/ai-studio/image',
      },
    };
  }

  if (pathname.startsWith('/ai-studio/video')) {
    return {
      title: 'Video generation',
      section: 'Visual assets',
      toolKey: 'video',
      status: aiStudioToolDefinitions.video.status,
      primaryAction: {
        label: 'New video session',
        href: '/ai-studio/video',
      },
    };
  }

  if (pathname.startsWith('/ai-studio/audio')) {
    return {
      title: 'Audio generation',
      section: 'Narrative systems',
      toolKey: 'audio',
      status: aiStudioToolDefinitions.audio.status,
      primaryAction: {
        label: 'Back to overview',
        href: '/ai-studio',
      },
    };
  }

  if (pathname.startsWith('/ai-studio/character')) {
    return {
      title: 'Character generation',
      section: 'Narrative systems',
      toolKey: 'character',
      status: aiStudioToolDefinitions.character.status,
      primaryAction: {
        label: 'Back to overview',
        href: '/ai-studio',
      },
    };
  }

  return defaultMeta;
}
