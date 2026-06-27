
import { it, expect } from 'vitest';
import {
  aiStudioNavSections,
  getAiStudioShellMeta,
  getAiStudioToolDefinition,
} from './shell';

it('ai studio nav sections expose overview plus all studio tools', () => {
  const items = aiStudioNavSections.flatMap((section) => section.items.map((item) => item.href));

  expect(items).toEqual([
    '/ai-studio',
    '/ai-studio/text',
    '/ai-studio/image',
    '/ai-studio/video',
    '/ai-studio/audio',
    '/ai-studio/character',
  ]);
});

it('getAiStudioShellMeta returns overview metadata for the module root', () => {
  const result = getAiStudioShellMeta('/ai-studio');

  expect(result.title).toBe('Overview');
  expect(result.section).toBe('Creative operations');
  expect(result.toolKey).toBe('overview');
  expect(result.primaryAction.label).toBe('Open text studio');
  expect(result.primaryAction.href).toBe('/ai-studio/text');
});

it('getAiStudioShellMeta maps image routes to the image workspace', () => {
  const result = getAiStudioShellMeta('/ai-studio/image');

  expect(result.title).toBe('Image generation');
  expect(result.section).toBe('Visual assets');
  expect(result.toolKey).toBe('image');
  expect(result.status).toBe('live');
});

it('getAiStudioShellMeta marks coming-soon tools correctly', () => {
  const result = getAiStudioShellMeta('/ai-studio/audio');

  expect(result.title).toBe('Audio generation');
  expect(result.toolKey).toBe('audio');
  expect(result.status).toBe('coming-soon');
  expect(result.primaryAction.href).toBe('/ai-studio');
});

it('getAiStudioToolDefinition returns the tool descriptor used across the module', () => {
  const result = getAiStudioToolDefinition('video');

  expect(result.label).toBe('Video');
  expect(result.href).toBe('/ai-studio/video');
  expect(result.status).toBe('live');
  expect(result.metricLabel).toBe('Render lane');
});
