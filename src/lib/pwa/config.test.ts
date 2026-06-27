
import { it, expect } from 'vitest';
import type { AppleWebApp } from 'next/dist/lib/metadata/types/metadata-interface';

import { getPwaManifest, getPwaMetadata } from './config';

it('getPwaManifest returns an installable standalone app manifest', () => {
  const manifest = getPwaManifest();

  expect(manifest.name).toBe('MontrAI');
  expect(manifest.short_name).toBe('MontrAI');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(manifest.background_color).toBe('#0b1020');
  expect(manifest.theme_color).toBe('#0b1020');
  expect(manifest.icons?.some(
      (icon) =>
        icon.src === '/montr_ai_logo_icon.png' &&
        icon.sizes === '512x512' &&
        icon.purpose === 'maskable',
    )).toBeTruthy();
});

it('getPwaMetadata exposes manifest and Apple web app settings', () => {
  const metadata = getPwaMetadata();

  expect(metadata.applicationName).toBe('MontrAI');
  expect(metadata.manifest).toBe('/manifest.webmanifest');
  expect((metadata.appleWebApp as AppleWebApp)?.capable).toBe(true);
  expect((metadata.appleWebApp as AppleWebApp)?.title).toBe('MontrAI');
  expect(metadata.formatDetection?.telephone).toBe(false);
});
