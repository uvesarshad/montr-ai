import { it, expect } from 'vitest';

import { getSocialShellMeta } from './social-shell';

it('getSocialShellMeta returns overview metadata for the social root', () => {
  const result = getSocialShellMeta('/social');

  expect(result.title).toBe('Overview');
  expect(result.section).toBe('Command center');
  expect(result.primaryAction.label).toBe('Create post');
  expect(result.primaryAction.href).toBe('/social/create-post');
  expect(result.showShell).toBe(true);
});

it('getSocialShellMeta maps bulk composer routes to the planner workspace', () => {
  const result = getSocialShellMeta('/social/create-post/bulk');

  expect(result.title).toBe('Bulk planner');
  expect(result.section).toBe('Planning');
  expect(result.primaryAction.label).toBe('Single composer');
  expect(result.primaryAction.href).toBe('/social/create-post');
});

it('getSocialShellMeta keeps utility callback routes outside the module shell', () => {
  const result = getSocialShellMeta('/social/oauth-callback');

  expect(result.title).toBe('Social');
  expect(result.section).toBe('Utility');
  expect(result.showShell).toBe(false);
});
