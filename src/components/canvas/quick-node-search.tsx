'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search, Zap, Clock, Play, Database, FileText, Image as ImageIcon, Globe,
  Youtube, Mic, MessageSquare, Sparkles, Video, Send, Mail, Share2,
  GitBranch, Timer, Repeat, Instagram, StickyNote, Phone,
  AtSign, Eye, Facebook, Building2, FileSpreadsheet, Bot,
  BotMessageSquare, Route, AudioLines, MessageCircle,
  Magnet, Table2, Briefcase, BookOpen, Target, BarChart3, CreditCard, UserPlus,
  Workflow, ShoppingBag, PenSquare,
  UserCog, BriefcaseBusiness, MoveRight, UserCheck, Tag, Tags, CalendarPlus,
  CheckSquare, SearchCheck, Trash2,
} from 'lucide-react';
import { WhatsAppLogo, LinkedinLogo, XLogo, RedditLogo, PinterestLogo, TelegramLogo } from '@/components/social-icons';

// Flat list of all nodes for quick search
const ALL_NODES = [
  // Triggers
  { type: 'triggerWebhook', icon: Zap, label: 'Webhook Trigger', cat: 'Trigger' },
  { type: 'triggerSchedule', icon: Clock, label: 'Schedule Trigger', cat: 'Trigger' },
  { type: 'triggerManual', icon: Play, label: 'Manual Trigger', cat: 'Trigger' },
  { type: 'triggerWhatsApp', icon: Phone, label: 'WhatsApp Trigger', cat: 'Trigger' },
  { type: 'triggerEmail', icon: Mail, label: 'Email Trigger', cat: 'Trigger' },
  { type: 'triggerSocial', icon: AtSign, label: 'Social Trigger', cat: 'Trigger' },
  { type: 'triggerKeyword', icon: Eye, label: 'Keyword Monitor', cat: 'Trigger' },
  { type: 'triggerTelegram', icon: TelegramLogo, label: 'Telegram Trigger', cat: 'Trigger' },
  { type: 'triggerIntegrationWebhook', icon: Zap, label: 'Integration Event (Shopify/RevenueCat/Calendly/Stripe)', cat: 'Trigger' },
  { type: 'triggerAdLead', icon: UserPlus, label: 'Ad Lead Captured', cat: 'Trigger' },
  // Data
  { type: 'textInput', icon: FileText, label: 'Text Input', cat: 'Data' },
  { type: 'imageNode', icon: ImageIcon, label: 'Image', cat: 'Data' },
  { type: 'fileNode', icon: Database, label: 'File', cat: 'Data' },
  { type: 'websiteNode', icon: Globe, label: 'Website', cat: 'Data' },
  { type: 'googleSearchNode', icon: Search, label: 'Google Search', cat: 'Data' },
  { type: 'adsInsightsNode', icon: BarChart3, label: 'Ads Insights', cat: 'Data' },
  { type: 'youtubeNode', icon: Youtube, label: 'YouTube', cat: 'Data' },
  { type: 'audioNode', icon: Mic, label: 'Audio', cat: 'Data' },
  // AI
  { type: 'promptNode', icon: Sparkles, label: 'Generate Text', cat: 'AI' },
  { type: 'aiChatbot', icon: MessageSquare, label: 'AI Chat', cat: 'AI' },
  { type: 'agenticNode', icon: Bot, label: 'AI Agent', cat: 'AI' },
  { type: 'chatbotNode', icon: BotMessageSquare, label: 'Chatbot Builder', cat: 'AI' },
  { type: 'audioBotNode', icon: AudioLines, label: 'Audio Bot', cat: 'AI' },
  { type: 'generateImage', icon: ImageIcon, label: 'Generate Image', cat: 'AI' },
  { type: 'generateVideo', icon: Video, label: 'Generate Video', cat: 'AI' },
  // Actions
  { type: 'publishNode', icon: Share2, label: 'Publish Social', cat: 'Action' },
  { type: 'actionWhatsApp', icon: WhatsAppLogo, label: 'WhatsApp Action', cat: 'Action' },
  { type: 'actionMarketingEmail', icon: Mail, label: 'Marketing Email', cat: 'Action' },
  { type: 'actionConversationalEmail', icon: Send, label: 'Email', cat: 'Action' },
  { type: 'telegramNode', icon: TelegramLogo, label: 'Telegram Action', cat: 'Action' },
  // Social
  { type: 'instagramNode', icon: Instagram, label: 'Instagram', cat: 'Social' },
  { type: 'instagramDMNode', icon: MessageCircle, label: 'Instagram DM', cat: 'Social' },
  { type: 'linkedinNode', icon: LinkedinLogo, label: 'LinkedIn', cat: 'Social' },
  { type: 'xNode', icon: XLogo, label: 'X (Twitter)', cat: 'Social' },
  { type: 'redditNode', icon: RedditLogo, label: 'Reddit', cat: 'Social' },
  { type: 'pinterestNode', icon: PinterestLogo, label: 'Pinterest', cat: 'Social' },
  { type: 'facebookNode', icon: Facebook, label: 'Facebook', cat: 'Social' },
  { type: 'googleBusinessNode', icon: Building2, label: 'Google Business', cat: 'Social' },
  // Integration
  { type: 'notionNode', icon: FileText, label: 'Notion', cat: 'Integration' },
  { type: 'googleWorkspaceNode', icon: FileSpreadsheet, label: 'Google Workspace', cat: 'Integration' },
  { type: 'httpRequestNode', icon: Globe, label: 'HTTP Request', cat: 'Integration' },
  { type: 'mailchimpNode', icon: Mail, label: 'Mailchimp', cat: 'Integration' },
  { type: 'hubspotNode', icon: Magnet, label: 'HubSpot', cat: 'Integration' },
  { type: 'airtableNode', icon: Table2, label: 'Airtable', cat: 'Integration' },
  { type: 'zohoNode', icon: Briefcase, label: 'Zoho', cat: 'Integration' },
  { type: 'webflowNode', icon: Globe, label: 'Webflow', cat: 'Integration' },
  { type: 'bloggerNode', icon: BookOpen, label: 'Blogger', cat: 'Integration' },
  { type: 'wordpressNode', icon: PenSquare, label: 'WordPress', cat: 'Integration' },
  { type: 'apolloNode', icon: Target, label: 'Apollo.io', cat: 'Integration' },
  { type: 'semrushNode', icon: BarChart3, label: 'Semrush', cat: 'Integration' },
  { type: 'revenuecatNode', icon: CreditCard, label: 'RevenueCat', cat: 'Integration' },
  { type: 'n8nNode', icon: Workflow, label: 'n8n', cat: 'Integration' },
  { type: 'shopifyNode', icon: ShoppingBag, label: 'Shopify', cat: 'Integration' },
  { type: 'stripeNode', icon: CreditCard, label: 'Stripe', cat: 'Integration' },
  // CRM
  { type: 'crmCreateContact', icon: UserPlus, label: 'Create Contact', cat: 'CRM' },
  { type: 'crmUpdateContact', icon: UserCog, label: 'Update Contact', cat: 'CRM' },
  { type: 'crmCreateDeal', icon: Briefcase, label: 'Create Deal', cat: 'CRM' },
  { type: 'crmUpdateDeal', icon: BriefcaseBusiness, label: 'Update Deal', cat: 'CRM' },
  { type: 'crmMoveStage', icon: MoveRight, label: 'Move Deal Stage', cat: 'CRM' },
  { type: 'crmAssignOwner', icon: UserCheck, label: 'Assign Owner', cat: 'CRM' },
  { type: 'crmAddTag', icon: Tag, label: 'Add Tag', cat: 'CRM' },
  { type: 'crmRemoveTag', icon: Tags, label: 'Remove Tag', cat: 'CRM' },
  { type: 'crmCreateActivity', icon: CalendarPlus, label: 'Create Activity', cat: 'CRM' },
  { type: 'crmCreateTask', icon: CheckSquare, label: 'Create Task', cat: 'CRM' },
  { type: 'crmLogNote', icon: StickyNote, label: 'Log Note', cat: 'CRM' },
  { type: 'crmFindRecord', icon: Search, label: 'Find Record', cat: 'CRM' },
  { type: 'crmFindRecords', icon: SearchCheck, label: 'Find Records', cat: 'CRM' },
  { type: 'crmDeleteRecord', icon: Trash2, label: 'Delete Record', cat: 'CRM' },
  // Logic
  { type: 'logicBranch', icon: GitBranch, label: 'Branch', cat: 'Logic' },
  { type: 'smartRouterNode', icon: Route, label: 'Smart Router', cat: 'Logic' },
  { type: 'logicDelay', icon: Timer, label: 'Delay', cat: 'Logic' },
  { type: 'logicLoop', icon: Repeat, label: 'Loop', cat: 'Logic' },
  // Output
  { type: 'documentNode', icon: FileText, label: 'Document', cat: 'Output' },
  // Utility
  { type: 'stickyNote', icon: StickyNote, label: 'Sticky Note', cat: 'Utility' },
];

interface QuickNodeSearchProps {
  position: { x: number; y: number };
  onSelect: (type: string) => void;
  onClose: () => void;
}

export function QuickNodeSearch({ position, onSelect, onClose }: QuickNodeSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query) return ALL_NODES.slice(0, 8);
    const q = query.toLowerCase();
    return ALL_NODES.filter(n =>
      n.label.toLowerCase().includes(q) ||
      n.cat.toLowerCase().includes(q) ||
      n.type.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelect(filtered[selectedIndex].type);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="absolute z-[100] w-[260px] bg-white/95 dark:bg-black/95 backdrop-blur-xl rounded-2xl shadow-2xl dark:shadow-[0_10px_30px_-5px_rgba(255,255,255,0.2)] border border-border/40 overflow-hidden"
      style={{ left: position.x, top: position.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="p-2.5 pb-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-8 h-8 text-xs bg-muted/30 border-border/30 rounded-lg"
            placeholder="Search nodes..."
          />
        </div>
      </div>
      <ScrollArea className="max-h-[260px]">
        <div className="p-1.5 pt-0 space-y-0.5">
          {filtered.map((node, i) => {
            const Icon = node.icon;
            return (
              <button
                type="button"
                key={node.type}
                onClick={() => onSelect(node.type)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                  i === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted/40'
                }`}
              >
                <div className={`size-6 rounded-md flex items-center justify-center shrink-0 ${
                  i === selectedIndex ? 'bg-primary/20' : 'bg-muted/50'
                }`}>
                  <Icon className="size-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{node.label}</div>
                </div>
                <span className="text-[9px] text-muted-foreground/60 uppercase">{node.cat}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-4">No nodes found</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
