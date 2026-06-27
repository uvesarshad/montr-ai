'use client';

import React, { memo, useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Trash2, Copy, Settings2, RefreshCw, Check, AlertCircle, Sparkles } from 'lucide-react';
import { Node } from 'reactflow';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ParameterSlider } from '@/components/parameters/parameter-slider';
import { ParameterNumberInput } from '@/components/parameters/parameter-number-input';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface NodeConfigSidebarProps {
    selectedNode: Node | null;
    onClose: () => void;
    onDelete: (nodeId: string) => void;
    onDuplicate: (nodeId: string) => void;
    onUpdateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
}

// Node type metadata for sidebar display
const NODE_TYPE_INFO: Record<string, { name: string; description: string; color: string }> = {
    // Triggers
    triggerWebhook: { name: 'Webhook Trigger', description: 'Receives HTTP POST requests to trigger the workflow', color: 'orange' },
    triggerSchedule: { name: 'Schedule Trigger', description: 'Runs the workflow on a defined schedule', color: 'orange' },
    triggerManual: { name: 'Manual Trigger', description: 'Manually start the workflow with a button click', color: 'orange' },
    triggerTelegram: { name: 'Telegram Trigger', description: 'Triggers on incoming Telegram messages', color: 'blue' },
    triggerWhatsApp: { name: 'WhatsApp Trigger', description: 'Triggers on incoming WhatsApp messages', color: 'green' },
    triggerEmail: { name: 'Email Trigger', description: 'Triggers on inbound email events (received, opened, clicked)', color: 'blue' },
    triggerSocial: { name: 'Social Trigger', description: 'Triggers on social-media events (comments, mentions, follows)', color: 'pink' },
    triggerKeyword: { name: 'Keyword Trigger', description: 'Triggers when a message matches one of the configured keywords', color: 'orange' },
    triggerPolling: { name: 'When a new row/email/record appears', description: 'Periodically polls an app (Gmail / Sheets / RSS) and runs the workflow for each new item', color: 'orange' },
    triggerFormSubmission: { name: 'Form Submission Trigger', description: 'Triggers when a hosted/public form is submitted', color: 'blue' },
    triggerAdsWeeklySummary: { name: 'Ads Weekly Summary Trigger', description: 'Fires weekly with computed ads performance roll-up', color: 'orange' },
    triggerAdsBudgetThreshold: { name: 'Ads Budget Threshold Trigger', description: 'Fires when spend pacing crosses a threshold', color: 'orange' },
    triggerAdsPerformanceAnomaly: { name: 'Ads Performance Anomaly Trigger', description: 'Fires when a week-over-week spend swing is anomalous', color: 'orange' },
    adsInsightsNode: { name: 'Ads Insights', description: 'Read campaign / account metrics (read-only)', color: 'gray' },
    marketingAnalyticsNode: { name: 'Marketing Analytics', description: 'Read GA4 / Search Console / social metrics (read-only)', color: 'gray' },

    // Logic
    logicBranch: { name: 'Branch', description: 'Route workflow based on conditions', color: 'purple' },
    logicDelay: { name: 'Delay', description: 'Pause workflow for a specified duration', color: 'purple' },
    logicLoop: { name: 'Loop', description: 'Iterate over array items', color: 'purple' },

    // Actions
    actionWhatsApp: { name: 'Send WhatsApp', description: 'Send a WhatsApp message to a contact', color: 'green' },
    actionWhatsAppButtons: { name: 'WhatsApp Buttons', description: 'Send an interactive reply-button message (session, max 3 buttons)', color: 'green' },
    actionWhatsAppList: { name: 'WhatsApp List', description: 'Send an interactive list menu (session, sections + rows)', color: 'green' },
    actionSms: { name: 'Send SMS', description: 'Send a text message via your Twilio voice number', color: 'green' },
    voiceMakeCall: { name: 'Make Call', description: 'Place an outbound AI voice call', color: 'green' },
    voiceWaitOutcome: { name: 'Wait for Call Outcome', description: 'Pause until the call completes, then branch', color: 'green' },
    voiceTransfer: { name: 'Transfer Call', description: 'Transfer a live call to a human/agent', color: 'green' },
    voiceHangup: { name: 'Hang Up', description: 'End a live call', color: 'green' },
    voiceSendSms: { name: 'Send SMS (Voice)', description: 'Send a text from your voice number', color: 'green' },
    actionMarketingEmail: { name: 'Marketing Email', description: 'Send bulk marketing emails to a list', color: 'blue' },
    actionConversationalEmail: { name: 'Conversational Email', description: 'Send personalized 1:1 emails', color: 'cyan' },
    telegramNode: { name: 'Telegram Action', description: 'Send messages or media via Telegram bot', color: 'blue' },
    slackNode: { name: 'Send Slack Message', description: 'Post a message to a Slack channel via your connected workspace', color: 'purple' },
    gmailNode: { name: 'Send Gmail', description: 'Send an email via a connected Gmail account', color: 'red' },
    sheetsNode: { name: 'Google Sheets', description: 'Append, update, upsert or look up rows in a Google Sheet', color: 'green' },

    // AI
    promptNode: { name: 'Generate Text', description: 'Generate text using AI models', color: 'indigo' },
    aiChatbot: { name: 'AI Chat', description: 'Interactive AI conversation', color: 'indigo' },
    generateImage: { name: 'Generate Image', description: 'Create images using AI', color: 'indigo' },
    generateVideo: { name: 'Generate Video', description: 'Create videos using AI', color: 'indigo' },

    // Data sources
    textInput: { name: 'Text Input', description: 'Add text content to the workflow', color: 'gray' },
    imageNode: { name: 'Image', description: 'Upload or reference images', color: 'gray' },
    fileNode: { name: 'File', description: 'Upload and process files', color: 'gray' },
    websiteNode: { name: 'Website', description: 'Scrape content from websites', color: 'gray' },
    youtubeNode: { name: 'YouTube', description: 'Extract content from YouTube videos', color: 'gray' },
    audioNode: { name: 'Audio', description: 'Transcribe audio content', color: 'gray' },

    // Social
    instagramNode: { name: 'Instagram', description: 'Instagram post content', color: 'pink' },
    linkedinNode: { name: 'LinkedIn', description: 'LinkedIn post content', color: 'blue' },
    xNode: { name: 'X (Twitter)', description: 'X/Twitter content', color: 'gray' },
    redditNode: { name: 'Reddit', description: 'Reddit post content', color: 'orange' },
    pinterestNode: { name: 'Pinterest', description: 'Pinterest content', color: 'red' },

    // Output
    publishNode: { name: 'Publish', description: 'Post content to social media platforms', color: 'emerald' },
    documentNode: { name: 'Document', description: 'Create or edit documents', color: 'amber' },

    // Utility
    stickyNote: { name: 'Sticky Note', description: 'Add comments and notes to the canvas', color: 'yellow' },

    // Data transform (H7 / TODO 2.2)
    editFieldsNode: { name: 'Edit Fields', description: 'Set / rename / remove fields on an object or array', color: 'gray' },
    dedupeNode: { name: 'Deduplicate', description: 'Remove duplicate items from an array', color: 'gray' },
    mergeNode: { name: 'Merge', description: 'Combine two inputs', color: 'gray' },
    sortNode: { name: 'Sort', description: 'Sort an array by a field', color: 'gray' },
    aggregateNode: { name: 'Aggregate / Group', description: 'Group + aggregate an array', color: 'gray' },
    dateTimeNode: { name: 'Date / Time', description: 'Date math and formatting', color: 'gray' },

    // Agent ↔ workflow ties (2.26)
    delegateToAgentNode: { name: 'Delegate to Agent', description: 'Hand a task to the autonomous Agent (creates a mission for review)', color: 'indigo' },
};

const COLOR_CLASSES: Record<string, string> = {
    orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    green: 'bg-green-500/10 text-green-600 dark:text-green-400',
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    gray: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
    pink: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
    red: 'bg-red-500/10 text-red-600 dark:text-red-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    yellow: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
};

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight per-node field validation (TODO 2.14)
//
// Intentionally minimal: a declarative rules map keyed by node TYPE (the canvas
// `node.type`, e.g. `actionMarketingEmail`). Rules read flat keys off
// `node.data` (canvas-sync maps `data` → engine `node.data.config`, so the same
// keys the engine consumes). Validation NEVER blocks saving — it only surfaces
// inline warnings so autosave keeps working. A `when` predicate handles the
// conditional/show-hide cases (e.g. marketing-email single-vs-list) so we don't
// warn about a field that isn't shown.
//
// No Zod is used at the field level here: the schemas in `src/validations/` are
// API-payload schemas (CRM / ads / analytics), none of which cleanly map to the
// sidebar's flat node-config keys, so a duplicated rules map is the lighter path.
// ─────────────────────────────────────────────────────────────────────────────

type NodeData = Record<string, unknown>;

interface ValidationRule {
    field: string;
    label: string;
    required?: boolean;
    /** Regex the value must match when present (and required-or-non-empty). */
    pattern?: RegExp;
    /** Custom message shown when the rule fails. */
    message?: string;
    /** Only apply this rule when the predicate is true for the current data. */
    when?: (data: NodeData) => boolean;
}

const URL_PATTERN = /^(https?:\/\/|\{\{).+/i; // http(s) URL or a {{variable}} expression

/** True when a value is effectively empty (covers string/array/null/undefined). */
function isBlank(v: unknown): boolean {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    return false;
}

const VALIDATION_RULES: Record<string, ValidationRule[]> = {
    // HTTP request — url required + must look like a URL or an expression.
    httpRequestNode: [
        { field: 'url', label: 'URL', required: true, pattern: URL_PATTERN, message: 'Enter an http(s) URL or a {{variable}}.' },
    ],
    // Webhook trigger — its public path is required to receive calls.
    triggerWebhook: [
        { field: 'webhookPath', label: 'Webhook path', required: true, message: 'A unique path is required to receive calls.' },
    ],
    // WhatsApp send — text mode needs a message, template mode needs a template.
    actionWhatsApp: [
        {
            field: 'message', label: 'Message', required: true,
            when: (d) => (d.messageType as string) !== 'template',
        },
        {
            field: 'templateName', label: 'Template', required: true,
            when: (d) => (d.messageType as string) === 'template',
            message: 'Select an approved template name.',
        },
    ],
    actionWhatsAppButtons: [
        { field: 'bodyText', label: 'Body text', required: true },
    ],
    actionWhatsAppList: [
        { field: 'bodyText', label: 'Body text', required: true },
    ],
    // Marketing email — required field depends on recipient mode.
    actionMarketingEmail: [
        {
            field: 'recipientEmail', label: 'Recipient email', required: true,
            when: (d) => (d.recipientMode as string) !== 'list',
            message: 'A recipient email (or {{contact.email}}) is required.',
        },
        {
            field: 'listSource', label: 'List source / segment', required: true,
            when: (d) => (d.recipientMode as string) === 'list' && isBlank(d.segmentTag),
            message: 'Provide a list source or a tag / segment.',
        },
    ],
    // SMS.
    actionSms: [
        { field: 'message', label: 'Message', required: true },
    ],
    // Slack.
    slackNode: [
        { field: 'channel', label: 'Channel', required: true, message: 'A channel (#name or id) is required.' },
        { field: 'text', label: 'Message', required: true },
    ],
    // Gmail.
    gmailNode: [
        { field: 'to', label: 'To', required: true },
        { field: 'subject', label: 'Subject', required: true },
    ],
    // Find records.
    crmFindRecords: [
        { field: 'entityType', label: 'Entity type', required: true },
    ],
    // Branch — needs at least one resolvable condition (deterministic or NL).
    logicBranch: [
        {
            field: 'condition', label: 'Condition', required: true,
            when: (d) => !d.isNaturalLanguage,
            message: 'Add at least one condition row.',
        },
        {
            field: 'naturalLanguagePrompt', label: 'AI condition', required: true,
            when: (d) => !!d.isNaturalLanguage,
            message: 'Describe the condition for the AI to evaluate.',
        },
    ],
};

/**
 * Validate a node's data against its rules. Returns a map of field → message for
 * every failing rule. NEVER throws and never gates saving — callers use it only
 * to render inline warnings.
 */
function validateNodeConfig(nodeType: string, data: NodeData): Record<string, string> {
    const rules = VALIDATION_RULES[nodeType];
    if (!rules) return {};
    const errors: Record<string, string> = {};
    for (const rule of rules) {
        if (rule.when && !rule.when(data)) continue;
        const value = data[rule.field];
        if (rule.required && isBlank(value)) {
            errors[rule.field] = rule.message || `${rule.label} is required.`;
            continue;
        }
        if (rule.pattern && !isBlank(value) && typeof value === 'string' && !rule.pattern.test(value.trim())) {
            errors[rule.field] = rule.message || `${rule.label} is invalid.`;
        }
    }
    return errors;
}

/** Special-case validator for the Delay "wait until a date & time" mode. */
function validateDelayDatetime(data: NodeData): Record<string, string> {
    if ((data.mode as string) !== 'until_datetime') return {};
    const raw = String(data.datetime || '').trim();
    if (!raw) return { datetime: 'A date & time is required for this mode.' };
    // Allow variable expressions; only hard-validate literal datetimes.
    if (raw.includes('{{')) return {};
    if (Number.isNaN(Date.parse(raw))) return { datetime: 'Not a valid date/time (e.g. 2026-12-31T09:00).' };
    return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Type-Specific Config Renderers
// ─────────────────────────────────────────────────────────────────────────────

function PromptAdvancedConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    return (
        <div className="space-y-4">
            <ParameterSlider
                label="Temperature"
                value={data.temperature ?? 1.0}
                onChange={(val) => onUpdate({ temperature: val })}
                min={0}
                max={2}
                step={0.1}
                tooltip="Controls randomness. Lower = more focused, Higher = more creative"
            />
            <ParameterSlider
                label="Max Tokens"
                value={data.maxTokens ?? 2048}
                onChange={(val) => onUpdate({ maxTokens: val })}
                min={256}
                max={4096}
                step={256}
                tooltip="Maximum length of the AI response"
            />
            <ParameterSlider
                label="Top P"
                value={data.topP ?? 0.95}
                onChange={(val) => onUpdate({ topP: val })}
                min={0}
                max={1}
                step={0.05}
                tooltip="Nucleus sampling: considers top P% of tokens"
            />
            <ParameterSlider
                label="Frequency Penalty"
                value={data.frequencyPenalty ?? 0}
                onChange={(val) => onUpdate({ frequencyPenalty: val })}
                min={-2}
                max={2}
                step={0.1}
                tooltip="Penalizes repeated tokens. Positive = less repetition"
            />
            <div className="space-y-2">
                <Label className="text-xs font-medium">System Prompt</Label>
                <Textarea
                    placeholder="You are a helpful assistant..."
                    value={data.systemPrompt || ''}
                    onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
                    className="min-h-[60px] text-xs resize-none rounded-xl"
                    rows={3}
                />
            </div>
        </div>
    );
}

function GenerateImageAdvancedConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    return (
        <div className="space-y-4">
            <ParameterSlider
                label="Guidance Scale"
                value={data.guidanceScale ?? 7.5}
                onChange={(val) => onUpdate({ guidanceScale: val })}
                min={1}
                max={20}
                step={0.5}
                tooltip="How closely to follow the prompt (1=creative, 20=strict)"
            />
            <ParameterNumberInput
                label="Seed"
                value={data.seed ?? null}
                onChange={(val) => onUpdate({ seed: val })}
                min={0}
                max={4294967295}
                placeholder="Random"
                tooltip="Use the same seed for reproducible results"
                showRandomize
            />
            <div className="space-y-2">
                <Label className="text-xs font-medium">Negative Prompt</Label>
                <Textarea
                    placeholder="Things to avoid in the image..."
                    value={data.negativePrompt || ''}
                    onChange={(e) => onUpdate({ negativePrompt: e.target.value })}
                    className="min-h-[40px] text-xs resize-none rounded-xl"
                    rows={2}
                />
            </div>
            <div className="space-y-2">
                <Label className="text-xs font-medium">Style Preset</Label>
                <Select
                    value={data.stylePreset || 'none'}
                    onValueChange={(val) => onUpdate({ stylePreset: val === 'none' ? undefined : val })}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="photographic">Photographic</SelectItem>
                        <SelectItem value="digital-art">Digital Art</SelectItem>
                        <SelectItem value="anime">Anime</SelectItem>
                        <SelectItem value="cinematic">Cinematic</SelectItem>
                        <SelectItem value="3d-model">3D Model</SelectItem>
                        <SelectItem value="pixel-art">Pixel Art</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

function WebsiteAdvancedConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Scrape Mode</Label>
                <Select
                    value={data.scrapeMode || 'single'}
                    onValueChange={(val) => onUpdate({ scrapeMode: val })}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="single">Single Page</SelectItem>
                        <SelectItem value="batch">Batch URLs</SelectItem>
                        <SelectItem value="sitemap">Sitemap Crawl</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <ParameterSlider
                label="Crawl Depth"
                value={data.crawlDepth ?? 0}
                onChange={(val) => onUpdate({ crawlDepth: val })}
                min={0}
                max={3}
                step={1}
                tooltip="0 = single page only. 1-3 = follow internal links to that depth."
            />
            <div className="space-y-2">
                <Label className="text-xs font-medium">Output Format</Label>
                <Select
                    value={data.outputFormat || 'markdown'}
                    onValueChange={(val) => onUpdate({ outputFormat: val })}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="markdown">Markdown</SelectItem>
                        <SelectItem value="plaintext">Plain Text</SelectItem>
                        <SelectItem value="json">JSON</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <ParameterSlider
                label="Auto-Refresh (min)"
                value={data.autoRefreshMinutes ?? 0}
                onChange={(val) => onUpdate({ autoRefreshMinutes: val })}
                min={0}
                max={1440}
                step={30}
                tooltip="0 = disabled. Re-scrape automatically at this interval (minutes)."
            />
        </div>
    );
}

function TextInputAdvancedConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Template Mode</Label>
                <Select
                    value={data.templateMode ? 'enabled' : 'disabled'}
                    onValueChange={(val) => onUpdate({ templateMode: val === 'enabled' })}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="disabled">Plain Text</SelectItem>
                        <SelectItem value="enabled">Template (supports {'{{variables}}'})</SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                    In template mode, use {'{{variable_name}}'} syntax to insert dynamic values.
                </p>
            </div>
        </div>
    );
}

// ---------- CRM: Find Records ----------

type FilterRow = { field?: string; operator?: string; value?: string };

const FIND_RECORDS_OPERATORS: { value: string; label: string }[] = [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'not equals' },
    { value: 'contains', label: 'contains' },
    { value: 'greater_than', label: 'greater than' },
    { value: 'less_than', label: 'less than' },
    { value: 'is_set', label: 'is set' },
    { value: 'is_empty', label: 'is empty' },
];

function FindRecordsAdvancedConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const filters: FilterRow[] = Array.isArray(data.filters) ? data.filters : [];

    const updateFilters = (next: FilterRow[]) => onUpdate({ filters: next });
    const addRow = () => updateFilters([...filters, { field: '', operator: 'equals', value: '' }]);
    const removeRow = (i: number) => updateFilters(filters.filter((_, idx) => idx !== i));
    const patchRow = (i: number, patch: Partial<FilterRow>) =>
        updateFilters(filters.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

    const needsValue = (op?: string) => op !== 'is_set' && op !== 'is_empty';

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Entity Type</Label>
                <Select
                    value={String(data.entityType || 'contact')}
                    onValueChange={(val) => onUpdate({ entityType: val })}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="contact">Contacts</SelectItem>
                        <SelectItem value="company">Companies</SelectItem>
                        <SelectItem value="deal">Deals</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Filters (all must match)</Label>
                    <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={addRow}>
                        + Add
                    </Button>
                </div>
                {filters.length === 0 && (
                    <p className="text-[10px] text-muted-foreground">No filters — returns recent records (up to the limit).</p>
                )}
                {filters.map((row, i) => (
                    <div key={i} className="space-y-1.5 rounded-lg border border-border p-2">
                        <div className="flex gap-1.5">
                            <Input
                                className="h-7 text-xs flex-1"
                                placeholder="field (e.g. status)"
                                value={row.field || ''}
                                onChange={(e) => patchRow(i, { field: e.target.value })}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive shrink-0"
                                onClick={() => removeRow(i)}
                            >
                                <Trash2 className="size-3.5" />
                            </Button>
                        </div>
                        <div className="flex gap-1.5">
                            <Select value={row.operator || 'equals'} onValueChange={(val) => patchRow(i, { operator: val })}>
                                <SelectTrigger className="h-7 text-xs w-32">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {FIND_RECORDS_OPERATORS.map((op) => (
                                        <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {needsValue(row.operator) && (
                                <Input
                                    className="h-7 text-xs flex-1"
                                    placeholder="value (supports {{vars}})"
                                    value={row.value || ''}
                                    onChange={(e) => patchRow(i, { value: e.target.value })}
                                />
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Tag IDs (optional)</Label>
                <Input
                    className="h-8 text-xs"
                    placeholder="comma-separated tag ids"
                    value={String(data.tag || '')}
                    onChange={(e) => onUpdate({ tag: e.target.value })}
                />
            </div>

            <ParameterNumberInput
                label="Limit"
                value={data.limit ?? 100}
                onChange={(val) => onUpdate({ limit: val })}
                min={1}
                max={500}
                placeholder="100"
                tooltip="Max records to return (hard cap 500)"
            />
        </div>
    );
}

// ---------- Common: Run once per item (forEach) ----------

/** Shown for every node so any action can iterate over an upstream array. */
function ForEachCommonConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const forEach = (data.forEach as { enabled?: boolean; sourcePath?: string } | undefined) || {};
    const enabled = forEach.enabled === true;

    const patch = (p: Partial<{ enabled: boolean; sourcePath: string }>) =>
        onUpdate({ forEach: { ...forEach, ...p } });

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-xs font-medium">Run once per item</Label>
                    <p className="text-[10px] text-muted-foreground">Execute this node for each element of an array.</p>
                </div>
                <Switch checked={enabled} onCheckedChange={(val) => patch({ enabled: val })} />
            </div>
            {enabled && (
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Source array</Label>
                    <Input
                        className="h-8 text-xs font-mono"
                        placeholder="$findNode.records"
                        value={forEach.sourcePath || ''}
                        onChange={(e) => patch({ sourcePath: e.target.value })}
                    />
                    <p className="text-[10px] text-muted-foreground">
                        Path/expression resolving to an array (e.g. a Find Records node&apos;s <code>records</code>).
                        Each item is available as <code>{'{{item}}'}</code> / <code>{'{{itemIndex}}'}</code>.
                    </p>
                </div>
            )}
        </div>
    );
}

// ---------- Common: Pinned sample data (1.9 test loop) ----------

/**
 * "Pinned sample data" — a JSON sample stored on the canvas node's `data.pinnedData`
 * (canvas-sync maps `data` → engine `node.data.config`, so the engine reads
 * `config.pinnedData`). On a TEST/manual run the engine uses the pin as the
 * node's output instead of executing it (triggers seed the run; downstream nodes
 * skip their side effects). Shown for trigger + action nodes.
 */
function PinnedDataCommonConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const initial = typeof data.pinnedData === 'string'
        ? data.pinnedData
        : data.pinnedData != null
            ? JSON.stringify(data.pinnedData, null, 2)
            : '';
    const [draft, setDraft] = useState<string>(initial);
    const [error, setError] = useState<string | null>(null);
    const pinned = data.pinnedData != null && String(data.pinnedData).trim() !== '';

    // Resync when switching nodes.
    useEffect(() => { setDraft(initial); setError(null); }, [node.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const commit = () => {
        const trimmed = draft.trim();
        if (!trimmed) {
            setError(null);
            onUpdate({ pinnedData: undefined });
            return;
        }
        try {
            JSON.parse(trimmed);
            setError(null);
            onUpdate({ pinnedData: trimmed });
        } catch {
            setError('Invalid JSON — fix before it can be used as a pin.');
        }
    };

    const unpin = () => { setDraft(''); setError(null); onUpdate({ pinnedData: undefined }); };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-xs font-medium">Pinned sample data</Label>
                    <p className="text-[10px] text-muted-foreground">
                        JSON used on test runs instead of executing this node (no real sends).
                    </p>
                </div>
                {pinned && (
                    <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={unpin}>
                        Unpin
                    </Button>
                )}
            </div>
            <Textarea
                className="min-h-[88px] text-xs font-mono"
                placeholder='{\n  "email": "lead@example.com"\n}'
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
            />
            {error && <p className="text-[10px] text-destructive">{error}</p>}
            {pinned && !error && (
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    Pinned — test runs will use this sample.
                </p>
            )}
        </div>
    );
}

// ---------- Common: Error handling (H3) ----------

/**
 * Per-node error handling — shown for every non-trigger node. Writes flat keys
 * on the canvas node's `data` (canvas-sync maps `data` → engine `node.data.config`,
 * so `onError`/`retryCount`/`retryDelayMs` land where the engine reads them).
 */
function ErrorHandlingCommonConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const onError = String(data.onError || 'stop');
    return (
        <div className="space-y-3">
            <div className="space-y-1.5">
                <Label className="text-xs font-medium">On error</Label>
                <Select value={onError} onValueChange={(val) => onUpdate({ onError: val })}>
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="stop">Stop workflow</SelectItem>
                        <SelectItem value="continue">Continue</SelectItem>
                        <SelectItem value="errorPath">Route to error output</SelectItem>
                    </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                    {onError === 'continue'
                        ? 'Log the failure and keep going down the normal path.'
                        : onError === 'errorPath'
                            ? 'On failure, route only along the red error handle (drag a connection from it).'
                            : 'Fail the whole run if this node errors (default).'}
                </p>
            </div>
            <ParameterSlider
                label="Retry count"
                value={data.retryCount ?? 0}
                onChange={(val) => onUpdate({ retryCount: val })}
                min={0}
                max={5}
                step={1}
                tooltip="How many times to retry this node before applying the On-error action"
            />
            <ParameterNumberInput
                label="Retry delay (ms)"
                value={data.retryDelayMs ?? 1000}
                onChange={(val) => onUpdate({ retryDelayMs: val })}
                min={0}
                max={60000}
                placeholder="1000"
                tooltip="Base backoff between retries (exponential, with jitter)"
            />
        </div>
    );
}

// ---------- Trigger config helpers ----------

/** Random url-safe identifier, ~16 chars. Used for webhook paths & secrets. */
function randomToken(length = 16): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    // Prefer crypto.getRandomValues when available so we don't rely on Math.random
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
        const buf = new Uint8Array(length);
        window.crypto.getRandomValues(buf);
        return Array.from(buf, (b) => alphabet[b % alphabet.length]).join('');
    }
    let out = '';
    for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
}

/** Small copy-to-clipboard button used by webhook path/URL fields. */
function CopyButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            onClick={async () => {
                if (!value) return;
                try {
                    await navigator.clipboard.writeText(value);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                } catch {
                    // clipboard may be unavailable in some browser contexts — ignore
                }
            }}
        >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
    );
}

/** Retry / timeout / error-handling fields shared by every trigger type. */
function TriggerCommonFields({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    return (
        <div className="space-y-4">
            <ParameterSlider
                label="Retry Count"
                value={data.retryCount ?? 0}
                onChange={(val) => onUpdate({ retryCount: val })}
                min={0}
                max={5}
                step={1}
                tooltip="Number of times to retry if trigger handling fails"
            />
            <ParameterSlider
                label="Timeout (seconds)"
                value={data.timeoutSeconds ?? 30}
                onChange={(val) => onUpdate({ timeoutSeconds: val })}
                min={5}
                max={300}
                step={5}
                tooltip="Maximum time to wait for trigger handling to complete"
            />
            <div className="space-y-2">
                <Label className="text-xs font-medium">Error Handling</Label>
                <Select
                    value={data.errorHandling || 'stop'}
                    onValueChange={(val) => onUpdate({ errorHandling: val })}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="stop">Stop Workflow</SelectItem>
                        <SelectItem value="continue">Continue Anyway</SelectItem>
                        <SelectItem value="retry">Retry</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

// ---------- Trigger: Webhook ----------

function WebhookTriggerConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const path: string = data.webhookPath || '';
    const secret: string = data.webhookSecret || '';
    const publicUrl = path
        ? (typeof window !== 'undefined'
            ? `${window.location.origin}/api/v2/canvas-webhooks/${path}`
            : `/api/v2/canvas-webhooks/${path}`)
        : '';

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Webhook Path</Label>
                <div className="flex gap-2">
                    <Input
                        value={path}
                        placeholder="e.g. lead-capture-abc123"
                        onChange={(e) => onUpdate({ webhookPath: e.target.value.trim() })}
                        className="h-8 text-xs rounded-xl font-mono"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={() => onUpdate({ webhookPath: randomToken(16) })}
                        title="Generate a new random path"
                    >
                        <RefreshCw className="size-3.5" />
                    </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                    Unique path segment that identifies this webhook. Changing it breaks any external callers already using the old URL.
                </p>
            </div>

            {path && (
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Public URL</Label>
                    <div className="flex gap-2">
                        <Input
                            readOnly
                            value={publicUrl}
                            className="h-8 text-xs rounded-xl font-mono bg-muted/40"
                        />
                        <CopyButton value={publicUrl} />
                    </div>
                </div>
            )}

            <div className="space-y-2">
                <Label className="text-xs font-medium">Shared Secret (optional)</Label>
                <div className="flex gap-2">
                    <Input
                        value={secret}
                        placeholder="Leave empty to skip signature check"
                        onChange={(e) => onUpdate({ webhookSecret: e.target.value })}
                        className="h-8 text-xs rounded-xl font-mono"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={() => onUpdate({ webhookSecret: randomToken(32) })}
                        title="Generate a new random secret"
                    >
                        <RefreshCw className="size-3.5" />
                    </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                    When set, callers must send either an <code className="font-mono">X-Signature</code> HMAC-SHA256 hex of the body, or pass the secret verbatim in <code className="font-mono">X-Webhook-Token</code>.
                </p>
            </div>

            <Separator />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Execution</span>
            <TriggerCommonFields node={node} onUpdate={onUpdate} />
        </div>
    );
}

// ---------- Trigger: Schedule ----------

const CRON_PRESETS: { label: string; value: string }[] = [
    { label: 'Every minute',      value: '* * * * *' },
    { label: 'Every 5 minutes',   value: '*/5 * * * *' },
    { label: 'Every 15 minutes',  value: '*/15 * * * *' },
    { label: 'Every 30 minutes',  value: '*/30 * * * *' },
    { label: 'Every hour',        value: '0 * * * *' },
    { label: 'Every day at 09:00', value: '0 9 * * *' },
    { label: 'Every Monday at 09:00', value: '0 9 * * 1' },
    { label: 'First of every month 00:00', value: '0 0 1 * *' },
];

const TIMEZONES = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Paris',
    'Europe/Istanbul',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney',
];

function ScheduleTriggerConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const cron: string = data.cronExpression || '';

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Preset</Label>
                <Select
                    value={CRON_PRESETS.find((p) => p.value === cron)?.value || 'custom'}
                    onValueChange={(val) => {
                        if (val !== 'custom') onUpdate({ cronExpression: val });
                    }}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue placeholder="Pick a preset…" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="custom">Custom…</SelectItem>
                        {CRON_PRESETS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Cron Expression</Label>
                <Input
                    value={cron}
                    placeholder="e.g. 0 9 * * 1-5"
                    onChange={(e) => onUpdate({ cronExpression: e.target.value })}
                    className="h-8 text-xs rounded-xl font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                    5-field cron: minute hour day month weekday. The scheduler re-registers on save.
                </p>
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Timezone</Label>
                <Select
                    value={data.timezone || 'UTC'}
                    onValueChange={(val) => onUpdate({ timezone: val })}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="flex items-center justify-between pt-1">
                <div className="space-y-0.5">
                    <Label className="text-xs font-medium">Recurring</Label>
                    <p className="text-[10px] text-muted-foreground">Unselect to run only the next matching tick.</p>
                </div>
                <Switch
                    checked={data.isRecurring !== false}
                    onCheckedChange={(v) => onUpdate({ isRecurring: v })}
                />
            </div>

            <Separator />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Execution</span>
            <TriggerCommonFields node={node} onUpdate={onUpdate} />
        </div>
    );
}

// ---------- Trigger: Manual ----------

function ManualTriggerConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    return (
        <div className="space-y-4">
            <p className="text-[10px] text-muted-foreground">
                Manual triggers start via the Run button in the canvas or via the execute API. No trigger-specific fields are needed.
            </p>
            <Separator />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Execution</span>
            <TriggerCommonFields node={node} onUpdate={onUpdate} />
        </div>
    );
}

// ---------- Trigger: WhatsApp ----------

function WhatsAppTriggerConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const triggerType: string = data.triggerType || 'any_message';

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Trigger Type</Label>
                <Select
                    value={triggerType}
                    onValueChange={(val) => onUpdate({ triggerType: val })}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="any_message">Any incoming message</SelectItem>
                        <SelectItem value="keyword">Message matches keyword</SelectItem>
                        <SelectItem value="contact_group">Message from contact group</SelectItem>
                        <SelectItem value="new_contact">New contact writes in first time</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {triggerType === 'keyword' && (
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Keywords (comma-separated)</Label>
                    <Input
                        value={data.keywords || ''}
                        placeholder="pricing, demo, help"
                        onChange={(e) => onUpdate({ keywords: e.target.value })}
                        className="h-8 text-xs rounded-xl"
                    />
                </div>
            )}

            {triggerType === 'contact_group' && (
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Contact Group ID</Label>
                    <Input
                        value={data.contactGroupId || ''}
                        placeholder="Group id from CRM"
                        onChange={(e) => onUpdate({ contactGroupId: e.target.value })}
                        className="h-8 text-xs rounded-xl font-mono"
                    />
                </div>
            )}

            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-xs font-medium">Case-sensitive match</Label>
                    <p className="text-[10px] text-muted-foreground">Only relevant for keyword matches.</p>
                </div>
                <Switch
                    checked={!!data.caseSensitive}
                    onCheckedChange={(v) => onUpdate({ caseSensitive: v })}
                />
            </div>

            <Separator />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Execution</span>
            <TriggerCommonFields node={node} onUpdate={onUpdate} />
        </div>
    );
}

// ---------- Action: Send WhatsApp ----------

interface WhatsAppAccountOption {
    _id: string;
    name?: string;
    phoneNumber?: string;
    displayPhoneNumber?: string;
}

function WhatsAppActionConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const { data: waAccounts = [], isLoading: waLoading } = useQuery<WhatsAppAccountOption[]>({
        queryKey: ['whatsapp-accounts'],
        queryFn: async () => {
            const res = await fetch('/api/whatsapp/accounts');
            const json = res.ok ? await res.json() : { accounts: [] };
            return Array.isArray(json?.accounts) ? json.accounts : [];
        },
    });

    const accountId: string = data.accountId || '';

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Send from account</Label>
                {waAccounts.length > 0 ? (
                    <Select
                        value={accountId || 'auto'}
                        onValueChange={(val) => onUpdate({ accountId: val === 'auto' ? '' : val })}
                    >
                        <SelectTrigger className="h-8 text-xs rounded-xl">
                            <SelectValue placeholder="Auto (brand default)" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="auto">Auto (brand default)</SelectItem>
                            {waAccounts.map((acc) => (
                                <SelectItem key={acc._id} value={acc._id}>
                                    {acc.name || acc.displayPhoneNumber || acc.phoneNumber || acc._id}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <Input
                        value={accountId}
                        placeholder={waLoading ? 'Loading accounts…' : 'WhatsApp account id (optional)'}
                        onChange={(e) => onUpdate({ accountId: e.target.value })}
                        className="h-8 text-xs rounded-xl font-mono"
                    />
                )}
                <p className="text-[10px] text-muted-foreground">
                    The number this message is sent from. Leave on Auto to use the brand&apos;s default WhatsApp number.
                </p>
            </div>
        </div>
    );
}

// ---------- Action: Send WhatsApp Interactive (buttons / list) ----------
// (2.11) One renderer drives both the reply-button and list-menu nodes; the
// mode is derived from the node type so a node mounted as buttons/list always
// edits that kind. Interactive messages are SESSION messages — the processor
// hard-blocks behind the 24h conversation window.

interface InteractiveButtonRow {
    id?: string;
    title?: string;
}
interface InteractiveListRow {
    id?: string;
    title?: string;
    description?: string;
}
interface InteractiveListSection {
    title?: string;
    rows?: InteractiveListRow[];
}

function WhatsAppInteractiveConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const mode: 'buttons' | 'list' = node.type === 'actionWhatsAppList' ? 'list' : 'buttons';

    const buttons: InteractiveButtonRow[] = Array.isArray(data.buttons) ? data.buttons : [];
    const sections: InteractiveListSection[] = Array.isArray(data.sections) ? data.sections : [];

    const updateButtons = (next: InteractiveButtonRow[]) => onUpdate({ buttons: next });
    const updateSections = (next: InteractiveListSection[]) => onUpdate({ sections: next });

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Account ID (optional)</Label>
                <Input
                    value={data.accountId || ''}
                    placeholder="Auto (brand default)"
                    onChange={(e) => onUpdate({ accountId: e.target.value })}
                    className="h-8 text-xs rounded-xl font-mono"
                />
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Header (optional)</Label>
                <Input
                    value={data.headerText || ''}
                    placeholder="Short header text"
                    onChange={(e) => onUpdate({ headerText: e.target.value })}
                    className="h-8 text-xs rounded-xl"
                />
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Body text *</Label>
                <Textarea
                    value={data.bodyText || ''}
                    placeholder="Message shown above the options"
                    onChange={(e) => onUpdate({ bodyText: e.target.value })}
                    className="min-h-[70px] text-xs rounded-xl resize-none"
                />
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Footer (optional)</Label>
                <Input
                    value={data.footerText || ''}
                    placeholder="Small footer text"
                    onChange={(e) => onUpdate({ footerText: e.target.value })}
                    className="h-8 text-xs rounded-xl"
                />
            </div>

            {mode === 'buttons' ? (
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Reply buttons (max 3)</Label>
                    {buttons.map((b, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <Input
                                value={b.id || ''}
                                placeholder="id"
                                onChange={(e) => {
                                    const next = [...buttons];
                                    next[i] = { ...next[i], id: e.target.value };
                                    updateButtons(next);
                                }}
                                className="h-8 text-xs rounded-xl w-24 font-mono"
                            />
                            <Input
                                value={b.title || ''}
                                placeholder="Button label"
                                onChange={(e) => {
                                    const next = [...buttons];
                                    next[i] = { ...next[i], title: e.target.value };
                                    updateButtons(next);
                                }}
                                className="h-8 text-xs rounded-xl flex-1"
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 shrink-0"
                                onClick={() => updateButtons(buttons.filter((_, idx) => idx !== i))}
                            >
                                <Trash2 className="size-3.5" />
                            </Button>
                        </div>
                    ))}
                    {buttons.length < 3 && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => updateButtons([...buttons, { id: `btn_${buttons.length}`, title: '' }])}
                        >
                            Add button
                        </Button>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">Menu button label</Label>
                        <Input
                            value={data.buttonLabel || ''}
                            placeholder="Choose"
                            onChange={(e) => onUpdate({ buttonLabel: e.target.value })}
                            className="h-8 text-xs rounded-xl"
                        />
                    </div>
                    <Label className="text-xs font-medium">Sections</Label>
                    {sections.map((sec, si) => (
                        <div key={si} className="space-y-2 rounded-xl border border-border p-2">
                            <div className="flex items-center gap-2">
                                <Input
                                    value={sec.title || ''}
                                    placeholder="Section title (optional)"
                                    onChange={(e) => {
                                        const next = [...sections];
                                        next[si] = { ...next[si], title: e.target.value };
                                        updateSections(next);
                                    }}
                                    className="h-8 text-xs rounded-xl flex-1"
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 shrink-0"
                                    onClick={() => updateSections(sections.filter((_, idx) => idx !== si))}
                                >
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </div>
                            {(sec.rows || []).map((row, ri) => (
                                <div key={ri} className="flex items-center gap-2 pl-2">
                                    <Input
                                        value={row.id || ''}
                                        placeholder="id"
                                        onChange={(e) => {
                                            const next = [...sections];
                                            const rows = [...(next[si].rows || [])];
                                            rows[ri] = { ...rows[ri], id: e.target.value };
                                            next[si] = { ...next[si], rows };
                                            updateSections(next);
                                        }}
                                        className="h-8 text-xs rounded-xl w-20 font-mono"
                                    />
                                    <Input
                                        value={row.title || ''}
                                        placeholder="Row title"
                                        onChange={(e) => {
                                            const next = [...sections];
                                            const rows = [...(next[si].rows || [])];
                                            rows[ri] = { ...rows[ri], title: e.target.value };
                                            next[si] = { ...next[si], rows };
                                            updateSections(next);
                                        }}
                                        className="h-8 text-xs rounded-xl flex-1"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-7 shrink-0"
                                        onClick={() => {
                                            const next = [...sections];
                                            next[si] = { ...next[si], rows: (next[si].rows || []).filter((_, idx) => idx !== ri) };
                                            updateSections(next);
                                        }}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </Button>
                                </div>
                            ))}
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs ml-2"
                                onClick={() => {
                                    const next = [...sections];
                                    const rows = [...(next[si].rows || [])];
                                    rows.push({ id: `row_${rows.length}`, title: '' });
                                    next[si] = { ...next[si], rows };
                                    updateSections(next);
                                }}
                            >
                                Add row
                            </Button>
                        </div>
                    ))}
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => updateSections([...sections, { title: '', rows: [{ id: 'row_0', title: '' }] }])}
                    >
                        Add section
                    </Button>
                </div>
            )}
            <p className="text-[10px] text-muted-foreground">
                Interactive messages are session messages — they only send inside an open 24-hour conversation window.
            </p>
        </div>
    );
}

// ---------- Trigger: Email ----------

function EmailTriggerConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Event Type</Label>
                <Select
                    value={data.eventType || 'email_received'}
                    onValueChange={(val) => onUpdate({ eventType: val })}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="email_received">Email received</SelectItem>
                        <SelectItem value="email_opened">Email opened</SelectItem>
                        <SelectItem value="email_clicked">Email link clicked</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">From contains</Label>
                <Input
                    value={data.fromFilter || ''}
                    placeholder="@acme.com or jane@..."
                    onChange={(e) => onUpdate({ fromFilter: e.target.value })}
                    className="h-8 text-xs rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground">Optional substring match against the sender address.</p>
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Subject contains</Label>
                <Input
                    value={data.subjectContains || ''}
                    placeholder="e.g. invoice"
                    onChange={(e) => onUpdate({ subjectContains: e.target.value })}
                    className="h-8 text-xs rounded-xl"
                />
            </div>

            <Separator />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Execution</span>
            <TriggerCommonFields node={node} onUpdate={onUpdate} />
        </div>
    );
}

// ---------- Trigger: Polling (new row / email / record) ----------

function PollingTriggerConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const source = (data.pollSource as string) || 'rss_new_item';

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">What to watch</Label>
                <Select value={source} onValueChange={(val) => onUpdate({ pollSource: val })}>
                    <SelectTrigger className="h-8 text-xs rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="gmail_new_email">New Gmail email</SelectItem>
                        <SelectItem value="sheets_new_row">New Google Sheets row</SelectItem>
                        <SelectItem value="rss_new_item">New RSS / Atom feed item</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Check every (minutes)</Label>
                <Input
                    type="number"
                    min={5}
                    value={(data.intervalMinutes as number) ?? 15}
                    onChange={(e) => onUpdate({ intervalMinutes: Number(e.target.value) || 15 })}
                    className="h-8 text-xs rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground">Minimum 5 minutes. Default 15.</p>
            </div>

            {(source === 'gmail_new_email' || source === 'sheets_new_row') && (
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Credential name</Label>
                    <Input
                        value={(data.connectionId as string) || ''}
                        placeholder="e.g. google"
                        onChange={(e) => onUpdate({ connectionId: e.target.value })}
                        className="h-8 text-xs rounded-xl font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">Name of the workflow credential holding your Google OAuth access token.</p>
                </div>
            )}

            {source === 'gmail_new_email' && (
                <>
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">Gmail search (optional)</Label>
                        <Input
                            value={(data.gmailQuery as string) || ''}
                            placeholder="e.g. from:billing@acme.com"
                            onChange={(e) => onUpdate({ gmailQuery: e.target.value })}
                            className="h-8 text-xs rounded-xl"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">Label ID (optional)</Label>
                        <Input
                            value={(data.gmailLabelId as string) || ''}
                            placeholder="e.g. INBOX"
                            onChange={(e) => onUpdate({ gmailLabelId: e.target.value })}
                            className="h-8 text-xs rounded-xl"
                        />
                    </div>
                </>
            )}

            {source === 'sheets_new_row' && (
                <>
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">Spreadsheet ID</Label>
                        <Input
                            value={(data.spreadsheetId as string) || ''}
                            placeholder="1AbC...the long id from the sheet URL"
                            onChange={(e) => onUpdate({ spreadsheetId: e.target.value })}
                            className="h-8 text-xs rounded-xl font-mono"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">Sheet / tab name (optional)</Label>
                        <Input
                            value={(data.sheetName as string) || ''}
                            placeholder="Sheet1"
                            onChange={(e) => onUpdate({ sheetName: e.target.value })}
                            className="h-8 text-xs rounded-xl"
                        />
                    </div>
                </>
            )}

            {source === 'rss_new_item' && (
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Feed URL</Label>
                    <Input
                        value={(data.feedUrl as string) || ''}
                        placeholder="https://example.com/feed.xml"
                        onChange={(e) => onUpdate({ feedUrl: e.target.value })}
                        className="h-8 text-xs rounded-xl"
                    />
                </div>
            )}

            <Separator />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Execution</span>
            <TriggerCommonFields node={node} onUpdate={onUpdate} />
        </div>
    );
}

// ---------- Trigger: Form Submission ----------

function FormSubmissionTriggerConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Form ID</Label>
                <Input
                    value={data.formId || ''}
                    placeholder="Leave empty for all forms"
                    onChange={(e) => onUpdate({ formId: e.target.value })}
                    className="h-8 text-xs rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground">Bind to a specific form, or a comma-separated list. Empty matches any form in your workspace.</p>
            </div>

            <Separator />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Execution</span>
            <TriggerCommonFields node={node} onUpdate={onUpdate} />
        </div>
    );
}

// ---------- Trigger: Ads performance (weekly summary / budget / anomaly) ----------

function AdsPerformanceTriggerConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Brand (optional)</Label>
                <Input
                    value={data.brandId || ''}
                    placeholder="Leave empty for the whole organization"
                    onChange={(e) => onUpdate({ brandId: e.target.value })}
                    className="h-8 text-xs rounded-xl font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                    Brand filter only applies when the signal is brand-scoped. The org-wide weekly roll-up fires regardless of this filter.
                </p>
            </div>

            <Separator />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Execution</span>
            <TriggerCommonFields node={node} onUpdate={onUpdate} />
        </div>
    );
}

// ---------- Data: Ads Insights ----------

function AdsInsightsConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Platform</Label>
                <Select value={data.platform || 'all'} onValueChange={(val) => onUpdate({ platform: val })}>
                    <SelectTrigger className="h-8 text-xs rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All platforms</SelectItem>
                        <SelectItem value="meta_ads">Meta Ads</SelectItem>
                        <SelectItem value="google_ads">Google Ads</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Aggregation</Label>
                <Select value={data.entityType || 'campaign'} onValueChange={(val) => onUpdate({ entityType: val })}>
                    <SelectTrigger className="h-8 text-xs rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="campaign">Per campaign</SelectItem>
                        <SelectItem value="account">Per account</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Look-back window (days)</Label>
                <Input
                    type="number"
                    min={1}
                    max={90}
                    value={data.days ?? 30}
                    onChange={(e) => onUpdate({ days: Number(e.target.value) })}
                    className="h-8 text-xs rounded-xl"
                />
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Brand (optional)</Label>
                <Input
                    value={data.brandId || ''}
                    placeholder="Defaults to the workflow brand"
                    onChange={(e) => onUpdate({ brandId: e.target.value })}
                    className="h-8 text-xs rounded-xl font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                    Validated against your organization. Empty falls back to the workflow brand, then org-wide.
                </p>
            </div>
        </div>
    );
}

// ---------- Data: Marketing Analytics ----------

function MarketingAnalyticsConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Source</Label>
                <Select value={data.source || 'ga4'} onValueChange={(val) => onUpdate({ source: val })}>
                    <SelectTrigger className="h-8 text-xs rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ga4">GA4 (website traffic)</SelectItem>
                        <SelectItem value="search_console">Search Console (organic)</SelectItem>
                        <SelectItem value="social">Social (account-level)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Look-back window (days)</Label>
                <Input
                    type="number"
                    min={1}
                    max={90}
                    value={data.days ?? 30}
                    onChange={(e) => onUpdate({ days: Number(e.target.value) })}
                    className="h-8 text-xs rounded-xl"
                />
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Brand (optional)</Label>
                <Input
                    value={data.brandId || ''}
                    placeholder="Defaults to the workflow brand"
                    onChange={(e) => onUpdate({ brandId: e.target.value })}
                    className="h-8 text-xs rounded-xl font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                    Validated against your organization. Empty falls back to the workflow brand, then org-wide.
                </p>
            </div>
        </div>
    );
}

// ---------- Trigger: Social ----------

function SocialTriggerConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Platform</Label>
                <Select
                    value={data.platform || 'instagram'}
                    onValueChange={(val) => onUpdate({ platform: val })}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                        <SelectItem value="x">X (Twitter)</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="youtube">YouTube</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Event Type</Label>
                <Select
                    value={data.eventType || 'new_comment'}
                    onValueChange={(val) => onUpdate({ eventType: val })}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="new_comment">New comment</SelectItem>
                        <SelectItem value="new_mention">New mention</SelectItem>
                        <SelectItem value="new_follower">New follower</SelectItem>
                        <SelectItem value="new_dm">New direct message</SelectItem>
                        <SelectItem value="post_published">Post published</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Account ID (optional)</Label>
                <Input
                    value={data.accountId || ''}
                    placeholder="Scope to a single connected account"
                    onChange={(e) => onUpdate({ accountId: e.target.value })}
                    className="h-8 text-xs rounded-xl font-mono"
                />
            </div>

            <Separator />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Execution</span>
            <TriggerCommonFields node={node} onUpdate={onUpdate} />
        </div>
    );
}

// ---------- Trigger: Keyword ----------

function KeywordTriggerConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Keywords (comma-separated)</Label>
                <Textarea
                    value={data.keywords || ''}
                    placeholder="pricing, demo, cancel"
                    onChange={(e) => onUpdate({ keywords: e.target.value })}
                    className="min-h-[60px] text-xs resize-none rounded-xl"
                    rows={3}
                />
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium">Match Mode</Label>
                <Select
                    value={data.matchMode || 'any'}
                    onValueChange={(val) => onUpdate({ matchMode: val })}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="any">Any keyword present</SelectItem>
                        <SelectItem value="all">All keywords present</SelectItem>
                        <SelectItem value="exact">Whole message matches exactly</SelectItem>
                        <SelectItem value="regex">Regex (advanced)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-xs font-medium">Case-sensitive</Label>
                </div>
                <Switch
                    checked={!!data.caseSensitive}
                    onCheckedChange={(v) => onUpdate({ caseSensitive: v })}
                />
            </div>

            <Separator />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Execution</span>
            <TriggerCommonFields node={node} onUpdate={onUpdate} />
        </div>
    );
}

// ---------- Trigger: Telegram ----------

function TelegramTriggerConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Trigger Type</Label>
                <Select
                    value={data.triggerType || 'any_message'}
                    onValueChange={(val) => onUpdate({ triggerType: val })}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="any_message">Any incoming message</SelectItem>
                        <SelectItem value="command">Slash command (e.g. /start)</SelectItem>
                        <SelectItem value="keyword">Message matches keyword</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {data.triggerType === 'command' && (
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Command</Label>
                    <Input
                        value={data.command || ''}
                        placeholder="/start"
                        onChange={(e) => onUpdate({ command: e.target.value })}
                        className="h-8 text-xs rounded-xl font-mono"
                    />
                </div>
            )}

            {data.triggerType === 'keyword' && (
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Keywords (comma-separated)</Label>
                    <Input
                        value={data.keywords || ''}
                        placeholder="help, support"
                        onChange={(e) => onUpdate({ keywords: e.target.value })}
                        className="h-8 text-xs rounded-xl"
                    />
                </div>
            )}

            <div className="space-y-2">
                <Label className="text-xs font-medium">Chat ID (optional)</Label>
                <Input
                    value={data.chatId || ''}
                    placeholder="Scope to a single chat"
                    onChange={(e) => onUpdate({ chatId: e.target.value })}
                    className="h-8 text-xs rounded-xl font-mono"
                />
            </div>

            <Separator />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Execution</span>
            <TriggerCommonFields node={node} onUpdate={onUpdate} />
        </div>
    );
}

function GenerateVideoAdvancedConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    return (
        <div className="space-y-4">
            <ParameterSlider
                label="Duration (seconds)"
                value={data.duration ?? 5}
                onChange={(val) => onUpdate({ duration: val })}
                min={2}
                max={30}
                step={1}
                tooltip="Length of the generated video"
            />
            <ParameterSlider
                label="FPS"
                value={data.fps ?? 24}
                onChange={(val) => onUpdate({ fps: val })}
                min={12}
                max={60}
                step={6}
                tooltip="Frames per second"
            />
            <ParameterNumberInput
                label="Seed"
                value={data.seed ?? null}
                onChange={(val) => onUpdate({ seed: val })}
                min={0}
                max={4294967295}
                placeholder="Random"
                tooltip="Use the same seed for reproducible results"
                showRandomize
            />
        </div>
    );
}

// ---------- Action: Marketing Email ----------

function MarketingEmailConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const recipientMode = (data.recipientMode as string) === 'list' ? 'list' : 'single';

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Recipients</Label>
                <Select
                    value={recipientMode}
                    onValueChange={(val) => onUpdate({ recipientMode: val })}
                >
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="single">Single recipient</SelectItem>
                        <SelectItem value="list">List / segment (bulk)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {recipientMode === 'single' ? (
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Recipient Email</Label>
                    <Input
                        value={data.recipientEmail || ''}
                        placeholder="jane@acme.com or {{contact.email}}"
                        onChange={(e) => onUpdate({ recipientEmail: e.target.value })}
                        className="h-8 text-xs rounded-xl font-mono"
                    />
                </div>
            ) : (
                <>
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">List source</Label>
                        <Input
                            value={data.listSource || ''}
                            placeholder="{{$findRecords.records}} or {{var.recipients}}"
                            onChange={(e) => onUpdate({ listSource: e.target.value })}
                            className="h-8 text-xs rounded-xl font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            An upstream array of emails or contacts (also accepts a find-records output). Leave blank to target a tag/segment below.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">…or Tag / Segment</Label>
                        <Input
                            value={data.segmentTag || ''}
                            placeholder="Tag name or ID (e.g. newsletter)"
                            onChange={(e) => onUpdate({ segmentTag: e.target.value })}
                            className="h-8 text-xs rounded-xl"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Org-scoped CRM contacts with this tag (consent-respecting, capped at 500).
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}

// SMS action config (H16) — sends via the Twilio voice number. Destination is
// resolved from the execution's CRM contact unless an explicit `to` is set.
function SmsActionConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Message</Label>
                <Textarea
                    value={data.message || ''}
                    placeholder="Hi {{contact.firstName}}, your order shipped!"
                    onChange={(e) => onUpdate({ message: e.target.value })}
                    className="text-xs rounded-xl min-h-[80px]"
                />
                <p className="text-[10px] text-muted-foreground">
                    Supports variables. Sent over your Twilio voice number.
                </p>
            </div>
            <div className="space-y-2">
                <Label className="text-xs font-medium">To (optional)</Label>
                <Input
                    value={data.to || ''}
                    placeholder="+14155551234 (defaults to contact phone)"
                    onChange={(e) => onUpdate({ to: e.target.value })}
                    className="h-8 text-xs rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground">
                    Explicit E.164 number. Leave blank to use the contact&apos;s phone.
                </p>
            </div>
            <div className="space-y-2">
                <Label className="text-xs font-medium">From number (optional)</Label>
                <Input
                    value={data.from || ''}
                    placeholder="Auto (active brand number)"
                    onChange={(e) => onUpdate({ from: e.target.value })}
                    className="h-8 text-xs rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground">
                    Override the sender number. Blank picks an active provisioned number.
                </p>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Data transform advanced configs (H7 / TODO 2.2) — dropdown-driven row builders.
// Self-contained contiguous block; mirrors FindRecordsAdvancedConfig's
// add/remove-row idiom. Scalar fields render inline on the node; the row-based
// config (operations / aggregations) lives here in Advanced.
// ─────────────────────────────────────────────────────────────────────────────

type EditFieldRow = { op?: string; field?: string; value?: string; newName?: string };

const EDIT_FIELD_OPS: { value: string; label: string }[] = [
    { value: 'set', label: 'Set' },
    { value: 'rename', label: 'Rename' },
    { value: 'remove', label: 'Remove' },
];

function EditFieldsAdvancedConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const ops: EditFieldRow[] = Array.isArray(data.operations) ? data.operations : [];

    const update = (next: EditFieldRow[]) => onUpdate({ operations: next });
    const addRow = () => update([...ops, { op: 'set', field: '', value: '' }]);
    const removeRow = (i: number) => update(ops.filter((_, idx) => idx !== i));
    const patchRow = (i: number, patch: Partial<EditFieldRow>) =>
        update(ops.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label className="text-xs font-medium">Source (object or array)</Label>
                <Input
                    className="h-8 text-xs font-mono"
                    placeholder="$findRecords.records (empty = build new object)"
                    value={String(data.source || '')}
                    onChange={(e) => onUpdate({ source: e.target.value })}
                />
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Operations</Label>
                    <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={addRow}>
                        + Add
                    </Button>
                </div>
                {ops.length === 0 && (
                    <p className="text-[10px] text-muted-foreground">No operations — output mirrors the source.</p>
                )}
                {ops.map((row, i) => (
                    <div key={i} className="space-y-1.5 rounded-lg border border-border p-2">
                        <div className="flex gap-1.5">
                            <Select value={row.op || 'set'} onValueChange={(val) => patchRow(i, { op: val })}>
                                <SelectTrigger className="h-7 text-xs w-24">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {EDIT_FIELD_OPS.map((op) => (
                                        <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input
                                className="h-7 text-xs flex-1"
                                placeholder="field (e.g. status)"
                                value={row.field || ''}
                                onChange={(e) => patchRow(i, { field: e.target.value })}
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive shrink-0"
                                onClick={() => removeRow(i)}
                            >
                                <Trash2 className="size-3.5" />
                            </Button>
                        </div>
                        {row.op === 'set' && (
                            <Input
                                className="h-7 text-xs"
                                placeholder="value (supports {{vars}})"
                                value={row.value || ''}
                                onChange={(e) => patchRow(i, { value: e.target.value })}
                            />
                        )}
                        {row.op === 'rename' && (
                            <Input
                                className="h-7 text-xs"
                                placeholder="new field name"
                                value={row.newName || ''}
                                onChange={(e) => patchRow(i, { newName: e.target.value })}
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

type AggRowUi = { field?: string; op?: string; as?: string };

const AGG_OPS: { value: string; label: string }[] = [
    { value: 'count', label: 'Count' },
    { value: 'sum', label: 'Sum' },
    { value: 'avg', label: 'Average' },
    { value: 'min', label: 'Min' },
    { value: 'max', label: 'Max' },
    { value: 'first', label: 'First' },
    { value: 'last', label: 'Last' },
];

function AggregateAdvancedConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const rows: AggRowUi[] = Array.isArray(data.aggregations) ? data.aggregations : [];

    const update = (next: AggRowUi[]) => onUpdate({ aggregations: next });
    const addRow = () => update([...rows, { op: 'count', field: '', as: '' }]);
    const removeRow = (i: number) => update(rows.filter((_, idx) => idx !== i));
    const patchRow = (i: number, patch: Partial<AggRowUi>) =>
        update(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label className="text-xs font-medium">Source array</Label>
                <Input
                    className="h-8 text-xs font-mono"
                    placeholder="$findRecords.records"
                    value={String(data.source || '')}
                    onChange={(e) => onUpdate({ source: e.target.value })}
                />
            </div>
            <div className="space-y-1.5">
                <Label className="text-xs font-medium">Group by field (optional)</Label>
                <Input
                    className="h-8 text-xs"
                    placeholder="status (empty = single flat result)"
                    value={String(data.groupBy || '')}
                    onChange={(e) => onUpdate({ groupBy: e.target.value })}
                />
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Aggregations</Label>
                    <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={addRow}>
                        + Add
                    </Button>
                </div>
                {rows.length === 0 && (
                    <p className="text-[10px] text-muted-foreground">Add at least one aggregation (e.g. Sum of amount).</p>
                )}
                {rows.map((row, i) => (
                    <div key={i} className="space-y-1.5 rounded-lg border border-border p-2">
                        <div className="flex gap-1.5">
                            <Select value={row.op || 'count'} onValueChange={(val) => patchRow(i, { op: val })}>
                                <SelectTrigger className="h-7 text-xs w-24">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {AGG_OPS.map((op) => (
                                        <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {row.op !== 'count' && (
                                <Input
                                    className="h-7 text-xs flex-1"
                                    placeholder="field"
                                    value={row.field || ''}
                                    onChange={(e) => patchRow(i, { field: e.target.value })}
                                />
                            )}
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive shrink-0"
                                onClick={() => removeRow(i)}
                            >
                                <Trash2 className="size-3.5" />
                            </Button>
                        </div>
                        <Input
                            className="h-7 text-xs"
                            placeholder="output name (e.g. total)"
                            value={row.as || ''}
                            onChange={(e) => patchRow(i, { as: e.target.value })}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ---------- Control: Delay (2.30) ----------

const WEEKDAY_OPTIONS: { label: string; value: string }[] = [
    { label: 'Sunday', value: '0' },
    { label: 'Monday', value: '1' },
    { label: 'Tuesday', value: '2' },
    { label: 'Wednesday', value: '3' },
    { label: 'Thursday', value: '4' },
    { label: 'Friday', value: '5' },
    { label: 'Saturday', value: '6' },
];

/**
 * Delay node config (2.30): relative wait, "wait until" a datetime, "wait until"
 * a weekday+time, or business-hours-aware relative wait. All modes resolve to a
 * single `resumeAt` at execution time; the timezone applies to the scheduled
 * modes (defaults to UTC).
 */
function DelayAdvancedConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const mode = (data.mode as string) || 'relative';
    // Relative/business_hours edit a seconds value (engine stores ms).
    const durationSeconds = Math.round(Number(data.duration ?? 60000) / 1000);

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Mode</Label>
                <Select value={mode} onValueChange={(val) => onUpdate({ mode: val })}>
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="relative">Wait for a duration</SelectItem>
                        <SelectItem value="until_datetime">Wait until a date &amp; time</SelectItem>
                        <SelectItem value="until_weekday_time">Wait until a weekday &amp; time</SelectItem>
                        <SelectItem value="business_hours">Wait, snap to business hours</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {(mode === 'relative' || mode === 'business_hours') && (
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Duration (seconds)</Label>
                    <Input
                        type="number"
                        min={0}
                        value={durationSeconds}
                        onChange={(e) => onUpdate({ duration: Math.max(0, Number(e.target.value) || 0) * 1000 })}
                        className="h-8 text-xs rounded-xl"
                    />
                    <p className="text-[10px] text-muted-foreground">
                        {mode === 'business_hours'
                            ? 'Wait this long, then if it lands outside the window below, push to the next window start.'
                            : 'How long to pause before continuing.'}
                    </p>
                </div>
            )}

            {mode === 'until_datetime' && (
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Resume at (ISO datetime)</Label>
                    <Input
                        value={(data.datetime as string) || ''}
                        placeholder="2026-12-31T09:00 or {{trigger.scheduledFor}}"
                        onChange={(e) => onUpdate({ datetime: e.target.value })}
                        className="h-8 text-xs rounded-xl font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                        Supports {'{{variables}}'}. Without a timezone offset, the time is read in the timezone below.
                    </p>
                </div>
            )}

            {mode === 'until_weekday_time' && (
                <>
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">Weekday</Label>
                        <Select
                            value={String(data.weekday ?? '1')}
                            onValueChange={(val) => onUpdate({ weekday: Number(val) })}
                        >
                            <SelectTrigger className="h-8 text-xs rounded-xl">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {WEEKDAY_OPTIONS.map((d) => (
                                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">Time (HH:mm)</Label>
                        <Input
                            type="time"
                            value={(data.time as string) || '09:00'}
                            onChange={(e) => onUpdate({ time: e.target.value })}
                            className="h-8 text-xs rounded-xl"
                        />
                        <p className="text-[10px] text-muted-foreground">Resumes at the next occurrence.</p>
                    </div>
                </>
            )}

            {mode === 'business_hours' && (
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">Window start</Label>
                        <Input
                            type="time"
                            value={(data.windowStart as string) || '09:00'}
                            onChange={(e) => onUpdate({ windowStart: e.target.value })}
                            className="h-8 text-xs rounded-xl"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">Window end</Label>
                        <Input
                            type="time"
                            value={(data.windowEnd as string) || '17:00'}
                            onChange={(e) => onUpdate({ windowEnd: e.target.value })}
                            className="h-8 text-xs rounded-xl"
                        />
                    </div>
                    <p className="col-span-2 text-[10px] text-muted-foreground">Mon–Fri only.</p>
                </div>
            )}

            {mode !== 'relative' && (
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Timezone</Label>
                    <Select
                        value={(data.timezone as string) || 'UTC'}
                        onValueChange={(val) => onUpdate({ timezone: val })}
                    >
                        <SelectTrigger className="h-8 text-xs rounded-xl">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {TIMEZONES.map((tz) => (
                                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.10 — Slack / Gmail / Google Sheets node config forms.
// ─────────────────────────────────────────────────────────────────────────────

function SlackActionConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Channel</Label>
                <Input
                    value={data.channel || ''}
                    placeholder="#general or C0123456789"
                    onChange={(e) => onUpdate({ channel: e.target.value })}
                    className="h-8 text-xs rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground">
                    Channel name (#general) or id. Uses your connected Slack workspace.
                </p>
            </div>
            <div className="space-y-2">
                <Label className="text-xs font-medium">Message</Label>
                <Textarea
                    value={data.text || ''}
                    placeholder="New lead: {{contact.name}}"
                    onChange={(e) => onUpdate({ text: e.target.value })}
                    className="text-xs rounded-xl min-h-[80px]"
                />
                <p className="text-[10px] text-muted-foreground">Supports variables.</p>
            </div>
            <div className="space-y-2">
                <Label className="text-xs font-medium">Block Kit blocks (optional)</Label>
                <Textarea
                    value={data.blocks || ''}
                    placeholder='[{"type":"section","text":{"type":"mrkdwn","text":"Hi"}}]'
                    onChange={(e) => onUpdate({ blocks: e.target.value })}
                    className="text-xs rounded-xl min-h-[64px] font-mono"
                />
                <p className="text-[10px] text-muted-foreground">JSON array of Block Kit blocks.</p>
            </div>
        </div>
    );
}

function GmailActionConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">To</Label>
                <Input
                    value={data.to || ''}
                    placeholder="lead@example.com, other@example.com"
                    onChange={(e) => onUpdate({ to: e.target.value })}
                    className="h-8 text-xs rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground">Comma-separated recipients. Supports variables.</p>
            </div>
            <div className="space-y-2">
                <Label className="text-xs font-medium">Subject</Label>
                <Input
                    value={data.subject || ''}
                    placeholder="Thanks for reaching out"
                    onChange={(e) => onUpdate({ subject: e.target.value })}
                    className="h-8 text-xs rounded-xl"
                />
            </div>
            <div className="space-y-2">
                <Label className="text-xs font-medium">Body</Label>
                <Textarea
                    value={data.body || ''}
                    placeholder="Hi {{contact.firstName}}, ..."
                    onChange={(e) => onUpdate({ body: e.target.value })}
                    className="text-xs rounded-xl min-h-[100px]"
                />
                <p className="text-[10px] text-muted-foreground">Plain text. Use the HTML field for rich email.</p>
            </div>
        </div>
    );
}

const SHEETS_ACTIONS: { value: string; label: string }[] = [
    { value: 'append_row', label: 'Append row' },
    { value: 'update_row', label: 'Update row' },
    { value: 'upsert_row', label: 'Upsert row (match → update / append)' },
    { value: 'lookup_rows', label: 'Look up rows (match)' },
    { value: 'read', label: 'Read range' },
];

function SheetsActionConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const action = (data.action as string) || 'append_row';
    const showValues = action === 'append_row' || action === 'update_row' || action === 'upsert_row';
    const showMatch = action === 'upsert_row' || action === 'lookup_rows' || action === 'update_row';
    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Action</Label>
                <Select value={action} onValueChange={(val) => onUpdate({ action: val })}>
                    <SelectTrigger className="h-8 text-xs rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SHEETS_ACTIONS.map((a) => (
                            <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label className="text-xs font-medium">Spreadsheet ID</Label>
                <Input
                    value={data.spreadsheetId || ''}
                    placeholder="1AbC...XyZ"
                    onChange={(e) => onUpdate({ spreadsheetId: e.target.value })}
                    className="h-8 text-xs rounded-xl font-mono"
                />
            </div>
            <div className="space-y-2">
                <Label className="text-xs font-medium">Range (A1)</Label>
                <Input
                    value={data.range || ''}
                    placeholder="Sheet1!A:D"
                    onChange={(e) => onUpdate({ range: e.target.value })}
                    className="h-8 text-xs rounded-xl font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                    Include the header row for match-based actions.
                </p>
            </div>
            {showMatch && (
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">Match column</Label>
                        <Input
                            value={data.matchColumn || ''}
                            placeholder="Email"
                            onChange={(e) => onUpdate({ matchColumn: e.target.value })}
                            className="h-8 text-xs rounded-xl"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-medium">Match value</Label>
                        <Input
                            value={data.matchValue || ''}
                            placeholder="{{contact.email}}"
                            onChange={(e) => onUpdate({ matchValue: e.target.value })}
                            className="h-8 text-xs rounded-xl"
                        />
                    </div>
                </div>
            )}
            {showValues && (
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Values</Label>
                    <Textarea
                        value={data.values || ''}
                        placeholder='[["Ada","ada@example.com"]]'
                        onChange={(e) => onUpdate({ values: e.target.value })}
                        className="text-xs rounded-xl min-h-[64px] font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                        JSON: 2-D array for append/update, single row for upsert. Supports variable refs.
                    </p>
                </div>
            )}
        </div>
    );
}

// Agent ↔ workflow ties (2.26) — delegate-to-agent advanced config.
function DelegateToAgentAdvancedConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label className="text-xs font-medium">Task instruction</Label>
                <Textarea
                    placeholder="e.g. Follow up with this lead and book a demo."
                    value={data.task || ''}
                    onChange={(e) => onUpdate({ task: e.target.value })}
                    className="min-h-[70px] text-xs resize-none rounded-xl"
                    rows={3}
                />
                <p className="text-[10px] text-muted-foreground">Handed to the agent. Supports variable refs.</p>
            </div>
            <div className="space-y-2">
                <Label className="text-xs font-medium">Context data (optional)</Label>
                <Input
                    placeholder="$findRecord.record"
                    value={data.contextData || ''}
                    onChange={(e) => onUpdate({ contextData: e.target.value })}
                    className="h-8 text-xs rounded-lg"
                />
                <p className="text-[10px] text-muted-foreground">Path/expression to upstream data attached to the mission as supporting context.</p>
            </div>
            <div className="space-y-2">
                <Label className="text-xs font-medium">Agent ID (optional)</Label>
                <Input
                    placeholder="Leave blank for the general agent"
                    value={data.agentId || ''}
                    onChange={(e) => onUpdate({ agentId: e.target.value })}
                    className="h-8 text-xs rounded-lg"
                />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Logic: Branch (If / Switch) condition builder (TODO 2.27)
//
// Deterministic field/operator/value rows are the DEFAULT. The rows compile to a
// single boolean expression string written to `data.condition` — exactly what
// the engine's `executeBranchNode` evaluates via `evaluateExpression`. The raw
// rows are also persisted to `data.conditionRows` so the builder re-hydrates on
// reopen (the engine ignores that key).
//
// AI / natural-language routing is an explicit opt-in (`data.isNaturalLanguage`)
// and is labelled as credit-consuming — the engine routes the NL branch through
// `runMeteredWorkflowAI`, which charges the owning org's AI credits.
//
// Field references must use a prefix the resolver understands in operator-mode:
// `trigger.…`, `variables.…`, `vars.…`, `system.…` or `$nodeId.…`. The bare
// `contact.`/`deal.` shortcuts only resolve in simple (operator-free) mode, so
// the builder nudges users toward `trigger.contact.…`.
// ─────────────────────────────────────────────────────────────────────────────

type ConditionRow = { field?: string; operator?: string; value?: string };

const BRANCH_OPERATORS: { value: string; label: string; needsValue: boolean }[] = [
    { value: 'equals', label: 'equals', needsValue: true },
    { value: 'not_equals', label: 'not equals', needsValue: true },
    { value: 'contains', label: 'contains', needsValue: true },
    { value: 'greater_than', label: 'greater than', needsValue: true },
    { value: 'less_than', label: 'less than', needsValue: true },
    { value: 'is_set', label: 'is set', needsValue: false },
    { value: 'is_empty', label: 'is empty', needsValue: false },
];

/** Quote a value as a JS literal: bare numbers/booleans pass through, else string. */
function toConditionLiteral(value: string): string {
    const trimmed = (value ?? '').trim();
    if (trimmed === '') return '""';
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed; // number
    if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null') return trimmed;
    // String literal — escape via JSON so quotes/newlines are safe.
    return JSON.stringify(trimmed);
}

/** Compile a single row into a boolean expression fragment. */
function compileConditionRow(row: ConditionRow): string {
    const field = (row.field || '').trim();
    if (!field) return '';
    const op = row.operator || 'equals';
    const lit = toConditionLiteral(row.value || '');
    switch (op) {
        case 'equals': return `${field} == ${lit}`;
        case 'not_equals': return `${field} != ${lit}`;
        case 'contains': return `${field}.includes(${lit})`;
        case 'greater_than': return `${field} > ${lit}`;
        case 'less_than': return `${field} < ${lit}`;
        case 'is_set': return `${field} != null`;
        case 'is_empty': return `(${field} == null || ${field} == "")`;
        default: return `${field} == ${lit}`;
    }
}

/** Compile all rows into the single expression the engine evaluates. */
function compileConditionRows(rows: ConditionRow[], conjunction: string): string {
    const frags = rows.map(compileConditionRow).filter(Boolean);
    if (frags.length === 0) return '';
    const joiner = conjunction === 'or' ? ' || ' : ' && ';
    return frags.map((f) => (frags.length > 1 ? `(${f})` : f)).join(joiner);
}

function BranchConfig({ node, onUpdate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void }) {
    const data = node.data || {};
    const isNL = !!data.isNaturalLanguage;
    const conjunction = (data.conjunction as string) === 'or' ? 'or' : 'and';
    const rows: ConditionRow[] = Array.isArray(data.conditionRows) && data.conditionRows.length > 0
        ? (data.conditionRows as ConditionRow[])
        : [{ field: '', operator: 'equals', value: '' }];

    // Persist the structured rows AND the compiled `condition` string the engine reads.
    const commitRows = (next: ConditionRow[], conj: string = conjunction) => {
        onUpdate({
            conditionRows: next,
            conjunction: conj,
            condition: compileConditionRows(next, conj),
        });
    };
    const addRow = () => commitRows([...rows, { field: '', operator: 'equals', value: '' }]);
    const removeRow = (i: number) => {
        const next = rows.filter((_, idx) => idx !== i);
        commitRows(next.length > 0 ? next : [{ field: '', operator: 'equals', value: '' }]);
    };
    const patchRow = (i: number, patch: Partial<ConditionRow>) =>
        commitRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

    const needsValue = (op?: string) => BRANCH_OPERATORS.find((o) => o.value === op)?.needsValue ?? true;
    const compiled = compileConditionRows(rows, conjunction);

    return (
        <div className="space-y-4">
            {/* Mode toggle: deterministic (default) vs AI */}
            <div className="flex items-center justify-between rounded-lg border border-border p-2.5">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                        <Label className="text-xs font-medium">AI condition</Label>
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-brand/10 px-1.5 py-0.5 text-[9px] font-semibold text-brand">
                            <Sparkles className="size-2.5" /> Uses credits
                        </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        Evaluate a plain-English condition with AI (consumes AI credits per run).
                    </p>
                </div>
                <Switch checked={isNL} onCheckedChange={(v) => onUpdate({ isNaturalLanguage: v })} />
            </div>

            {isNL ? (
                <div className="space-y-2">
                    <Label className="text-xs font-medium">Describe the condition</Label>
                    <Textarea
                        value={(data.naturalLanguagePrompt as string) || ''}
                        placeholder="e.g. the contact seems frustrated or is asking to cancel"
                        onChange={(e) => onUpdate({ naturalLanguagePrompt: e.target.value })}
                        className="min-h-[80px] text-xs rounded-xl resize-none"
                    />
                    <p className="text-[10px] text-muted-foreground">
                        The AI returns true/false; the workflow follows the matching path. Each evaluation
                        charges your AI credits — prefer the deterministic builder when an exact rule works.
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Conditions</Label>
                        {rows.length > 1 && (
                            <Select value={conjunction} onValueChange={(val) => commitRows(rows, val)}>
                                <SelectTrigger className="h-6 w-20 text-[11px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="and">Match ALL</SelectItem>
                                    <SelectItem value="or">Match ANY</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {rows.map((row, i) => (
                        <div key={i} className="space-y-1.5 rounded-lg border border-border p-2">
                            <div className="flex gap-1.5">
                                <Input
                                    className="h-7 text-xs flex-1 font-mono"
                                    placeholder="trigger.contact.status"
                                    value={row.field || ''}
                                    onChange={(e) => patchRow(i, { field: e.target.value })}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-destructive shrink-0"
                                    onClick={() => removeRow(i)}
                                >
                                    <Trash2 className="size-3.5" />
                                </Button>
                            </div>
                            <div className="flex gap-1.5">
                                <Select value={row.operator || 'equals'} onValueChange={(val) => patchRow(i, { operator: val })}>
                                    <SelectTrigger className="h-7 text-xs w-32">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {BRANCH_OPERATORS.map((op) => (
                                            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {needsValue(row.operator) && (
                                    <Input
                                        className="h-7 text-xs flex-1"
                                        placeholder="value (supports {{vars}})"
                                        value={row.value || ''}
                                        onChange={(e) => patchRow(i, { value: e.target.value })}
                                    />
                                )}
                            </div>
                        </div>
                    ))}

                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addRow}>
                        + Add condition
                    </Button>

                    <p className="text-[10px] text-muted-foreground">
                        Reference fields with <code className="font-mono">trigger.</code>, <code className="font-mono">variables.</code>,{' '}
                        <code className="font-mono">vars.</code> or a node ref like <code className="font-mono">$nodeId.field</code>.
                        The TRUE path leaves the green handle; FALSE leaves the other.
                    </p>
                    {compiled && (
                        <div className="rounded-lg bg-muted/40 p-2">
                            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Compiled expression</p>
                            <code className="block text-[10px] font-mono break-words text-foreground">{compiled}</code>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Map node types to their advanced config components
const ADVANCED_CONFIG_MAP: Record<string, React.FC<{ node: Node; onUpdate: (data: Record<string, unknown>) => void }>> = {
    promptNode: PromptAdvancedConfig,
    logicBranch: BranchConfig,
    slackNode: SlackActionConfig,
    gmailNode: GmailActionConfig,
    sheetsNode: SheetsActionConfig,
    logicDelay: DelayAdvancedConfig,
    actionMarketingEmail: MarketingEmailConfig,
    generateImage: GenerateImageAdvancedConfig,
    generateVideo: GenerateVideoAdvancedConfig,
    websiteNode: WebsiteAdvancedConfig,
    textInput: TextInputAdvancedConfig,
    crmFindRecords: FindRecordsAdvancedConfig,
    // Data transform (H7 / TODO 2.2) — row-based builders.
    editFieldsNode: EditFieldsAdvancedConfig,
    aggregateNode: AggregateAdvancedConfig,
    triggerWebhook: WebhookTriggerConfig,
    triggerSchedule: ScheduleTriggerConfig,
    triggerManual: ManualTriggerConfig,
    triggerTelegram: TelegramTriggerConfig,
    triggerWhatsApp: WhatsAppTriggerConfig,
    actionWhatsApp: WhatsAppActionConfig,
    actionWhatsAppButtons: WhatsAppInteractiveConfig,
    actionWhatsAppList: WhatsAppInteractiveConfig,
    actionSms: SmsActionConfig,
    triggerEmail: EmailTriggerConfig,
    triggerFormSubmission: FormSubmissionTriggerConfig,
    triggerPolling: PollingTriggerConfig,
    triggerSocial: SocialTriggerConfig,
    triggerKeyword: KeywordTriggerConfig,
    triggerAdsWeeklySummary: AdsPerformanceTriggerConfig,
    triggerAdsBudgetThreshold: AdsPerformanceTriggerConfig,
    triggerAdsPerformanceAnomaly: AdsPerformanceTriggerConfig,
    adsInsightsNode: AdsInsightsConfig,
    marketingAnalyticsNode: MarketingAnalyticsConfig,
    delegateToAgentNode: DelegateToAgentAdvancedConfig,
};

// Core node types that have advanced settings
export const NODES_WITH_ADVANCED = new Set(Object.keys(ADVANCED_CONFIG_MAP));

// ─────────────────────────────────────────────────────────────────────────────
// Main Sidebar Component
// ─────────────────────────────────────────────────────────────────────────────

function NodeConfigSidebar({
    selectedNode,
    onClose,
    onDelete,
    onDuplicate,
    onUpdateNodeData,
}: NodeConfigSidebarProps) {
    const nodeInfo = useMemo(() => {
        if (!selectedNode) return null;
        const nodeType = selectedNode.type || '';
        return NODE_TYPE_INFO[nodeType] || {
            name: nodeType || 'Unknown',
            description: 'Custom node',
            color: 'gray',
        };
    }, [selectedNode]);

    // Lightweight validation (2.14) — warn, never block. Recomputed on every
    // data change so it tracks autosave. Delay datetime has its own check.
    const validationErrors = useMemo(() => {
        if (!selectedNode) return {} as Record<string, string>;
        const nodeType = selectedNode.type || '';
        const data = (selectedNode.data || {}) as NodeData;
        const base = validateNodeConfig(nodeType, data);
        if (nodeType === 'logicDelay') Object.assign(base, validateDelayDatetime(data));
        return base;
    }, [selectedNode]);
    const errorEntries = Object.entries(validationErrors);

    if (!selectedNode) {
        return null;
    }

    const AdvancedConfig = selectedNode.type ? ADVANCED_CONFIG_MAP[selectedNode.type] : undefined;

    const handleUpdate = (data: Record<string, unknown>) => {
        onUpdateNodeData(selectedNode.id, data);
    };

    return (
        <div className="w-80 h-full bg-background border-l border-border flex flex-col shadow-xl animate-in slide-in-from-right-5 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                    <Settings2 className="size-4 text-muted-foreground" />
                    <span className="font-semibold text-sm">Advanced Settings</span>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={onClose}
                >
                    <X className="size-4" />
                </Button>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                    {/* Node type badge */}
                    <div className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium ${COLOR_CLASSES[nodeInfo?.color || 'gray']}`}>
                        {nodeInfo?.name || 'Unknown Node'}
                    </div>

                    {/* Description */}
                    <p className="text-sm text-muted-foreground">
                        {nodeInfo?.description || 'Configure this node'}
                    </p>

                    <Separator />

                    {/* Validation warnings (2.14) — non-blocking; autosave still runs. */}
                    {errorEntries.length > 0 && (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 space-y-1">
                            <div className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
                                <AlertCircle className="size-3.5 shrink-0" />
                                {errorEntries.length === 1 ? '1 field needs attention' : `${errorEntries.length} fields need attention`}
                            </div>
                            <ul className="space-y-0.5 pl-5">
                                {errorEntries.map(([field, message]) => (
                                    <li key={field} className="list-disc text-[10px] text-destructive">{message}</li>
                                ))}
                            </ul>
                            <p className="text-[9px] text-muted-foreground pl-5">
                                Your changes are still saved — fix before running for reliable results.
                            </p>
                        </div>
                    )}

                    {/* Type-Specific Advanced Configuration */}
                    {AdvancedConfig ? (
                        <div className="space-y-2">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Parameters</span>
                            <AdvancedConfig node={selectedNode} onUpdate={handleUpdate} />
                        </div>
                    ) : (
                        <div className="rounded-lg border border-dashed border-border p-4 text-center">
                            <p className="text-xs text-muted-foreground">
                                No advanced settings available for this node type.
                            </p>
                        </div>
                    )}

                    <Separator />

                    {/* Common: Pinned sample data (1.9 test loop) — trigger + action/source nodes */}
                    <div className="space-y-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Test data</span>
                        <PinnedDataCommonConfig node={selectedNode} onUpdate={handleUpdate} />
                    </div>
                    <Separator />

                    {/* Common: Run once per item (any non-trigger node can fan out) */}
                    {!String(selectedNode.type || '').startsWith('trigger') && (
                        <>
                            <div className="space-y-2">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Iteration</span>
                                <ForEachCommonConfig node={selectedNode} onUpdate={handleUpdate} />
                            </div>
                            <Separator />
                            <div className="space-y-2">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Error handling</span>
                                <ErrorHandlingCommonConfig node={selectedNode} onUpdate={handleUpdate} />
                            </div>
                            <Separator />
                        </>
                    )}

                    {/* Node ID (for debugging/reference) */}
                    <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Node ID</span>
                        <code className="block text-xs bg-muted px-2 py-1 rounded font-mono truncate">
                            {selectedNode.id}
                        </code>
                    </div>

                    <Separator />

                    {/* Actions */}
                    <div className="space-y-2">
                        <span className="text-xs font-medium text-muted-foreground">Actions</span>
                        <div className="flex gap-2">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1"
                                            onClick={() => onDuplicate(selectedNode.id)}
                                        >
                                            <Copy className="size-4 mr-2" />
                                            Duplicate
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Duplicate this node</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-destructive hover:text-destructive flex-1"
                                            onClick={() => onDelete(selectedNode.id)}
                                        >
                                            <Trash2 className="size-4 mr-2" />
                                            Delete
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete this node</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    </div>

                    {/* Output Preview */}
                    {selectedNode.data?.text && (
                        <>
                            <Separator />
                            <div className="space-y-2">
                                <span className="text-xs font-medium text-muted-foreground">Output Preview</span>
                                <div className="rounded-lg border border-border p-3 bg-muted/30 max-h-40 overflow-y-auto">
                                    <p className="text-xs text-foreground whitespace-pre-wrap break-words">
                                        {selectedNode.data.text.slice(0, 500)}
                                        {selectedNode.data.text.length > 500 && '...'}
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

export default memo(NodeConfigSidebar);
