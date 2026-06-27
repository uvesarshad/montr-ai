
import { it, expect } from 'vitest';
import {
  conversationRoutes,
  getLegacyModuleRedirect,
  marketingRoutes,
} from './module-routes';

it('exposes the unified canonical module URLs', () => {
  expect(conversationRoutes.root).toBe('/conversations');
  expect(conversationRoutes.channels).toBe('/conversations/channels');

  expect(marketingRoutes.whatsapp.root).toBe('/marketing/whatsapp');
  expect(marketingRoutes.whatsapp.inbox).toBe('/marketing/whatsapp/inbox');

  expect(marketingRoutes.email.root).toBe('/marketing/email');
  expect(marketingRoutes.email.dashboard).toBe('/marketing/email/dashboard');
});

it('maps legacy CRM module URLs to the new canonical URLs', () => {
  expect(getLegacyModuleRedirect('/crm/inbox')).toBe('/conversations');
  expect(getLegacyModuleRedirect('/crm/inbox/analytics')).toBe('/conversations/analytics');
  expect(getLegacyModuleRedirect('/crm/whatsapp')).toBe('/marketing/whatsapp');
  expect(getLegacyModuleRedirect('/crm/whatsapp/settings')).toBe('/marketing/whatsapp/settings');
  expect(getLegacyModuleRedirect('/crm/marketing-email')).toBe('/marketing/email');
  expect(getLegacyModuleRedirect('/crm/marketing-email/templates/new')).toBe('/marketing/email/templates/new');
  expect(getLegacyModuleRedirect('/crm/contacts')).toBe(null);
});
