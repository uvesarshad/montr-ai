'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ExternalLink, Plug, PlugZap, RadioTower, Settings2, ShieldCheck, Sparkles } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { Avatar, Banner, Button, Card, Chip, EmptyState, KpiRow } from '@/components/ui-kit';
import {
  getChannelSetupOption,
  getGuidedChannelSetupOptions,
  getSupportedChannelSetupOptions,
} from '@/lib/crm/inbox-channel-setup-options';
import { conversationRoutes, marketingRoutes } from '@/lib/navigation/module-routes';

interface InboxChannelSummary {
  _id: string;
  name: string;
  channelType: string;
  isActive: boolean;
  lastSyncAt?: string;
  config: {
    phoneNumber?: string;
    email?: string;
    websiteUrl?: string;
  };
}

const SETTINGS_CONNECTIONS_HREF = '/settings?tab=connections';


export default function ManageChannelsPage() {
  const { push: routerPush } = useRouter();
  const [channels, setChannels] = useState<InboxChannelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const guidedSetupOptions = getGuidedChannelSetupOptions();
  const supportedChannelOptions = getSupportedChannelSetupOptions().filter(
    (option) => option.availability === 'supported'
  );

  useEffect(() => {
    void fetchChannels();
  }, []);

  const fetchChannels = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v2/crm/inbox/channels');
      const data = await response.json();
      setChannels(data.channels || []);
    } catch (error) {
      console.error('Error fetching channels:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (!confirm('Are you sure you want to delete this channel?')) {
      return;
    }

    try {
      const response = await fetch(`/api/v2/crm/inbox/channels/${channelId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        void fetchChannels();
      }
    } catch (error) {
      console.error('Error deleting channel:', error);
    }
  };

  const getChannelIcon = (channelType: string) => {
    const icons: Record<string, string> = {
      whatsapp: 'WA',
      instagram: 'IG',
      facebook: 'FB',
      discord: 'DC',
      slack: 'SL',
      website: 'WB',
      email: 'EM',
      api: 'API',
      telegram: 'TG',
      teams: 'MS',
      google_chat: 'GC',
    };
    return icons[channelType] || 'CH';
  };

  const getConfigureHref = (channelType: string) => getChannelSetupOption(channelType)?.href;
  const getActionLabel = (href?: string) => {
    if (!href) {
      return 'Managed manually';
    }

    if (href.startsWith('/settings') || href.startsWith('/crm/settings')) {
      return 'Open settings';
    }

    return 'Open setup';
  };

  const stats = useMemo(() => {
    const active = channels.filter((channel) => channel.isActive).length;
    return [
      {
        label: 'Connected channels',
        value: channels.length,
        icon: PlugZap,
        pastel: 'violet' as const,
      },
      {
        label: 'Active today',
        value: active,
        icon: RadioTower,
        pastel: 'mint' as const,
      },
      {
        label: 'Setup paths',
        value: guidedSetupOptions.length,
        icon: Sparkles,
        pastel: 'blue' as const,
      },
      {
        label: 'Supported adapters',
        value: supportedChannelOptions.length,
        icon: ShieldCheck,
        pastel: 'peach' as const,
      },
    ];
  }, [channels, guidedSetupOptions.length, supportedChannelOptions.length]);

  const primaryAction = (
    <Button size="sm" variant="primary" icon={Settings2} onClick={() => routerPush(SETTINGS_CONNECTIONS_HREF)}>
      Connection settings
    </Button>
  );

  return (
    <ModuleShell
      title="Channels"
      icon={Plug}
      meta="Connected channels"
      primaryAction={primaryAction}
      isLoading={loading}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <Banner
        tone="info"
        icon={Plug}
        title="Connections are managed in Settings"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" iconRight={ArrowRight} onClick={() => routerPush(SETTINGS_CONNECTIONS_HREF)}>
              Settings connections
            </Button>
            <Button size="sm" variant="outline" iconRight={ArrowRight} onClick={() => routerPush(marketingRoutes.whatsapp.settings)}>
              WhatsApp settings
            </Button>
          </div>
        }
      >
        Start new OAuth or credential-based channel connections from the shared settings surfaces, then use this page to
        review which channels are already available inside conversations.
      </Banner>

      <KpiRow cols={4} items={stats} />

      <Card title="Connection destinations" meta="Reuse existing settings and module setup flows">
        <div className="grid gap-4 px-4 pb-4 md:grid-cols-2">
          {guidedSetupOptions.map((option) => (
            <div key={option.type} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{option.description}</p>
                </div>
                <Chip tone="gray">Managed</Chip>
              </div>
              <Button
                variant="outline"
                size="sm"
                iconRight={ArrowRight}
                className="mt-4 w-full"
                onClick={() => routerPush(option.href || conversationRoutes.root)}
              >
                {getActionLabel(option.href)}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Connected channels" meta="Enabled for the unified inbox">
        {channels.length === 0 ? (
          <EmptyState
            icon={PlugZap}
            title="No channels connected"
            note="Connect channels from settings first, then return here to monitor which inbox connections are active for conversations."
            cta={
              <Button variant="primary" iconRight={ArrowRight} onClick={() => routerPush(SETTINGS_CONNECTIONS_HREF)}>
                Open connection settings
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 px-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
            {channels.map((channel) => {
              const configureHref = getConfigureHref(channel.channelType);

              return (
                <div key={channel._id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={getChannelIcon(channel.channelType)} square size={44} />
                      <div>
                        <p className="text-sm font-semibold">{channel.name}</p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {channel.channelType.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                    <Chip tone={channel.isActive ? 'ok' : 'gray'} dot>
                      {channel.isActive ? 'Active' : 'Inactive'}
                    </Chip>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {channel.channelType === 'whatsapp' && channel.config.phoneNumber ? (
                      <p>Phone: {channel.config.phoneNumber}</p>
                    ) : null}
                    {channel.channelType === 'email' && channel.config.email ? (
                      <p>Email: {channel.config.email}</p>
                    ) : null}
                    {channel.channelType === 'website' && channel.config.websiteUrl ? (
                      <p>Website: {channel.config.websiteUrl}</p>
                    ) : null}
                    {channel.lastSyncAt ? (
                      <p>Last synced: {new Date(channel.lastSyncAt).toLocaleString()}</p>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    {configureHref ? (
                      <Button
                        variant="outline"
                        size="sm"
                        iconRight={ExternalLink}
                        className="flex-1"
                        onClick={() => routerPush(configureHref)}
                      >
                        {getActionLabel(configureHref)}
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="flex-1" disabled>
                        Managed manually
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-danger-muted"
                      onClick={() => handleDeleteChannel(channel._id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Additional supported adapters" meta="Reuse shared connections or module flows">
        <div className="grid gap-4 px-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
          {supportedChannelOptions.map((option) => (
            <div key={option.type} className="rounded-xl border border-dashed border-border bg-muted p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{option.description}</p>
                </div>
                <Chip tone={option.href ? 'brand' : 'gray'}>{option.href ? 'Available' : 'Manual'}</Chip>
              </div>
              {option.href ? (
                <Button
                  variant="outline"
                  size="sm"
                  iconRight={ArrowRight}
                  className="mt-4 w-full"
                  onClick={() => routerPush(option.href as string)}
                >
                  {getActionLabel(option.href)}
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="mt-4 w-full" disabled>
                  Manual setup path
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </ModuleShell>
  );
}



