export interface InboxChannelSummary {
  _id: string;
  name: string;
  channelType: string;
  isActive?: boolean;
  lastSyncAt?: string;
  config?: {
    phoneNumber?: string;
    email?: string;
    websiteUrl?: string;
  };
}

export interface InboxContactSummary {
  _id?: string;
  name?: string;
  phone?: string;
  email?: string;
}

export interface InboxUserSummary {
  _id?: string;
  id?: string;
  name?: string;
  email?: string;
  image?: string;
}

export interface InboxConversationRecord {
  _id: string;
  channelId?: InboxChannelSummary | null;
  contactId?: InboxContactSummary | null;
  assignedToId?: InboxUserSummary | null;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  totalMessages: number;
  lastMessageAt?: string;
  lastMessageType?: 'incoming' | 'outgoing';
  firstResponseTime?: number;
  averageResponseTime?: number;
  labels?: string[];
  internalNotes?: string;
  csatRating?: number;
  metadata?: {
    phoneNumber?: string;
    email?: string;
    subject?: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
    sentimentScore?: number;
    emotions?: string[];
    [key: string]: unknown;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface InboxMessageRecord {
  _id: string;
  direction: 'inbound' | 'outbound';
  messageType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'note' | 'template';
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  fileName?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  isNote?: boolean;
  noteAuthorName?: string;
  createdAt: string;
}
