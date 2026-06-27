import { marketingRoutes } from '@/lib/navigation/module-routes';

export interface ChannelSetupOption {
  type: string;
  label: string;
  description: string;
  href?: string;
  availability: 'guided' | 'supported' | 'planned';
}

const SETTINGS_CONNECTIONS_HREF = '/settings?tab=connections';
const CRM_WEBHOOKS_HREF = '/crm/settings/webhooks';

const CHANNEL_SETUP_OPTIONS: ChannelSetupOption[] = [
  {
    type: 'whatsapp',
    label: 'WhatsApp',
    description: 'Manage WhatsApp inbox numbers and connection health from the existing WhatsApp settings flow.',
    href: marketingRoutes.whatsapp.settings,
    availability: 'guided',
  },
  {
    type: 'email',
    label: 'Email',
    description: 'Connect shared inboxes and mailbox sync accounts from CRM email settings, then route them into conversations.',
    href: SETTINGS_CONNECTIONS_HREF,
    availability: 'guided',
  },
  {
    type: 'instagram',
    label: 'Instagram',
    description: 'Reuse the existing social OAuth connection flow in Settings for Instagram conversation entry points.',
    href: SETTINGS_CONNECTIONS_HREF,
    availability: 'supported',
  },
  {
    type: 'facebook',
    label: 'Facebook',
    description: 'Reuse the existing social OAuth connection flow in Settings for Facebook page messaging connections.',
    href: SETTINGS_CONNECTIONS_HREF,
    availability: 'supported',
  },
  {
    type: 'discord',
    label: 'Discord',
    description: 'Manage Discord credentials from the shared Settings connections surface and label them for conversations.',
    href: SETTINGS_CONNECTIONS_HREF,
    availability: 'supported',
  },
  {
    type: 'slack',
    label: 'Slack',
    description: 'Manage Slack workspace credentials from the shared Settings connections surface and map them into conversations.',
    href: SETTINGS_CONNECTIONS_HREF,
    availability: 'supported',
  },
  {
    type: 'telegram',
    label: 'Telegram',
    description: 'Reuse the existing Telegram connection flow in Settings for conversation-ready bot and channel access.',
    href: SETTINGS_CONNECTIONS_HREF,
    availability: 'supported',
  },
  {
    type: 'teams',
    label: 'Microsoft Teams',
    description: 'Manage Microsoft Teams credentials from Settings and use conversations as the operational inbox layer.',
    href: SETTINGS_CONNECTIONS_HREF,
    availability: 'supported',
  },
  {
    type: 'google_chat',
    label: 'Google Chat',
    description: 'Manage Google Chat service credentials from Settings and route supported traffic into conversations.',
    href: SETTINGS_CONNECTIONS_HREF,
    availability: 'supported',
  },
  {
    type: 'website',
    label: 'Website bot',
    description: 'Manage website bot widgets from AI Bots, then review conversation volume from this inbox.',
    href: '/ai-bots',
    availability: 'supported',
  },
  {
    type: 'api',
    label: 'Custom API',
    description: 'Use CRM webhooks or API-based credentials for custom conversation sources when OAuth is not applicable.',
    href: CRM_WEBHOOKS_HREF,
    availability: 'supported',
  },
];

export function getChannelSetupOption(type: string) {
  return CHANNEL_SETUP_OPTIONS.find((option) => option.type === type);
}

export function getGuidedChannelSetupOptions() {
  return CHANNEL_SETUP_OPTIONS.filter((option) => option.availability === 'guided');
}

export function getSupportedChannelSetupOptions() {
  return CHANNEL_SETUP_OPTIONS.filter((option) => option.availability !== 'planned');
}

