import { it, expect } from 'vitest';

import {
  CRM_SETTINGS_SECTIONS,
  shouldMergeCrmEmailAccountsWithConnections,
} from './crm-settings-sections';

it('CRM settings sections keep the expected CRM configuration destinations', () => {
  expect(CRM_SETTINGS_SECTIONS.map((section) => section.key)).toEqual(['pipelines', 'custom-fields', 'tags', 'webhooks', 'compliance']);
});

it('CRM email accounts now merge into global connections integrations', () => {
  const decision = shouldMergeCrmEmailAccountsWithConnections();

  expect(decision.merge).toBe(true);
  expect(decision.reason).toMatch(/shared settings connections tab/i);
});
