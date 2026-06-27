export type CreatePostPlatform =
  | 'instagram'
  | 'linkedin'
  | 'x'
  | 'facebook'
  | 'youtube'
  | 'reddit'
  | 'telegram'
  | 'google_business'
  | 'dribbble'
  | 'threads';

export interface CreatePostInsightsInput {
  hasSelectedBrand: boolean;
  selectedPlatforms: CreatePostPlatform[];
  selectedTelegramAccountIds: string[];
  telegramChannelsByAccount: Record<string, string[]>;
  caption: string;
  mediaCount: number;
  imageCount: number;
  videoCount: number;
  postFormat: 'standard' | 'reel';
  imagesMissingAltText: number;
}

export interface CreatePostInsightsResult {
  score: number;
  readinessLabel: 'Needs setup' | 'Needs attention' | 'Ready to publish';
  blockers: string[];
  warnings: string[];
  stats: {
    selectedPlatforms: number;
    requiredMediaPlatforms: number;
    overLimitPlatforms: number;
    imagesMissingAltText: number;
    remainingPrimaryChars: number | null;
    primaryPlatform: CreatePostPlatform | null;
  };
}

const platformCharLimits: Record<CreatePostPlatform, number> = {
  x: 280,
  threads: 500,
  instagram: 2200,
  linkedin: 3000,
  facebook: 63206,
  youtube: 5000,
  reddit: 40000,
  telegram: 4096,
  google_business: 1500,
  dribbble: 2000,
};

const mediaRequiredPlatforms = new Set<CreatePostPlatform>(['instagram', 'dribbble']);

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function buildCreatePostInsights(
  input: CreatePostInsightsInput,
): CreatePostInsightsResult {
  const trimmedCaption = input.caption.trim();
  const primaryPlatform = input.selectedPlatforms[0] || null;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.hasSelectedBrand) {
    blockers.push('Select a brand before publishing.');
  }

  if (!trimmedCaption) {
    blockers.push('Write a caption before publishing.');
  }

  const requiredMediaPlatforms = input.selectedPlatforms.filter((platform) =>
    mediaRequiredPlatforms.has(platform),
  );
  if (requiredMediaPlatforms.includes('instagram') && input.mediaCount === 0) {
    blockers.push('Instagram requires at least one image or reel.');
  }

  if (requiredMediaPlatforms.includes('instagram') && input.videoCount > 0 && input.postFormat !== 'reel') {
    blockers.push('Instagram video publishing requires reel format.');
  }

  if (requiredMediaPlatforms.includes('dribbble') && input.imageCount === 0) {
    blockers.push('Dribbble requires at least one image.');
  }

  if (input.videoCount > 0 && input.selectedPlatforms.includes('linkedin')) {
    blockers.push('LinkedIn video publishing is not supported in the current flow yet.');
  }

  if (input.videoCount > 0 && input.selectedPlatforms.includes('facebook')) {
    blockers.push('Facebook video publishing is not supported in the current flow yet.');
  }

  const hasTelegramSelected =
    input.selectedPlatforms.includes('telegram') &&
    input.selectedTelegramAccountIds.length > 0;
  if (hasTelegramSelected) {
    const totalChannels = input.selectedTelegramAccountIds.reduce(
      (count, accountId) =>
        count + (input.telegramChannelsByAccount[accountId]?.length || 0),
      0,
    );

    if (totalChannels === 0) {
      blockers.push('Choose at least one Telegram channel.');
    }
  }

  const overLimitPlatforms = input.selectedPlatforms.reduce((count, platform) => {
    const limit = platformCharLimits[platform];
    return count + (input.caption.length > limit ? 1 : 0);
  }, 0);

  if (input.selectedPlatforms.includes('x') && input.caption.length > platformCharLimits.x) {
    warnings.push(
      `Shorten copy for X by ${input.caption.length - platformCharLimits.x} characters.`,
    );
  }

  if (input.imagesMissingAltText > 0) {
    warnings.push(
      `Add alt text to ${pluralize(input.imagesMissingAltText, 'image')}.`,
    );
  }

  let score = 100;
  for (const blocker of blockers) {
    switch (blocker) {
      case 'Select a brand before publishing.':
        score -= 30;
        break;
      case 'Write a caption before publishing.':
        score -= 25;
        break;
      default:
        score -= 30;
    }
  }

  for (const warning of warnings) {
    if (warning.startsWith('Shorten copy for X')) {
      score -= 15;
    } else {
      score -= 10;
    }
  }

  score = Math.max(0, Math.min(100, score));

  let readinessLabel: CreatePostInsightsResult['readinessLabel'] =
    'Ready to publish';
  if (!input.hasSelectedBrand || blockers.some((item) => item.includes('caption'))) {
    readinessLabel = 'Needs setup';
  } else if (blockers.length > 0 || warnings.length > 0) {
    readinessLabel = 'Needs attention';
  }

  return {
    score,
    readinessLabel,
    blockers,
    warnings,
    stats: {
      selectedPlatforms: input.selectedPlatforms.length,
      requiredMediaPlatforms: requiredMediaPlatforms.length,
      overLimitPlatforms,
      imagesMissingAltText: input.imagesMissingAltText,
      remainingPrimaryChars: primaryPlatform
        ? platformCharLimits[primaryPlatform] - input.caption.length
        : null,
      primaryPlatform,
    },
  };
}
