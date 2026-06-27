
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Copy,
  Database,
  FileText,
  Globe,
  Loader2,
  Palette,
  ShieldCheck,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import useSWR from 'swr';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';

import { AIBotsShell } from '@/components/ai-bots/ai-bots-shell';
import { BotConversationsTab } from '@/components/ai-bots/bot-conversations-tab';
import { BotStatsTab } from '@/components/ai-bots/bot-stats-tab';
import { ChatbotPreviewPanel } from '@/components/ai-bots/chatbot-preview-panel';
import { useAppHeader } from '@/components/app-header';
import {
  Banner,
  Button,
  Chip,
  CopyField,
  Field,
  Input,
  Select,
  SettingRow,
  Tabs as KitTabs,
  Textarea,
} from '@/components/ui-kit';
import { Button as ShadcnButton } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ModelSelector } from '@/components/nodes/model-selector';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import {
  buildChatbotConfig,
  buildChatbotEmbedSnippet,
  DEFAULT_CHATBOT_MODEL,
  normalizeChatbotType,
} from '@/lib/inbox/chatbots';
import { cn } from '@/lib/utils';
import styles from './ai-bots.module.css';

interface ChatbotRecord {
  _id: string;
  name: string;
  isActive: boolean;
  config?: {
    widgetToken?: string;
    stagingWidgetToken?: string;
    deploymentStatus?: 'draft' | 'staging' | 'live';
    aiModel?: string;
    systemPrompt?: string;
    knowledgeBaseIds?: string[];
    formIds?: string[];
    chatbotType?: string;
    primaryColor?: string;
    autoTransferToHuman?: boolean;
    preChatFormEnabled?: boolean;
    icon?: string;
    websiteUrl?: string;
    websiteUrls?: string[];
    greeting?: string;
    placeholder?: string;
    widgetPosition?: 'bottom-right' | 'bottom-left';
    handoffTriggers?: string[];
    messageCap?: number;
    schedule?: {
      enabled: boolean;
      timezone: string;
      offlineMessage?: string;
    };
  };
}

interface ChatbotEditorPageProps {
  chatbotId?: string;
}

interface DocumentRecord {
  _id: string;
  title: string;
}

interface FormRecord {
  _id: string;
  title: string;
  isPublished?: boolean;
}
interface ChatbotFormState {
  name: string;
  type: string;
  aiModel: string;
  systemPrompt: string;
  knowledgeBaseIds: string[];
  formIds: string[];
  autoTransferToHuman: boolean;
  preChatFormEnabled: boolean;
  primaryColor: string;
  icon: string;
  websiteUrls: string;
  greeting: string;
  placeholder: string;
  widgetPosition: 'bottom-right' | 'bottom-left';
  handoffTriggers: string;
  scheduleEnabled: boolean;
  scheduleTimezone: string;
  scheduleOfflineMessage: string;
  messageCap: string;
}

const chatbotTypes = [
  {
    value: 'Support',
    description: 'Help customers resolve support questions with quick answers and escalation rules.',
  },
  {
    value: 'Lead Generation',
    description: 'Qualify visitors, collect intent, and route high-value opportunities to sales.',
  },
  {
    value: 'FAQ',
    description: 'Answer common product, pricing, and onboarding questions from one knowledge base.',
  },
  {
    value: 'Custom',
    description: 'Use a custom prompt, handoff rules, and brand voice for specialized conversations.',
  },
];

const chatbotEmbedPlatformGuides = [
  {
    value: 'html',
    label: 'HTML',
    placement: 'Paste the script right before </body> in your page HTML.',
    detail: 'Best for static sites and server-rendered pages where you control the final markup.',
  },
  {
    value: 'react',
    label: 'React',
    placement: 'Put the script in the app shell HTML, usually public/index.html, before </body>.',
    detail: 'Avoid mounting it inside frequently re-rendered React components.',
  },
  {
    value: 'wordpress',
    label: 'WordPress',
    placement: 'Add it in a Custom HTML block, footer injection plugin, or footer.php before </body>.',
    detail: 'Prefer the global footer or site-wide code injection area over per-widget script injection.',
  },
  {
    value: 'framer',
    label: 'Framer',
    placement: 'Add it in Site Settings -> Custom Code -> End of body.',
    detail: 'That ensures the widget loads once across the published site.',
  },
  {
    value: 'php',
    label: 'PHP',
    placement: 'Paste it into your shared footer template, just before </body>.',
    detail: 'Works for Laravel, Core PHP, CodeIgniter, and similar server-rendered stacks.',
  },
  {
    value: 'python',
    label: 'Python',
    placement: 'Add it to the base template before </body>, such as Django base.html or a Flask layout.',
    detail: 'Keep it in the shared layout so the widget appears everywhere it should support chat.',
  },
];

const initialFormState: ChatbotFormState = {
  name: '',
  type: 'Support',
  aiModel: '',
  systemPrompt: '',
  knowledgeBaseIds: [],
  formIds: [],
  autoTransferToHuman: true,
  preChatFormEnabled: false,
  primaryColor: '#3B82F6',
  icon: 'AI',
  websiteUrls: '',
  greeting: 'Hi! How can I help you today?',
  placeholder: 'Type your message...',
  widgetPosition: 'bottom-right',
  handoffTriggers: '',
  scheduleEnabled: false,
  scheduleTimezone: 'UTC',
  scheduleOfflineMessage: "We're currently offline. Leave a message and we'll get back to you.",
  messageCap: '',
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function PlatformPlacementSection() {
  return (
    <section className={cn('app-glass', styles.panel)}>
      <div className="flex items-start gap-3">
        <Palette className="mt-0.5 size-5 text-muted-foreground" />
        <div>
          <h3 className={styles.sectionTitle}>Where to place it</h3>
          <p className={styles.sectionText}>
            The script stays the same. Only the page template changes.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {chatbotEmbedPlatformGuides.map((platform) => (
          <Chip key={platform.value} tone="gray" className="uppercase tracking-[0.16em]">
            {platform.label}
          </Chip>
        ))}
      </div>

      <Accordion type="single" collapsible className="mt-4 w-full">
        {chatbotEmbedPlatformGuides.map((platform) => (
          <AccordionItem key={platform.value} value={platform.value}>
            <AccordionTrigger>{platform.label}</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{platform.placement}</p>
                <p>{platform.detail}</p>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function WhatLoadsSection() {
  return (
    <section className={cn('app-glass', styles.panel)}>
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 text-emerald-500" />
        <div>
          <h3 className={styles.sectionTitle}>What loads</h3>
          <p className={styles.sectionText}>
            The script injects the token, applies the brand color, and mounts the public widget.
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Use the exact snippet shown above.
          </p>
        </div>
      </div>
    </section>
  );
}

export function ChatbotEditorPage({ chatbotId }: ChatbotEditorPageProps) {
  const { replace } = useRouter();
  const { setHeaderInfo } = useAppHeader();
  const { toast } = useToast();
  const [chatbot, setChatbot] = useState<ChatbotRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(chatbotId));
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [origin, setOrigin] = useState('');
  const [editorTab, setEditorTab] = useState('settings');
  const [formData, setFormData] = useState<ChatbotFormState>(initialFormState);

  const { data: docsResponse } = useSWR<{ documents: DocumentRecord[] }>('/api/v2/documents', fetcher);
  const { data: formsResponse } = useSWR<FormRecord[]>('/api/v2/forms', fetcher);

  const isEditing = Boolean(chatbotId);

  const loadChatbot = useCallback(async () => {
    if (!chatbotId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/inbox/channels/${chatbotId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load chatbot');
      }

      const loadedChatbot = data.channel as ChatbotRecord;
      setChatbot(loadedChatbot);
      const urls: string[] = loadedChatbot.config?.websiteUrls?.length
        ? loadedChatbot.config.websiteUrls
        : loadedChatbot.config?.websiteUrl
          ? [loadedChatbot.config.websiteUrl]
          : [];

      setFormData({
        name: loadedChatbot.name,
        type: normalizeChatbotType(loadedChatbot.config?.chatbotType),
        aiModel: loadedChatbot.config?.aiModel || DEFAULT_CHATBOT_MODEL,
        systemPrompt: loadedChatbot.config?.systemPrompt || '',
        knowledgeBaseIds: loadedChatbot.config?.knowledgeBaseIds || [],
        formIds: loadedChatbot.config?.formIds || [],
        autoTransferToHuman: loadedChatbot.config?.autoTransferToHuman !== false,
        preChatFormEnabled: loadedChatbot.config?.preChatFormEnabled === true,
        primaryColor: loadedChatbot.config?.primaryColor || '#3B82F6',
        icon: loadedChatbot.config?.icon || 'AI',
        websiteUrls: urls.join('\n'),
        greeting: loadedChatbot.config?.greeting || 'Hi! How can I help you today?',
        placeholder: loadedChatbot.config?.placeholder || 'Type your message...',
        widgetPosition: (loadedChatbot.config?.widgetPosition as 'bottom-right' | 'bottom-left') || 'bottom-right',
        handoffTriggers: (loadedChatbot.config?.handoffTriggers || []).join(', '),
        scheduleEnabled: loadedChatbot.config?.schedule?.enabled || false,
        scheduleTimezone: loadedChatbot.config?.schedule?.timezone || 'UTC',
        scheduleOfflineMessage: loadedChatbot.config?.schedule?.offlineMessage || "We're currently offline. Leave a message and we'll get back to you.",
        messageCap: loadedChatbot.config?.messageCap ? String(loadedChatbot.config.messageCap) : '',
      });
    } catch (error) {
      console.error('Error loading chatbot:', error);
      toast({
        variant: 'destructive',
        title: "Couldn't load bot",
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  }, [chatbotId, toast]);

  useEffect(() => {
    if (chatbotId) {
      void loadChatbot();
    }
  }, [chatbotId, loadChatbot]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);

      const response = await fetch(
        isEditing && chatbotId ? `/api/inbox/channels/${chatbotId}` : '/api/inbox/chatbots',
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isEditing && chatbot
              ? {
                  name: formData.name,
                  config: buildChatbotConfig(
                    {
                      ...formData,
                      websiteUrls: formData.websiteUrls.split('\n').map((u) => u.trim()).filter(Boolean),
                      handoffTriggers: formData.handoffTriggers.split(',').map((t) => t.trim()).filter(Boolean),
                      messageCap: formData.messageCap ? Number(formData.messageCap) : undefined,
                    },
                    chatbot.config?.widgetToken || '',
                  ),
                }
              : {
                  ...formData,
                  websiteUrls: formData.websiteUrls.split('\n').map((u) => u.trim()).filter(Boolean),
                  handoffTriggers: formData.handoffTriggers.split(',').map((t) => t.trim()).filter(Boolean),
                  messageCap: formData.messageCap ? Number(formData.messageCap) : undefined,
                },
          ),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save chatbot');
      }

      const savedChatbot = (data.chatbot || data.channel) as ChatbotRecord;

      toast({
        title: 'Saved',
        description: savedChatbot.name,
      });

      if (isEditing) {
        setChatbot(savedChatbot);
      } else {
        replace(`/ai-bots/${savedChatbot._id}`);
      }
    } catch (error) {
      console.error('Error saving chatbot:', error);
      toast({
        variant: 'destructive',
        title: "Couldn't save",
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setSaving(false);
    }
  }, [chatbot, chatbotId, formData, isEditing, replace, toast]);

  useEffect(() => {
    setHeaderInfo({
      type: 'page',
      title: isEditing ? chatbot?.name || 'Bot' : 'New bot',
      description: isEditing ? 'Website bot settings' : 'Create a website bot',
      backHref: '/ai-bots',
      actions: (
        <Button variant="brand" onClick={handleSave} disabled={saving || !formData.name.trim()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save
        </Button>
      ),
    });

    return () => {
      setHeaderInfo(null);
    };
  }, [chatbot?.name, formData.name, handleSave, isEditing, saving, setHeaderInfo]);

  const embedSnippet = useMemo(() => {
    if (!chatbot?.config?.widgetToken || !origin) return '';

    return buildChatbotEmbedSnippet({
      baseUrl: origin,
      widgetToken: chatbot.config.widgetToken,
      primaryColor: chatbot.config?.primaryColor || formData.primaryColor || '#3B82F6',
      greeting: chatbot.config?.greeting || formData.greeting,
      placeholder: chatbot.config?.placeholder || formData.placeholder,
      position: (chatbot.config?.widgetPosition as 'bottom-right' | 'bottom-left') || formData.widgetPosition,
    });
  }, [
    chatbot?.config?.widgetToken,
    chatbot?.config?.primaryColor,
    chatbot?.config?.greeting,
    chatbot?.config?.placeholder,
    chatbot?.config?.widgetPosition,
    formData.primaryColor,
    formData.greeting,
    formData.placeholder,
    formData.widgetPosition,
    origin,
  ]);

  const shellStats = useMemo(
    () => [
      { label: 'Bot type', value: formData.type, tone: 'blue' as const },
      { label: 'Knowledge docs', value: String(formData.knowledgeBaseIds.length), tone: 'violet' as const },
      { label: 'Connected forms', value: String(formData.formIds.length), tone: 'emerald' as const },
      {
        label: 'Deploy state',
        value: isEditing ? (chatbot?.isActive ? 'Active' : 'Draft') : 'Draft',
        tone: 'amber' as const,
      },
    ],
    [chatbot?.isActive, formData.formIds.length, formData.knowledgeBaseIds.length, formData.type, isEditing],
  );

  async function handleCopyEmbedSnippet() {
    if (!embedSnippet) return;

    try {
      setCopying(true);
      await navigator.clipboard.writeText(embedSnippet);
      toast({
        title: 'Saved',
        description: 'Script copied',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: "Couldn't copy",
        description: 'Try again',
      });
    } finally {
      setCopying(false);
    }
  }

  return (
    <AIBotsShell
      title={isEditing ? chatbot?.name || 'Bot' : 'New bot'}
      description={
        isEditing
          ? 'Edit bot settings, sources, and embed details.'
          : 'Set the bot role, connect sources, and generate the site script.'
      }
      badge={isEditing ? 'Website bot' : 'Draft'}
      stats={shellStats}
    >
      {loading ? (
        <div className={cn('app-glass', styles.panel, 'flex h-64 items-center justify-center')}>
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {isEditing && chatbot && (
            <div className="mb-6 w-full">
              <KitTabs
                value={editorTab}
                onChange={setEditorTab}
                tabs={[
                  { value: 'settings', label: 'Settings' },
                  { value: 'conversations', label: 'Conversations' },
                  { value: 'stats', label: 'Analytics' },
                ]}
              />

              {editorTab === 'conversations' && (
                <div className="mt-6">
                  <BotConversationsTab botId={chatbot._id} />
                </div>
              )}

              {editorTab === 'stats' && (
                <div className="mt-6">
                  <BotStatsTab botId={chatbot._id} />
                </div>
              )}
            </div>
          )}

          {(!isEditing || !chatbot || editorTab === 'settings') && (
            <div className={styles.editorGrid}>
          <div className={styles.stack}>
            <section className={cn('app-glass', styles.panel)}>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className={styles.metaPill}>
                    <Sparkles className="size-3.5" />
                    Identity
                  </div>
                  <h2 className={cn(styles.sectionTitle, 'mt-4 text-[22px] tracking-[-0.04em]')}>
                    Bot setup
                  </h2>
                  <p className={cn(styles.sectionText, 'max-w-2xl')}>
                    Set the role, allowed domain, and handoff rules before you publish.
                  </p>
                </div>

                <div className={styles.previewCard}>
                  <div
                    className={styles.previewIcon}
                    style={{ backgroundColor: `${formData.primaryColor}1A`, color: formData.primaryColor }}
                  >
                    {formData.icon || 'AI'}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {formData.name.trim() || 'Untitled bot'}
                    </div>
                    <div className="truncate text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      {formData.type}
                    </div>
                  </div>
                </div>
              </div>

              <div className={cn(styles.fieldGrid, 'mt-6')}>
                <div>
                  <label className="mb-3 block text-sm font-medium text-foreground">Bot type</label>
                  <div className={styles.typeGrid}>
                    {chatbotTypes.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setFormData((current) => ({ ...current, type: type.value }))}
                        className={cn(
                          styles.typeCard,
                          formData.type === type.value && styles.typeCardActive,
                        )}
                      >
                        <div className="font-medium text-foreground">{type.value}</div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">{type.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.fieldRow}>
                  <Field label="Icon">
                    <Popover>
                      <PopoverTrigger asChild>
                        <ShadcnButton
                          variant="outline"
                          className="size-14 rounded-2xl border-border/70 bg-background/85 p-0 text-xl shadow-sm"
                        >
                          {formData.icon || 'AI'}
                        </ShadcnButton>
                      </PopoverTrigger>
                      <PopoverContent className="w-full border-0 p-0" align="start">
                        <EmojiPicker
                          onEmojiClick={(event: EmojiClickData) => setFormData((current) => ({ ...current, icon: event.emoji }))}
                          searchDisabled
                          skinTonesDisabled
                          height={350}
                          width={320}
                        />
                      </PopoverContent>
                    </Popover>
                  </Field>

                  <Field label="Bot name" className="min-w-0">
                    <Input
                      value={formData.name}
                      onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                      placeholder="e.g. Support bot"
                      className="h-14"
                      wrapClassName="h-14 rounded-2xl"
                    />
                  </Field>

                  <Field label="Color">
                    <input
                      title="Primary Color"
                      aria-label="Primary Color"
                      type="color"
                      value={formData.primaryColor}
                      onChange={(event) => setFormData((current) => ({ ...current, primaryColor: event.target.value }))}
                      className="size-14 cursor-pointer overflow-hidden rounded-2xl border border-border/70 bg-background/85 p-0 shadow-sm transition [&::-moz-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-2xl [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-2xl"
                    />
                  </Field>
                </div>

                <Field
                  label={
                    <span className="flex items-center gap-2">
                      <Globe className="size-4 text-muted-foreground" />
                      Allowed domains
                    </span>
                  }
                  hint="One domain per line. Only these domains can load the widget. Leave empty to allow any domain."
                >
                  <Textarea
                    value={formData.websiteUrls}
                    onChange={(event) => setFormData((current) => ({ ...current, websiteUrls: event.target.value }))}
                    placeholder={'https://yoursite.com\nhttps://staging.yoursite.com'}
                    className="min-h-[80px] font-mono"
                    wrapClassName="rounded-2xl"
                  />
                </Field>
              </div>
            </section>

            <section className={cn('app-glass', styles.panel)}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className={styles.sectionTitle}>Model and sources</h2>
                  <p className={styles.sectionText}>
                    Pick the model and connect the sources the bot can use.
                  </p>
                </div>
                <div className={styles.metaPill}>
                  Shared models
                </div>
              </div>

              <div className={cn(styles.fieldGrid, 'mt-5')}>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="block text-sm font-medium text-foreground">AI model</label>
                    <span className="text-xs text-muted-foreground">Shared with AI Studio</span>
                  </div>
                  <ModelSelector
                    value={formData.aiModel}
                    onValueChange={(value: string) => {
                      setFormData((current) => ({ ...current, aiModel: value }));
                    }}
                    modelType="text"
                    triggerClassName="h-14 rounded-2xl border-border/70 bg-background/90 px-4 text-left shadow-sm"
                  />
                </div>

                <div className={styles.paneGrid}>
                  <div className={styles.pane}>
                    <label className="mb-3 flex items-center justify-between gap-3 text-sm font-medium text-foreground">
                      <span>Docs</span>
                      <span className="text-xs text-muted-foreground">{formData.knowledgeBaseIds.length} selected</span>
                    </label>
                    <div className={styles.scrollList}>
                      {docsResponse?.documents && docsResponse.documents.length > 0 ? (
                        docsResponse.documents.map((doc) => (
                          <label
                            key={doc._id}
                            className={styles.checkRow}
                          >
                            <Checkbox
                              checked={formData.knowledgeBaseIds.includes(doc._id)}
                              onCheckedChange={(checked) => {
                                setFormData((current) => ({
                                  ...current,
                                  knowledgeBaseIds: checked
                                    ? [...current.knowledgeBaseIds, doc._id]
                                    : current.knowledgeBaseIds.filter((id) => id !== doc._id),
                                }));
                              }}
                            />
                            <FileText className="size-4 shrink-0 text-foreground/50" />
                            <span className="min-w-0 truncate text-sm font-medium text-foreground">{doc.title}</span>
                          </label>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border/70 bg-background/50 px-4 py-8 text-center text-sm text-muted-foreground">
                          No documents available.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.pane}>
                    <label className="mb-3 flex items-center justify-between gap-3 text-sm font-medium text-foreground">
                      <span>Forms</span>
                      <span className="text-xs text-muted-foreground">{formData.formIds.length} selected</span>
                    </label>
                    <div className={styles.scrollList}>
                      {formsResponse && formsResponse.length > 0 ? (
                        formsResponse.map((form) => (
                          <label
                            key={form._id}
                            className={styles.checkRow}
                          >
                            <Checkbox
                              checked={formData.formIds.includes(form._id)}
                              onCheckedChange={(checked) => {
                                setFormData((current) => ({
                                  ...current,
                                  formIds: checked
                                    ? [...current.formIds, form._id]
                                    : current.formIds.filter((id) => id !== form._id),
                                }));
                              }}
                            />
                            <Database className="size-4 shrink-0 text-foreground/50" />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{form.title}</span>
                            {!form.isPublished ? (
                              <Chip tone="gray" className="ml-auto h-[18px] text-[10px]">
                                Draft
                              </Chip>
                            ) : null}
                          </label>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border/70 bg-background/50 px-4 py-8 text-center text-sm text-muted-foreground">
                          No forms available.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className={cn('app-glass', styles.panel)}>
              <div className="flex items-start gap-3">
                <MessageSquare className="mt-0.5 size-5 text-brand" />
                <div>
                  <h2 className={styles.sectionTitle}>Bot behaviour</h2>
                  <p className={styles.sectionText}>
                    Override the default system prompt with a custom instruction set.
                  </p>
                </div>
              </div>

              <Field
                className="mt-5"
                label={
                  <>
                    System prompt
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (overrides default for the selected bot type)
                    </span>
                  </>
                }
                hint="Leave empty to use the default prompt for the selected bot type."
              >
                <Textarea
                  value={formData.systemPrompt}
                  onChange={(event) => setFormData((current) => ({ ...current, systemPrompt: event.target.value }))}
                  placeholder={`e.g. You are Aria, a friendly support assistant for Acme Inc. Only answer questions related to our product. Always be concise and professional.`}
                  className="min-h-[140px] leading-6"
                  wrapClassName="rounded-2xl"
                />
              </Field>
            </section>

            <section className={cn('app-glass', styles.panel)}>
              <div className="flex items-start gap-3">
                <Palette className="mt-0.5 size-5 text-muted-foreground" />
                <div>
                  <h2 className={styles.sectionTitle}>Widget appearance</h2>
                  <p className={styles.sectionText}>
                    Customise the greeting, input placeholder, and launcher position.
                  </p>
                </div>
              </div>

              <div className={cn(styles.fieldGrid, 'mt-5')}>
                <Field label="Greeting message">
                  <Input
                    value={formData.greeting}
                    onChange={(event) => setFormData((current) => ({ ...current, greeting: event.target.value }))}
                    placeholder="Hi! How can I help you today?"
                    className="h-12"
                    wrapClassName="h-12 rounded-2xl"
                  />
                </Field>

                <Field label="Input placeholder">
                  <Input
                    value={formData.placeholder}
                    onChange={(event) => setFormData((current) => ({ ...current, placeholder: event.target.value }))}
                    placeholder="Type your message..."
                    className="h-12"
                    wrapClassName="h-12 rounded-2xl"
                  />
                </Field>

                <Field label="Launcher position">
                  <Select
                    value={formData.widgetPosition}
                    onChange={(value) =>
                      setFormData((current) => ({ ...current, widgetPosition: value as 'bottom-right' | 'bottom-left' }))
                    }
                    triggerClassName="h-12 rounded-2xl"
                    options={[
                      { value: 'bottom-right', label: 'Bottom right' },
                      { value: 'bottom-left', label: 'Bottom left' },
                    ]}
                  />
                </Field>
              </div>
            </section>

            <section className={cn('app-glass', styles.panel)}>
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-5 text-foreground/60" />
                <div>
                  <h2 className={styles.sectionTitle}>Conversation controls</h2>
                  <p className={styles.sectionText}>
                    Choose how the bot hands off and what it asks before chat starts.
                  </p>
                </div>
              </div>

              <div className={cn(styles.controlGrid, 'mt-5')}>
                <div className={styles.toggleCard}>
                  <SettingRow
                    className="w-full py-0"
                    label="Auto-transfer to human"
                    description="Move to a human when the bot cannot answer."
                  >
                    <Switch
                      checked={formData.autoTransferToHuman}
                      onCheckedChange={(checked) =>
                        setFormData((current) => ({ ...current, autoTransferToHuman: checked }))
                      }
                    />
                  </SettingRow>
                </div>

                <div className={styles.toggleCard}>
                  <SettingRow
                    className="w-full py-0"
                    label="Pre-chat form"
                    description="Collect details before chat starts."
                  >
                    <Switch
                      checked={formData.preChatFormEnabled}
                      onCheckedChange={(checked) =>
                        setFormData((current) => ({ ...current, preChatFormEnabled: checked }))
                      }
                    />
                  </SettingRow>
                </div>
              </div>

              <div className={cn(styles.fieldGrid, 'mt-5')}>
                <Field
                  label={
                    <>
                      Handoff trigger keywords
                      <span className="ml-2 text-xs font-normal text-muted-foreground">comma-separated</span>
                    </>
                  }
                  hint="When a visitor's message contains one of these keywords, the bot triggers a handoff immediately."
                >
                  <Input
                    value={formData.handoffTriggers}
                    onChange={(event) => setFormData((current) => ({ ...current, handoffTriggers: event.target.value }))}
                    placeholder="talk to human, agent, escalate, real person"
                    className="h-12"
                    wrapClassName="h-12 rounded-2xl"
                  />
                </Field>

                <Field
                  label="Daily message cap"
                  hint="Max AI-generated replies per day across all visitors. Resets at midnight UTC."
                >
                  <Input
                    type="number"
                    min={0}
                    value={formData.messageCap}
                    onChange={(event) => setFormData((current) => ({ ...current, messageCap: event.target.value }))}
                    placeholder="e.g. 1000 (leave empty for unlimited)"
                    className="h-12"
                    wrapClassName="h-12 rounded-2xl"
                  />
                </Field>

                <Field
                  label="Offline message"
                  hint="Shown to visitors when the bot is unavailable due to operating hours."
                >
                  <Textarea
                    value={formData.scheduleOfflineMessage}
                    onChange={(event) => setFormData((current) => ({ ...current, scheduleOfflineMessage: event.target.value }))}
                    className="min-h-[80px]"
                    wrapClassName="rounded-2xl"
                  />
                </Field>
              </div>

              <div className="mt-5 flex justify-end">
                <Button variant="brand" onClick={handleSave} disabled={saving || !formData.name.trim()}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </section>
          </div>

          <aside className={cn(styles.stack, styles.asideSticky)}>
            {isEditing && chatbot?.config?.widgetToken && (
              <section className={cn('app-glass', styles.panel)}>
                <h3 className={cn(styles.sectionTitle, 'mb-4')}>Live preview</h3>
                <ChatbotPreviewPanel
                  widgetToken={chatbot.config.widgetToken}
                  primaryColor={formData.primaryColor}
                  botName={formData.name || 'Bot'}
                  botIcon={formData.icon}
                  greeting={formData.greeting}
                  placeholder={formData.placeholder}
                />
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Test mode — messages are processed by the live AI but sessions are not visible to visitors.
                </p>
              </section>
            )}

            <section className={cn('app-glass', styles.panel)}>
              <div className="flex items-start gap-3">
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border/60 text-lg"
                  style={{ backgroundColor: `${formData.primaryColor}1A`, color: formData.primaryColor }}
                >
                  {formData.icon || 'AI'}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-foreground">Website embed</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isEditing
                      ? 'Copy the token and site script when the bot is ready.'
                      : 'Save the bot to generate the token and script.'}
                  </p>
                </div>
              </div>

              {isEditing && chatbot?.config?.widgetToken ? (
                <div className="mt-5 space-y-4">
                  <div>
                    <Chip
                      dot
                      tone={
                        chatbot.config.deploymentStatus === 'live'
                          ? 'ok'
                          : chatbot.config.deploymentStatus === 'staging'
                            ? 'warn'
                            : 'gray'
                      }
                      className="uppercase tracking-[0.16em]"
                    >
                      {chatbot.config.deploymentStatus || 'live'}
                    </Chip>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live token</div>
                    <CopyField value={chatbot.config.widgetToken} secret />
                  </div>
                  {chatbot.config.stagingWidgetToken ? (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">Staging token</div>
                      <CopyField value={chatbot.config.stagingWidgetToken} secret />
                      <p className="text-xs text-muted-foreground">Use this token to test the bot internally without affecting live traffic.</p>
                    </div>
                  ) : null}

                  <div className={styles.codeBlock}>
                    <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap p-4 text-xs leading-6 text-foreground">
                      {embedSnippet}
                    </pre>
                  </div>

                  <Button
                    variant="outline"
                    icon={copying ? undefined : Copy}
                    className="w-full"
                    onClick={handleCopyEmbedSnippet}
                    disabled={copying || !embedSnippet}
                  >
                    {copying ? <Loader2 className="size-4 animate-spin" /> : null}
                    Copy script
                  </Button>
                </div>
              ) : (
                <Banner tone="info" className="mt-5">
                  The token and script show up after you save.
                </Banner>
              )}
            </section>

            <PlatformPlacementSection />

            <WhatLoadsSection />
          </aside>
          </div>
          )}
        </>
      )}
    </AIBotsShell>
  );
}


