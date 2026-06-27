import { Types } from 'mongoose';

export const DEFAULT_CHATBOT_MODEL = 'gpt-4o';

export interface CreateChatbotInput {
  name: string;
  type?: string;
  aiModel?: string;
  systemPrompt?: string;
  knowledgeBaseIds?: string[];
  autoTransferToHuman?: boolean;
  preChatFormEnabled?: boolean;
  primaryColor?: string;
  icon?: string;
  formIds?: string[];
  websiteUrl?: string;
  websiteUrls?: string[];
  greeting?: string;
  placeholder?: string;
  widgetPosition?: 'bottom-right' | 'bottom-left';
  handoffTriggers?: string[];
  handoffConfidenceThreshold?: number;
  schedule?: {
    enabled: boolean;
    timezone: string;
    offlineMessage?: string;
    offlineCollectEmail?: boolean;
    hours: Array<{ day: 0 | 1 | 2 | 3 | 4 | 5 | 6; open: string; close: string }>;
  };
  messageCap?: number;
}

export interface CreateChatbotPayload {
  name: string;
  channelType: 'website';
  config: {
    widgetToken: string;
    deploymentStatus: 'draft' | 'staging' | 'live';
    aiModel: string;
    systemPrompt: string;
    knowledgeBaseIds: Types.ObjectId[];
    formIds: Types.ObjectId[];
    autoTransferToHuman: boolean;
    preChatFormEnabled: boolean;
    chatbotType: string;
    primaryColor: string;
    icon?: string;
    websiteUrl?: string;
    websiteUrls: string[];
    greeting: string;
    placeholder: string;
    widgetPosition: 'bottom-right' | 'bottom-left';
    handoffTriggers: string[];
    handoffConfidenceThreshold: number;
    messageCap?: number;
  };
  isActive: true;
  createdById: Types.ObjectId;
}

export interface UpdateChatbotConfigInput {
  widgetToken?: string;
  deploymentStatus?: 'draft' | 'staging' | 'live';
  knowledgeBaseIds?: string[];
  aiModel?: string;
  systemPrompt?: string;
  autoTransferToHuman?: boolean;
  preChatFormEnabled?: boolean;
  primaryColor?: string;
  type?: string;
  icon?: string;
  formIds?: string[];
  websiteUrl?: string;
  websiteUrls?: string[];
  greeting?: string;
  placeholder?: string;
  widgetPosition?: 'bottom-right' | 'bottom-left';
  handoffTriggers?: string[];
  handoffConfidenceThreshold?: number;
  messageCap?: number;
  schedule?: {
    enabled: boolean;
    timezone: string;
    offlineMessage?: string;
    offlineCollectEmail?: boolean;
    hours: Array<{ day: 0 | 1 | 2 | 3 | 4 | 5 | 6; open: string; close: string }>;
  };
}

export function buildChatbotWidgetToken(now = Date.now(), random = Math.random()): string {
  return `wgt_${now}_${random.toString(36).slice(2, 11)}`;
}

export function normalizeChatbotType(type?: string): string {
  if (!type) return 'Support';

  const normalized = type
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return normalized || 'Support';
}

export function buildChatbotConfig(input: UpdateChatbotConfigInput, widgetToken: string) {
  const rawUrls = input.websiteUrls ?? (input.websiteUrl ? [input.websiteUrl] : []);
  const websiteUrls = rawUrls.map((u) => u.trim()).filter(Boolean);
  return {
    widgetToken,
    deploymentStatus: input.deploymentStatus || 'live',
    aiModel: input.aiModel || DEFAULT_CHATBOT_MODEL,
    systemPrompt: input.systemPrompt || '',
    knowledgeBaseIds: (input.knowledgeBaseIds || []).map((id) => new Types.ObjectId(id)),
    formIds: (input.formIds || []).map((id) => new Types.ObjectId(id)),
    autoTransferToHuman: input.autoTransferToHuman !== false,
    preChatFormEnabled: input.preChatFormEnabled === true,
    chatbotType: (input.type || 'support').toLowerCase(),
    primaryColor: input.primaryColor || '#3B82F6',
    icon: input.icon || '',
    websiteUrl: websiteUrls[0] || '',
    websiteUrls,
    greeting: input.greeting || 'Hi! How can I help you today?',
    placeholder: input.placeholder || 'Type your message...',
    widgetPosition: input.widgetPosition || 'bottom-right',
    handoffTriggers: input.handoffTriggers || [],
    handoffConfidenceThreshold: input.handoffConfidenceThreshold ?? 0.4,
    messageCap: input.messageCap,
    schedule: input.schedule,
  };
}

export function buildChatbotEmbedSnippet(params: {
  baseUrl: string;
  widgetToken: string;
  primaryColor?: string;
  position?: 'bottom-right' | 'bottom-left';
  greeting?: string;
  placeholder?: string;
}): string {
  const {
    baseUrl,
    widgetToken,
    primaryColor = '#3B82F6',
    position = 'bottom-right',
    greeting = 'Hi! How can I help you today?',
    placeholder = 'Type your message...',
  } = params;

  return `<script defer src="${baseUrl}/socket.io/socket.io.js"></script>
<script>
  window.MontrAIConfig = {
    baseUrl: "${baseUrl}",
    widgetToken: "${widgetToken}",
    position: "${position}",
    primaryColor: "${primaryColor}",
    greeting: "${greeting}",
    placeholder: "${placeholder}",
    showLauncher: true
  };
</script>
<script defer src="${baseUrl}/chatbot-widget.js"></script>`;
}

export function buildCreateChatbotPayload(
  input: CreateChatbotInput,
  createdById: string,
  widgetToken = buildChatbotWidgetToken(),
): CreateChatbotPayload {
  const trimmedName = input.name.trim();

  if (!trimmedName) {
    throw new Error('Chatbot name is required');
  }

  return {
    name: trimmedName,
    channelType: 'website',
    config: buildChatbotConfig(input, widgetToken),
    isActive: true,
    createdById: new Types.ObjectId(createdById),
  };
}
