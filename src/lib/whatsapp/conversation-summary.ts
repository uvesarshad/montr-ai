interface ConversationContact {
  _id: string;
  firstName: string;
  lastName: string;
  channels: Array<{ type?: string; identifier?: string }>;
}

interface ConversationMessage {
  _id?: string;
  bodyPlain?: string;
  createdAt?: Date | string;
  messageMetadata?: {
    direction?: string;
  };
}

interface ConversationRecord {
  _id?: string;
  internalNotes?: string;
}

interface BuildConversationSummaryInput {
  contact: ConversationContact;
  lastMessage: ConversationMessage | null;
  unreadCount: number;
  conversation?: ConversationRecord | null;
  accountId?: string | null;
}

interface BuildConversationDefaultsInput {
  accountId: string;
  contactId: string;
  totalMessages: number;
  lastMessage: ConversationMessage | null;
}

export function buildWhatsAppConversationSummary({
  contact,
  lastMessage,
  unreadCount,
  conversation,
  accountId,
}: BuildConversationSummaryInput) {
  return {
    contact,
    accountId: accountId ?? undefined,
    conversationId: conversation?._id ? String(conversation._id) : undefined,
    internalNotes: conversation?.internalNotes ?? '',
    lastMessage: lastMessage
      ? {
          _id: lastMessage._id,
          bodyPlain: lastMessage.bodyPlain || '',
          createdAt: lastMessage.createdAt,
          direction: lastMessage.messageMetadata?.direction,
        }
      : null,
    unreadCount,
  };
}

export function buildWhatsAppConversationDefaults({ accountId, contactId, totalMessages, lastMessage }: BuildConversationDefaultsInput) {
  return {
    accountId,
    contactId,
    status: 'open' as const,
    priority: 'medium' as const,
    totalMessages,
    lastMessageAt: lastMessage?.createdAt ? new Date(lastMessage.createdAt) : undefined,
    lastMessageType: lastMessage
      ? lastMessage.messageMetadata?.direction === 'outbound'
        ? ('outgoing' as const)
        : ('incoming' as const)
      : undefined,
  };
}
