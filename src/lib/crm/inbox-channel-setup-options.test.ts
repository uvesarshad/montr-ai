import { it, expect } from 'vitest';

import {
  getChannelSetupOption,
  getGuidedChannelSetupOptions,
  getSupportedChannelSetupOptions,
} from './inbox-channel-setup-options';

it('getGuidedChannelSetupOptions keeps the guided CRM setup destinations first', () => {
  const options = getGuidedChannelSetupOptions();

  expect(options[0]?.type).toBe('whatsapp');
  expect(options[0]?.href).toBe('/marketing/whatsapp/settings');
  expect(options[1]?.type).toBe('email');
  expect(options[1]?.href).toBe('/settings?tab=connections');
});

it('getSupportedChannelSetupOptions exposes the broader omnichannel surface', () => {
  const types = getSupportedChannelSetupOptions().map((option) => option.type);

  expect(types).toEqual([
    'whatsapp',
    'email',
    'instagram',
    'facebook',
    'discord',
    'slack',
    'telegram',
    'teams',
    'google_chat',
    'website',
    'api',
  ]);
});

it('channel setup options distinguish guided paths from supported manual channels', () => {
  const instagram = getChannelSetupOption('instagram');
  const website = getChannelSetupOption('website');
  const api = getChannelSetupOption('api');

  expect(instagram?.availability).toBe('supported');
  expect(instagram?.description || '').toMatch(/settings|oauth/i);
  expect(website?.availability).toBe('supported');
  expect(website?.href).toBe('/ai-bots');
  expect(api?.availability).toBe('supported');
  expect(api?.description || '').toMatch(/manual api|webhook/i);
});


