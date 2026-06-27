'use client';

import { Button } from '@/components/ui/button';
import {
    CheckCircle2, AlertCircle, ExternalLink, Users, BarChart3,
    FileText, Brain, Calendar, Workflow, Clock
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ToolResultProps {
    toolName: string;
    success: boolean;
    message?: string;
    deepLink?: string;
}

const TOOL_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    createContact: { label: 'Contact Created', icon: Users, color: 'border-blue-500/20 bg-blue-500/[0.08] text-blue-700 dark:bg-blue-500/10 dark:text-blue-200' },
    getContact: { label: 'Contact Found', icon: Users, color: 'border-blue-500/20 bg-blue-500/[0.08] text-blue-700 dark:bg-blue-500/10 dark:text-blue-200' },
    createDeal: { label: 'Deal Created', icon: BarChart3, color: 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' },
    updateDealStage: { label: 'Deal Updated', icon: BarChart3, color: 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' },
    getDealsPipeline: { label: 'Pipeline Loaded', icon: BarChart3, color: 'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' },
    searchKnowledgeBase: { label: 'KB Searched', icon: Brain, color: 'border-violet-500/20 bg-violet-500/[0.08] text-violet-700 dark:bg-violet-500/10 dark:text-violet-200' },
    addToKnowledgeBase: { label: 'Saved to Memory', icon: Brain, color: 'border-violet-500/20 bg-violet-500/[0.08] text-violet-700 dark:bg-violet-500/10 dark:text-violet-200' },
    schedulePost: { label: 'Draft Created', icon: Calendar, color: 'border-fuchsia-500/20 bg-fuchsia-500/[0.08] text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-200' },
    getAnalytics: { label: 'Analytics Loaded', icon: BarChart3, color: 'border-cyan-500/20 bg-cyan-500/[0.08] text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200' },
    triggerWorkflow: { label: 'Workflow Triggered', icon: Workflow, color: 'border-amber-500/20 bg-amber-500/[0.08] text-amber-700 dark:bg-amber-500/10 dark:text-amber-200' },
    getCurrentDate: { label: 'Date Retrieved', icon: Clock, color: 'border-slate-400/20 bg-slate-400/[0.08] text-slate-700 dark:bg-slate-400/10 dark:text-slate-200' },
};

/**
 * Renders a compact inline card for a tool execution result.
 * Shows status (✅/❌), tool name, and a deep link if available.
 */
export function ToolResultCard({ toolName, success, message, deepLink }: ToolResultProps) {
    const config = TOOL_CONFIG[toolName] || { label: toolName, icon: FileText, color: 'border-border/70 bg-background/70 text-muted-foreground' };
    const Icon = config.icon;

    return (
        <div className={cn(
            'my-2 flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-xs shadow-sm backdrop-blur-sm',
            config.color
        )}>
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-black/5 dark:bg-black/10">
                {success ? (
                    <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-300" />
                ) : (
                    <AlertCircle className="size-3.5 text-rose-600 dark:text-rose-300" />
                )}
            </div>
            <Icon className="size-3.5 shrink-0 opacity-90" />
            <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{config.label}</div>
                {message && <div className="truncate text-[10px] opacity-75">{message}</div>}
            </div>
            {deepLink && (
                <Link href={deepLink}>
                    <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 rounded-md px-2 text-[10px] text-current hover:bg-black/5 hover:text-current dark:hover:bg-white/10">
                        <ExternalLink className="size-3" /> View
                    </Button>
                </Link>
            )}
        </div>
    );
}

/**
 * Parses a message string and extracts tool result markers.
 * Tool results in the LLM response follow patterns like:
 * - "Contact Xyz created successfully." → createContact
 * - "Draft created:" → schedulePost
 * - "Deal moved to" → updateDealStage
 * etc.
 * 
 * Returns an array of detected tool results for inline rendering.
 */
export function detectToolResults(text: string): ToolResultProps[] {
    const results: ToolResultProps[] = [];

    // Pattern matching for tool result signatures
    const patterns: { regex: RegExp; toolName: string; deepLink?: string }[] = [
        { regex: /Contact .+ created successfully/i, toolName: 'createContact', deepLink: '/crm/contacts' },
        { regex: /Deal ".*" created successfully/i, toolName: 'createDeal', deepLink: '/crm/deals' },
        { regex: /Deal moved to ".*" stage/i, toolName: 'updateDealStage', deepLink: '/crm/deals' },
        { regex: /Deal marked as Won/i, toolName: 'updateDealStage', deepLink: '/crm/deals' },
        { regex: /Draft created:/i, toolName: 'schedulePost', deepLink: '/social/drafts' },
        { regex: /saved to Brand Memory/i, toolName: 'addToKnowledgeBase', deepLink: '/settings?tab=brand-memory' },
        { regex: /Workflow .* triggered/i, toolName: 'triggerWorkflow', deepLink: '/canvas' },
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern.regex);
        if (match) {
            results.push({
                toolName: pattern.toolName,
                success: true,
                message: match[0],
                deepLink: pattern.deepLink,
            });
        }
    }

    return results;
}
