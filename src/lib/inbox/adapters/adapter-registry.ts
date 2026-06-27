import { IChannelAdapter } from './channel-adapter.interface';
import { WhatsAppAdapter } from './whatsapp.adapter';
import { InstagramAdapter } from './instagram.adapter';
import { FacebookAdapter } from './facebook.adapter';
import { DiscordAdapter } from './discord.adapter';
import { SlackAdapter } from './slack.adapter';
import { WebsiteAdapter } from './website.adapter';
import { EmailAdapter } from './email.adapter';
import { APIAdapter } from './api.adapter';
import { TelegramAdapter } from './telegram.adapter';
import { TeamsAdapter } from './teams.adapter';
import { GoogleChatAdapter } from './google-chat.adapter';
import { InboxChannelType } from '@/lib/db/models/inbox-channel.model';

/**
 * Channel Adapter Registry
 * Maps channel types to their respective adapters
 */
class AdapterRegistry {
    private adapters: Map<InboxChannelType, IChannelAdapter>;

    constructor() {
        this.adapters = new Map();
        this.registerAdapters();
    }

    private registerAdapters() {
        this.adapters.set('whatsapp', new WhatsAppAdapter());
        this.adapters.set('instagram', new InstagramAdapter());
        this.adapters.set('facebook', new FacebookAdapter());
        this.adapters.set('discord', new DiscordAdapter());
        this.adapters.set('slack', new SlackAdapter());
        this.adapters.set('website', new WebsiteAdapter());
        this.adapters.set('email', new EmailAdapter());
        this.adapters.set('api', new APIAdapter());
        this.adapters.set('telegram', new TelegramAdapter());
        this.adapters.set('teams', new TeamsAdapter());
        this.adapters.set('google_chat', new GoogleChatAdapter());
    }

    getAdapter(channelType: InboxChannelType): IChannelAdapter {
        const adapter = this.adapters.get(channelType);
        if (!adapter) {
            throw new Error(`No adapter found for channel type: ${channelType}`);
        }
        return adapter;
    }

    getAllAdapters(): Map<InboxChannelType, IChannelAdapter> {
        return this.adapters;
    }
}

// Export singleton instance
export const adapterRegistry = new AdapterRegistry();
