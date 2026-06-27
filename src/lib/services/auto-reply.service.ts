import { IWhatsAppAutoReply } from '@/lib/db/models/whatsapp-auto-reply.model';
import { whatsappAutoReplyRepository } from '@/lib/db/repository/whatsapp-auto-reply.repository';

/**
 * Auto-Reply Service
 * Handles matching and processing of auto-reply rules
 */
export class AutoReplyService {
    /**
     * Check if message matches any auto-reply rules
     */
    async findMatchingReply(
        accountId: string,
        message: string,
        contact?: { tags?: string[] }
    ): Promise<IWhatsAppAutoReply | null> {
        const autoReplies = await whatsappAutoReplyRepository.findActiveByAccount(accountId);

        for (const reply of autoReplies) {
            if (await this.matchesRule(reply, message, contact)) {
                return reply;
            }
        }

        return null;
    }

    /**
     * Check if a message matches a specific auto-reply rule
     */
    private async matchesRule(
        reply: IWhatsAppAutoReply,
        message: string,
        contact?: { tags?: string[] }
    ): Promise<boolean> {
        // Check trigger type
        switch (reply.trigger.type) {
            case 'keyword':
                if (!this.matchesKeywords(message, reply.trigger.keywords || [])) {
                    return false;
                }
                break;

            case 'greeting':
                if (!this.isGreeting(message)) {
                    return false;
                }
                break;

            case 'business_hours':
                if (!this.isWithinBusinessHours(reply.conditions?.businessHours)) {
                    return false;
                }
                break;

            case 'always':
                // Always matches
                break;
        }

        // Check tag conditions
        if (reply.conditions?.tags && reply.conditions.tags.length > 0) {
            if (!contact || !this.hasMatchingTags(contact, reply.conditions.tags)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if message contains any of the keywords
     */
    private matchesKeywords(message: string, keywords: string[]): boolean {
        const lowerMessage = message.toLowerCase();
        return keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
    }

    /**
     * Check if message is a greeting
     */
    private isGreeting(message: string): boolean {
        const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'hola', 'namaste'];
        const lowerMessage = message.toLowerCase().trim();
        return greetings.some(greeting => lowerMessage.startsWith(greeting));
    }

    /**
     * Check if current time is within business hours
     */
    private isWithinBusinessHours(businessHours?: {
        enabled: boolean;
        timezone?: string;
        schedule?: Record<string, { start: string; end: string }>;
    }): boolean {
        if (!businessHours || !businessHours.enabled) {
            return true;
        }

        const now = new Date();
        const timezone = businessHours.timezone || 'UTC';

        // Get current day and time in the specified timezone
        const dayName = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone }).toLowerCase();
        const currentTime = now.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timezone
        });

        const schedule = businessHours.schedule?.[dayName];
        if (!schedule) {
            return false; // No schedule for this day
        }

        return currentTime >= schedule.start && currentTime <= schedule.end;
    }

    /**
     * Check if contact has matching tags
     */
    private hasMatchingTags(contact: { tags?: string[] }, requiredTags: string[]): boolean {
        const tags = contact.tags;
        if (!tags || tags.length === 0) {
            return false;
        }
        return requiredTags.some(tag => tags.includes(tag));
    }
}

export const autoReplyService = new AutoReplyService();
