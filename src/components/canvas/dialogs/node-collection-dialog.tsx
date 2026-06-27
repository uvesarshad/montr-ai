'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Search,
    Zap,
    Clock,
    Play,
    Database,
    FileText,
    Image as ImageIcon,
    Globe,
    Youtube,
    Mic,
    MessageSquare,
    Sparkles,
    Video,
    Send,
    Mail,
    Share2,
    GitBranch,
    Timer,
    Repeat,
    Instagram,
    StickyNote,
    Phone,
    PhoneCall,
    PhoneForwarded,
    PhoneOff,
    PhoneIncoming,
    AtSign,
    Eye,
    Facebook,
    Building2,
    FileSpreadsheet,
    Bot,
    BotMessageSquare,
    Route,
    AudioLines,
    MessageCircle,
    Layers,
    Workflow,
    Magnet,
    Table2,
    Briefcase,
    BookOpen,
    Target,
    BarChart3,
    TrendingUp,
    CreditCard,
    ShoppingBag,
    UserPlus,
    PenSquare,
    UserCog,
    BriefcaseBusiness,
    MoveRight,
    UserCheck,
    Tag,
    Tags,
    CalendarPlus,
    CheckSquare,
    SearchCheck,
    Trash2,
    PencilLine,
    CopyMinus,
    GitMerge,
    ArrowDownUp,
    Sigma,
    CalendarClock,
    Slack,
    Sheet,
    Hash,
} from 'lucide-react';
import { WhatsAppLogo, LinkedinLogo, XLogo, RedditLogo, PinterestLogo, TelegramLogo } from '@/components/social-icons';

import { cn } from '@/lib/utils';

// ... existing imports ...
import type { AnchorPoint } from '../canvas-toolbar';

interface NodeCollectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectNode: (type: string, subType?: string) => void;
    isCollapsed: boolean;
    anchorPoint: AnchorPoint;
}

const nodeCategories = [
    {
        title: 'TRIGGERS',
        nodes: [
            { type: 'triggerWebhook', icon: Zap, label: 'Webhook', desc: 'HTTP endpoint' },
            { type: 'triggerSchedule', icon: Clock, label: 'Schedule', desc: 'Time-based' },
            { type: 'triggerManual', icon: Play, label: 'Manual', desc: 'Button trigger' },
            { type: 'triggerWhatsApp', icon: Phone, label: 'WhatsApp', desc: 'Incoming message' },
            { type: 'triggerEmail', icon: Mail, label: 'Email', desc: 'Incoming email' },
            { type: 'triggerSocial', icon: AtSign, label: 'Social Media', desc: 'Social events' },
            { type: 'triggerKeyword', icon: Eye, label: 'Keyword Monitor', desc: 'Track keywords' },
            { type: 'triggerTelegram', icon: TelegramLogo, label: 'Telegram Bot', desc: 'Incoming bot message' },
            { type: 'triggerPolling', icon: Clock, label: 'New Row / Email / Item', desc: 'Poll an app without webhooks' },
            { type: 'triggerIntegrationWebhook', icon: Zap, label: 'Integration Event', desc: 'Shopify / RevenueCat / Calendly / Stripe webhooks' },
            { type: 'triggerAdLead', icon: UserPlus, label: 'Ad Lead Captured', desc: 'Meta / Google lead forms' },
            { type: 'triggerAdsWeeklySummary', icon: BarChart3, label: 'Ads Weekly Summary', desc: 'Weekly performance recap' },
            { type: 'triggerAdsBudgetThreshold', icon: TrendingUp, label: 'Ads Budget Threshold', desc: 'Spend pacing breaks' },
            { type: 'triggerAdsPerformanceAnomaly', icon: TrendingUp, label: 'Ads Anomaly', desc: 'Unusual spend swing' },
        ]
    },
    {
        title: 'DATA SOURCES',
        nodes: [
            { type: 'textInput', icon: FileText, label: 'Text Input', desc: 'Static text' },
            { type: 'imageNode', icon: ImageIcon, label: 'Image', desc: 'Image file' },
            { type: 'fileNode', icon: Database, label: 'File', desc: 'File upload' },
            { type: 'websiteNode', icon: Globe, label: 'Website', desc: 'Web scraping' },
            { type: 'googleSearchNode', icon: Search, label: 'Google Search', desc: 'Web search' },
            { type: 'adsInsightsNode', icon: BarChart3, label: 'Ads Insights', desc: 'Campaign metrics (read-only)' },
            { type: 'youtubeNode', icon: Youtube, label: 'YouTube', desc: 'Video transcript' },
            { type: 'audioNode', icon: Mic, label: 'Audio', desc: 'Audio transcribe' },
        ]
    },
    {
        title: 'AI',
        nodes: [
            { type: 'promptNode', icon: Sparkles, label: 'Generate Text', desc: 'AI text gen' },
            { type: 'aiChatbot', icon: MessageSquare, label: 'AI Chat', desc: 'Conversation' },
            { type: 'agenticNode', icon: Bot, label: 'AI Agent', desc: 'Goal-driven agent' },
            { type: 'chatbotNode', icon: BotMessageSquare, label: 'Chatbot Builder', desc: 'Rule + AI chatbot' },
            { type: 'audioBotNode', icon: AudioLines, label: 'Audio Bot', desc: 'Voice AI / TTS' },
            { type: 'generateImage', icon: ImageIcon, label: 'Generate Image', desc: 'AI image' },
            { type: 'generateVideo', icon: Video, label: 'Generate Video', desc: 'AI video' },
        ]
    },
    {
        title: 'CRM',
        nodes: [
            { type: 'crmCreateContact', icon: UserPlus, label: 'Create Contact', desc: 'New CRM contact' },
            { type: 'crmUpdateContact', icon: UserCog, label: 'Update Contact', desc: 'Edit a contact' },
            { type: 'crmCreateDeal', icon: Briefcase, label: 'Create Deal', desc: 'New deal in a pipeline' },
            { type: 'crmUpdateDeal', icon: BriefcaseBusiness, label: 'Update Deal', desc: 'Edit a deal' },
            { type: 'crmMoveStage', icon: MoveRight, label: 'Move Deal Stage', desc: 'Move a deal stage' },
            { type: 'crmAssignOwner', icon: UserCheck, label: 'Assign Owner', desc: 'Assign a record owner' },
            { type: 'crmAddTag', icon: Tag, label: 'Add Tag', desc: 'Tag a record' },
            { type: 'crmRemoveTag', icon: Tags, label: 'Remove Tag', desc: 'Untag a record' },
            { type: 'crmCreateActivity', icon: CalendarPlus, label: 'Create Activity', desc: 'Log note/call/meeting' },
            { type: 'crmCreateTask', icon: CheckSquare, label: 'Create Task', desc: 'Follow-up task' },
            { type: 'crmLogNote', icon: StickyNote, label: 'Log Note', desc: 'Note on a record' },
            { type: 'crmFindRecord', icon: Search, label: 'Find Record', desc: 'Look up one record' },
            { type: 'crmFindRecords', icon: SearchCheck, label: 'Find Records', desc: 'Find many (loop source)' },
            { type: 'crmDeleteRecord', icon: Trash2, label: 'Delete Record', desc: 'Hard-delete a record' },
        ]
    },
    {
        title: 'ACTIONS',
        nodes: [
            { type: 'publishNode', icon: Share2, label: 'Publish Social', desc: 'Post to social' },
            { type: 'actionWhatsApp', icon: WhatsAppLogo, label: 'WhatsApp', desc: 'Send message' },
            { type: 'actionSms', icon: MessageSquare, label: 'SMS', desc: 'Text via Twilio number' },
            { type: 'actionMarketingEmail', icon: Mail, label: 'Marketing Email', desc: 'Bulk email' },
            { type: 'actionConversationalEmail', icon: Send, label: 'Email', desc: '1:1 email' },
            { type: 'telegramNode', icon: TelegramLogo, label: 'Telegram Action', desc: 'Send via Bot' },
            { type: 'slackNode', icon: Slack, label: 'Slack', desc: 'Post to a channel' },
            { type: 'gmailNode', icon: Mail, label: 'Gmail', desc: 'Send an email' },
        ]
    },
    {
        title: 'VOICE',
        nodes: [
            { type: 'voiceMakeCall', icon: PhoneCall, label: 'Make Call', desc: 'Outbound AI voice call' },
            { type: 'voiceWaitOutcome', icon: PhoneIncoming, label: 'Wait for Outcome', desc: 'Pause until call ends' },
            { type: 'voiceGatherDtmf', icon: Hash, label: 'Gather Keypad (DTMF)', desc: 'Branch on pressed digits' },
            { type: 'voiceTransfer', icon: PhoneForwarded, label: 'Transfer Call', desc: 'Hand off to a human' },
            { type: 'voiceHangup', icon: PhoneOff, label: 'Hang Up', desc: 'End the call' },
            { type: 'voiceSendSms', icon: MessageSquare, label: 'Send SMS', desc: 'Text from voice number' },
        ]
    },
    {
        title: 'SOCIAL MEDIA',
        nodes: [
            { type: 'instagramNode', icon: Instagram, label: 'Instagram', desc: 'Fetch via API' },
            { type: 'linkedinNode', icon: LinkedinLogo, label: 'LinkedIn', desc: 'Fetch via API' },
            { type: 'xNode', icon: XLogo, label: 'X (Twitter)', desc: 'Fetch via API' },
            { type: 'redditNode', icon: RedditLogo, label: 'Reddit', desc: 'Post content' },
            { type: 'pinterestNode', icon: PinterestLogo, label: 'Pinterest', desc: 'Pin content' },
            { type: 'facebookNode', icon: Facebook, label: 'Facebook', desc: 'Scrape / Post' },
            { type: 'googleBusinessNode', icon: Building2, label: 'Google Business', desc: 'GBP management' },
            { type: 'instagramDMNode', icon: MessageCircle, label: 'Instagram DM/Comment', desc: 'DM automation' },
        ]
    },
    {
        title: 'INTEGRATIONS',
        nodes: [
            { type: 'notionNode', icon: FileText, label: 'Notion', desc: 'Pages & databases' },
            { type: 'googleWorkspaceNode', icon: FileSpreadsheet, label: 'Google Workspace', desc: 'Sheets, Docs, Slides' },
            { type: 'sheetsNode', icon: Sheet, label: 'Google Sheets', desc: 'Append / update / lookup rows' },
            { type: 'httpRequestNode', icon: Globe, label: 'HTTP Request', desc: 'API calls' },
            { type: 'mailchimpNode', icon: Mail, label: 'Mailchimp', desc: 'Audiences & campaigns' },
            { type: 'hubspotNode', icon: Magnet, label: 'HubSpot', desc: 'Contacts, deals & lists' },
            { type: 'airtableNode', icon: Table2, label: 'Airtable', desc: 'Bases & records' },
            { type: 'zohoNode', icon: Briefcase, label: 'Zoho', desc: 'CRM & Campaigns' },
            { type: 'webflowNode', icon: Globe, label: 'Webflow', desc: 'CMS items' },
            { type: 'bloggerNode', icon: BookOpen, label: 'Blogger', desc: 'Blog posts' },
            { type: 'wordpressNode', icon: PenSquare, label: 'WordPress', desc: 'Site posts' },
            { type: 'apolloNode', icon: Target, label: 'Apollo.io', desc: 'Prospect enrichment' },
            { type: 'semrushNode', icon: BarChart3, label: 'Semrush', desc: 'SEO reports' },
            { type: 'revenuecatNode', icon: CreditCard, label: 'RevenueCat', desc: 'Subscriptions' },
            { type: 'n8nNode', icon: Workflow, label: 'n8n', desc: 'External workflows' },
            { type: 'shopifyNode', icon: ShoppingBag, label: 'Shopify', desc: 'Products & orders' },
            { type: 'stripeNode', icon: CreditCard, label: 'Stripe', desc: 'Customers & payments' },
        ]
    },
    {
        title: 'LOGIC',
        nodes: [
            { type: 'logicBranch', icon: GitBranch, label: 'Branch', desc: 'If/Else logic' },
            { type: 'smartRouterNode', icon: Route, label: 'Smart Router', desc: 'Multi-way routing' },
            { type: 'subWorkflowNode', icon: Workflow, label: 'Sub-Workflow', desc: 'Call another canvas' },
            { type: 'delegateToAgentNode', icon: Bot, label: 'Delegate to Agent', desc: 'Hand a task to the Agent' },
            { type: 'logicDelay', icon: Timer, label: 'Delay', desc: 'Wait period' },
            { type: 'logicLoop', icon: Repeat, label: 'Loop', desc: 'Iterate items' },
        ]
    },
    {
        title: 'DATA TRANSFORM',
        nodes: [
            { type: 'editFieldsNode', icon: PencilLine, label: 'Edit Fields', desc: 'Set / rename / remove fields' },
            { type: 'dedupeNode', icon: CopyMinus, label: 'Deduplicate', desc: 'Remove duplicate items' },
            { type: 'mergeNode', icon: GitMerge, label: 'Merge', desc: 'Combine two inputs' },
            { type: 'sortNode', icon: ArrowDownUp, label: 'Sort', desc: 'Sort an array by a field' },
            { type: 'aggregateNode', icon: Sigma, label: 'Aggregate / Group', desc: 'Group + aggregate' },
            { type: 'dateTimeNode', icon: CalendarClock, label: 'Date / Time', desc: 'Date math & formatting' },
        ]
    },
    {
        title: 'OUTPUT',
        nodes: [
            { type: 'documentNode', icon: FileText, label: 'Document', desc: 'Rich text editor' },
        ]
    },
    {
        title: 'UTILITY',
        nodes: [
            { type: 'stickyNote', icon: StickyNote, label: 'Sticky Note', desc: 'Canvas note' },
            { type: 'groupNode', icon: Layers, label: 'Group', desc: 'Visual container' },
        ]
    },
];

export function NodeCollectionDialog({ open, onOpenChange, onSelectNode, isCollapsed, anchorPoint }: NodeCollectionDialogProps) {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredCategories = nodeCategories.map(category => ({
        ...category,
        nodes: category.nodes.filter(node =>
            node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            node.desc.toLowerCase().includes(searchQuery.toLowerCase())
        )
    })).filter(category => category.nodes.length > 0);

    // Dialog top is 5rem = 80px
    const dialogTop = 80;
    // Dialog left: 9.5rem (152px) collapsed, 22rem (352px) expanded
    const dialogLeft = isCollapsed ? 152 : 352;

    const originX = anchorPoint.x - dialogLeft;
    const originY = anchorPoint.y - dialogTop;

    return (
        <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
            <DialogContent
                className={cn(
                    "p-0 max-w-[280px] h-[calc(100vh-10rem)] top-[5rem] translate-x-0 translate-y-0 bg-white/95 dark:bg-black/95 backdrop-blur-xl shadow-2xl dark:shadow-[0_10px_30px_-5px_rgba(255,255,255,0.3)] border border-border/40 rounded-[28px] overflow-hidden",
                    "data-[state=open]:!animate-in data-[state=open]:!fade-in-0 data-[state=open]:!zoom-in-0 data-[state=open]:!slide-in-from-left-0 data-[state=open]:!slide-in-from-top-0 duration-300",
                    isCollapsed ? "left-[9.5rem]" : "left-[22rem]"
                )}
                style={{ transformOrigin: `${originX}px ${originY}px` }}
                onPointerDownOutside={(e) => e.preventDefault()}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <DialogTitle className="sr-only">Add Node</DialogTitle>
                <div className="flex flex-col h-full p-4">
                    {/* Header */}
                    <h2 className="text-sm font-medium text-muted-foreground mb-3 px-1">Add Node</h2>

                    {/* Search */}
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search nodes..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-9 bg-background/50 border-border/40 rounded-full"
                        />
                    </div>

                    {/* Node List */}
                    <ScrollArea className="flex-1 pr-2"
                        style={{ maxHeight: 'calc(100vh - 14rem)' }}
                    >
                        <div className="space-y-4">
                            {filteredCategories.map((category) => (
                                <div key={category.title}>
                                    <h3 className="text-[10px] font-semibold text-muted-foreground mb-2 px-2 tracking-wider">
                                        {category.title}
                                    </h3>
                                    <div className="space-y-1">
                                        {category.nodes.map((node) => {
                                            const Icon = node.icon;
                                            return (
                                                <button
                                                    type="button"
                                                    key={node.type}
                                                    onClick={() => {
                                                        onSelectNode(node.type);
                                                        onOpenChange(false);
                                                    }}
                                                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors text-left group"
                                                >
                                                    <div className="flex-shrink-0 size-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                                        <Icon className="size-4 text-primary" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium text-foreground truncate">
                                                            {node.label}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {node.desc}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    );
}
