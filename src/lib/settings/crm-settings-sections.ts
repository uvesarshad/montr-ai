export interface CrmSettingsSection {
  title: string;
  description: string;
  href: string;
  key: 'pipelines' | 'custom-fields' | 'tags' | 'webhooks' | 'compliance';
}

export const CRM_SETTINGS_SECTIONS: CrmSettingsSection[] = [
  {
    key: 'pipelines',
    title: 'Pipelines',
    description: 'Configure sales pipelines, stages, and default deal flow.',
    href: '/crm/settings/pipelines',
  },
  {
    key: 'custom-fields',
    title: 'Custom Fields',
    description: 'Add custom fields to contacts, companies, and deals.',
    href: '/crm/settings/custom-fields',
  },
  {
    key: 'tags',
    title: 'Tags',
    description: 'Manage tags used to categorize contacts, companies, and deals.',
    href: '/crm/settings/tags',
  },
  {
    key: 'webhooks',
    title: 'Webhooks',
    description: 'Manage outgoing CRM webhooks for external workflow integrations.',
    href: '/crm/settings/webhooks',
  },
  {
    key: 'compliance',
    title: 'Compliance Warnings',
    description: 'Review WhatsApp compliance warnings recorded by CRM messaging flows.',
    href: '/crm/settings/compliance',
  },
];

export function shouldMergeCrmEmailAccountsWithConnections() {
  return {
    merge: true,
    reason:
      'Mailbox email connections now live under the shared Settings connections tab instead of a separate CRM settings page.',
  };
}
