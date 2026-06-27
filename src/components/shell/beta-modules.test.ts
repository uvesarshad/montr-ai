import { describe, it, expect } from 'vitest';

import { BETA_MODULES, isBetaModule } from './beta-modules';

describe('beta-modules', () => {
  it('flags exact beta module roots', () => {
    expect(isBetaModule('/ads')).toBe(true);
    expect(isBetaModule('/ai-studio')).toBe(true);
    expect(isBetaModule('/ai-bots')).toBe(true);
  });

  it('flags nested routes under a beta module', () => {
    expect(isBetaModule('/ads/campaigns/new')).toBe(true);
    expect(isBetaModule('/ai-studio/123')).toBe(true);
  });

  it('does NOT flag launch-critical surfaces', () => {
    for (const path of [
      '/dashboard',
      '/agent',
      '/crm',
      '/crm/contacts/new',
      '/social',
      '/inbox',
      '/whatsapp',
      '/campaigns',
    ]) {
      expect(isBetaModule(path)).toBe(false);
    }
  });

  it('does NOT prefix-match a sibling whose name starts the same', () => {
    // '/adsense' must not match the '/ads' prefix.
    expect(isBetaModule('/adsense')).toBe(false);
    // '/ai-studios-foo' must not match '/ai-studio'.
    expect(isBetaModule('/ai-studio-archive')).toBe(false);
  });

  it('keeps the curated list small and non-empty', () => {
    expect(BETA_MODULES.length).toBeGreaterThan(0);
    expect(BETA_MODULES.every((p) => p.startsWith('/'))).toBe(true);
  });
});
