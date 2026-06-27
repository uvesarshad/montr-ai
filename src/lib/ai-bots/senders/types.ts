/**
 * BotSender abstraction — channel-specific outbound delivery for the bot runtime.
 *
 * Voice channel does NOT use a sender (the VoiceConversationEngine emits audio
 * frames directly). Only WhatsApp + Inbox plug in here.
 */

export interface BotSender {
  send(text: string): Promise<void>;
}
