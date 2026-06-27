import { it, expect } from 'vitest';

import {
  buildCreatePostInsights,
  type CreatePostInsightsInput,
} from './create-post-insights';

function buildInput(
  overrides: Partial<CreatePostInsightsInput> = {},
): CreatePostInsightsInput {
  return {
    hasSelectedBrand: true,
    selectedPlatforms: ['linkedin'],
    selectedTelegramAccountIds: [],
    telegramChannelsByAccount: {},
    caption: 'Launching our new campaign today.',
    mediaCount: 1,
    imageCount: 1,
    videoCount: 0,
    postFormat: 'standard',
    imagesMissingAltText: 0,
    ...overrides,
  };
}

it('buildCreatePostInsights reports healthy posts as ready with a high score', () => {
  const result = buildCreatePostInsights(buildInput());

  expect(result.readinessLabel).toBe('Ready to publish');
  expect(result.score).toBe(100);
  expect(result.blockers).toEqual([]);
  expect(result.warnings).toEqual([]);
  expect(result.stats.selectedPlatforms).toBe(1);
  expect(result.stats.remainingPrimaryChars).toBe(2967);
});

it('buildCreatePostInsights flags platform blockers and copy overflow', () => {
  const result = buildCreatePostInsights(
    buildInput({
      selectedPlatforms: ['instagram', 'x', 'telegram'],
      selectedTelegramAccountIds: ['telegram-1'],
      telegramChannelsByAccount: { 'telegram-1': [] },
      caption: 'x'.repeat(320),
      mediaCount: 0,
      imageCount: 0,
      videoCount: 0,
      imagesMissingAltText: 0,
    }),
  );

  expect(result.readinessLabel).toBe('Needs attention');
  expect(result.score).toBe(25);
  expect(result.blockers).toEqual([
    'Instagram requires at least one image or reel.',
    'Choose at least one Telegram channel.',
  ]);
  expect(result.warnings).toEqual([
    'Shorten copy for X by 40 characters.',
  ]);
  expect(result.stats.overLimitPlatforms).toBe(1);
  expect(result.stats.requiredMediaPlatforms).toBe(1);
});

it('buildCreatePostInsights encourages caption, channels, and alt text before publishing', () => {
  const result = buildCreatePostInsights(
    buildInput({
      hasSelectedBrand: false,
      selectedPlatforms: ['telegram', 'dribbble'],
      selectedTelegramAccountIds: ['telegram-9'],
      telegramChannelsByAccount: { 'telegram-9': ['chat-1'] },
      caption: '   ',
      mediaCount: 2,
      imageCount: 2,
      imagesMissingAltText: 2,
    }),
  );

  expect(result.readinessLabel).toBe('Needs setup');
  expect(result.score).toBe(35);
  expect(result.blockers).toEqual([
    'Select a brand before publishing.',
    'Write a caption before publishing.',
  ]);
  expect(result.warnings).toEqual([
    'Add alt text to 2 images.',
  ]);
  expect(result.stats.imagesMissingAltText).toBe(2);
  expect(result.stats.primaryPlatform).toBe('telegram');
});

it('buildCreatePostInsights accepts instagram reel drafts with video media', () => {
  const result = buildCreatePostInsights(
    buildInput({
      selectedPlatforms: ['instagram'],
      mediaCount: 1,
      imageCount: 0,
      videoCount: 1,
      postFormat: 'reel',
    }),
  );

  expect(result.readinessLabel).toBe('Ready to publish');
  expect(result.score).toBe(100);
  expect(result.blockers).toEqual([]);
});

it('buildCreatePostInsights blocks unsupported video channel combinations', () => {
  const result = buildCreatePostInsights(
    buildInput({
      selectedPlatforms: ['instagram', 'linkedin', 'facebook', 'dribbble'],
      mediaCount: 1,
      imageCount: 0,
      videoCount: 1,
      postFormat: 'standard',
    }),
  );

  expect(result.readinessLabel).toBe('Needs attention');
  expect(result.blockers).toEqual([
    'Instagram video publishing requires reel format.',
    'Dribbble requires at least one image.',
    'LinkedIn video publishing is not supported in the current flow yet.',
    'Facebook video publishing is not supported in the current flow yet.',
  ]);
});
