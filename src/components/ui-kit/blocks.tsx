'use client';

/**
 * ui-kit · blocks — composite, prop-driven sections (kanban, feeds, chat, nodes).
 *
 * Ported from the v0.6 design mockup (removed) components/blocks.jsx.
 * Built on the kit primitives + surfaces. Icons via lucide.
 */

import * as React from 'react';
import { Calendar, Check, Circle, Image as ImageIcon, Link as LinkIcon, MessageCircle, Phone, Send, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Avatar, Chip, Spinner, type ChipTone } from './primitives';
import { KpiTile, type KpiTileProps } from './surfaces';

/* ----------------------------------------------------------------- KpiRow */

export interface KpiRowProps {
  items?: KpiTileProps[];
  cols?: number;
  className?: string;
}

export function KpiRow({ items = [], cols = 4, className }: KpiRowProps) {
  return (
    <div className={cn('grid gap-3', className)} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {items.map((k, i) => (
        <KpiTile key={i} {...k} />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- DealCard */

export interface Deal {
  name: string;
  company: string;
  value: number;
  close?: string;
  owner?: string;
  prob?: number;
}

const fmtCurrency = (n: number) => (n >= 1000 ? '$' + (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : '$' + n);

export interface DealCardProps extends React.HTMLAttributes<HTMLDivElement> {
  deal: Deal;
  tone?: string;
}

export function DealCard({ deal, tone = 'hsl(var(--brand))', className, ...rest }: DealCardProps) {
  return (
    <div
      className={cn('cursor-grab rounded-lg border border-border bg-card p-3 shadow-card active:cursor-grabbing', className)}
      {...rest}
    >
      <div className="text-[13px] font-semibold leading-snug">{deal.name}</div>
      <div className="mt-2 flex items-center gap-1.5">
        <Avatar name={deal.company} size={18} square />
        <span className="text-xs text-muted-foreground">{deal.company}</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="font-mono text-sm font-bold tabular-nums">{fmtCurrency(deal.value)}</span>
        <span className="flex items-center gap-1.5">
          {deal.close ? (
            <Chip tone="gray" icon={Calendar} className="h-[19px] text-[11px]">
              {deal.close}
            </Chip>
          ) : null}
          {deal.owner ? <Avatar name={deal.owner} size={20} /> : null}
        </span>
      </div>
      {deal.prob != null ? (
        <span className="mt-2.5 block h-1 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full" style={{ width: `${deal.prob}%`, background: tone }} />
        </span>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- PipelineColumn */

export interface PipelineStage {
  name: string;
  tone: string;
}

export interface PipelineColumnProps {
  stage: PipelineStage;
  total?: React.ReactNode;
  count?: number;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  dragActive?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function PipelineColumn({ stage, total, count, onDrop, dragActive, className, children }: PipelineColumnProps) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={cn('flex w-[248px] shrink-0 flex-col rounded-xl transition-colors', dragActive && 'bg-muted/60', className)}
    >
      <div className="flex items-center justify-between px-2 pb-2.5 pt-2">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[3px]" style={{ background: stage.tone }} />
          <span className="text-[13px] font-semibold">{stage.name}</span>
          {count != null ? <span className="font-mono text-xs text-muted-foreground">{count}</span> : null}
        </span>
        {total ? <span className="font-mono text-xs text-muted-foreground">{total}</span> : null}
      </div>
      <div className="flex flex-col gap-2 px-1">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------ ActivityItem */

export type ActivityTone = 'brand' | 'info' | 'ok' | 'purple' | 'warn' | 'gray';

export interface Activity {
  who: string;
  action: string;
  target: string;
  meta?: string;
  time: string;
  icon: LucideIcon;
  tone?: ActivityTone;
}

const ACTIVITY_TONE: Record<ActivityTone, ChipTone> = {
  brand: 'brand',
  info: 'info',
  ok: 'ok',
  purple: 'purple',
  warn: 'warn',
  gray: 'gray',
};

export function ActivityItem({ a, className }: { a: Activity; className?: string }) {
  const Icon = a.icon;
  return (
    <div className={cn('flex items-start gap-2.5 border-b border-border py-2.5 last:border-0', className)}>
      <Chip tone={ACTIVITY_TONE[a.tone ?? 'gray']} className="h-[26px] w-[26px] justify-center rounded-lg !px-0">
        <Icon className="size-3.5" />
      </Chip>
      <div className="min-w-0 flex-1 text-[13px] leading-snug">
        <span className="font-semibold">{a.who}</span> <span className="text-muted-foreground">{a.action}</span>{' '}
        <span className="font-medium">{a.target}</span> {a.meta ? <span className="text-muted-foreground/70">{a.meta}</span> : null}
      </div>
      <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">{a.time}</span>
    </div>
  );
}

/* ------------------------------------------------------------- ChatBubble */

export interface ChatBubbleProps {
  dir?: 'in' | 'out';
  time?: React.ReactNode;
  variant?: 'default' | 'whatsapp';
  meta?: React.ReactNode;
  /** WhatsApp-style CTA button rows under the bubble body. */
  buttons?: string[];
  className?: string;
  children?: React.ReactNode;
}

export function ChatBubble({ dir = 'in', time, variant = 'default', meta, buttons, className, children }: ChatBubbleProps) {
  const out = dir === 'out';
  const wa = variant === 'whatsapp';
  return (
    <div className={cn('flex max-w-[80%] flex-col', out ? 'items-end self-end' : 'items-start self-start', className)}>
      <div
        className={cn(
          'rounded-2xl px-3 py-2 text-[13.5px] leading-relaxed shadow-sm',
          out
            ? wa
              ? 'rounded-br-sm bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]'
              : 'rounded-br-sm bg-brand text-brand-foreground'
            : wa
              ? 'rounded-bl-sm bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]'
              : 'rounded-bl-sm border border-border bg-card',
        )}
      >
        {children}
        {buttons && buttons.length > 0 ? (
          <div className="-mx-3 -mb-2 mt-1.5 flex flex-col gap-px">
            {buttons.map((b, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-center gap-1.5 border-t py-2 text-center text-[13px] font-medium',
                  wa
                    ? 'border-[#e9edef] text-[#00a5f4] dark:border-white/10 dark:text-[#53bdeb]'
                    : 'border-border text-brand-strong',
                )}
              >
                <LinkIcon className="h-[13px] w-[13px]" />
                {b}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {time || meta ? <div className="mt-1 px-1 text-[10.5px] text-muted-foreground">{meta}{time}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------- ChatMessage */

export interface ChatMessageProps extends Omit<ChatBubbleProps, 'children'> {
  /** Sender name shown above the bubble. */
  name?: React.ReactNode;
  /** Avatar source name (initials/color derived) — hidden when omitted. */
  avatarName?: string;
  avatarSrc?: string;
  /** Badge next to the name (specialist tag, role chip). */
  badge?: React.ReactNode;
  children?: React.ReactNode;
}

/** Full message row: avatar + name/badge header + ChatBubble. */
export function ChatMessage({
  name,
  avatarName,
  avatarSrc,
  badge,
  dir = 'in',
  className,
  children,
  ...bubble
}: ChatMessageProps) {
  const out = dir === 'out';
  return (
    <div className={cn('flex w-full gap-2.5', out && 'flex-row-reverse', className)}>
      {avatarName || avatarSrc ? <Avatar name={avatarName} src={avatarSrc} size={28} /> : null}
      <div className={cn('flex min-w-0 max-w-full flex-1 flex-col', out ? 'items-end' : 'items-start')}>
        {name || badge ? (
          <div className={cn('mb-1 flex items-center gap-1.5 px-0.5', out && 'flex-row-reverse')}>
            {name ? <span className="text-[12px] font-semibold">{name}</span> : null}
            {badge}
          </div>
        ) : null}
        <ChatBubble dir={dir} className="max-w-full" {...bubble}>
          {children}
        </ChatBubble>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- WaPhonePreview */

export interface WaPhonePreviewProps {
  account?: string;
  head?: React.ReactNode;
  body?: React.ReactNode;
  buttons?: string[];
  media?: boolean;
  time?: string;
  className?: string;
}

export function WaPhonePreview({ account = 'Acme Corp', head, body, buttons = [], media, time = '12:04', className }: WaPhonePreviewProps) {
  return (
    <div className={cn('w-[300px] shrink-0 rounded-[30px] bg-gradient-to-b from-zinc-800 to-zinc-900 p-2.5 shadow-xl', className)}>
      <div className="flex h-[540px] flex-col overflow-hidden rounded-[22px] bg-[#e7ddd3] dark:bg-[#0b141a]">
        <div className="flex items-center gap-2.5 bg-[#075e54] px-3.5 py-3 text-white dark:bg-[#1f2c33]">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-white/20">
            <MessageCircle className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-tight">{account}</div>
            <div className="text-[11px] opacity-80">business account</div>
          </div>
          <Phone className="h-[17px] w-[17px] opacity-85" />
        </div>
        <div
          className="flex flex-1 flex-col gap-2 overflow-y-auto p-3.5"
          style={{ backgroundImage: 'radial-gradient(rgba(120,120,90,0.12) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
        >
          <div className="max-w-[88%] self-end rounded-[9px] rounded-br-sm bg-[#d9fdd3] p-2 text-[13px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
            {media ? (
              <div className="-m-0.5 mb-1.5 grid h-24 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">
                <ImageIcon className="h-[26px] w-[26px]" />
              </div>
            ) : null}
            {head ? <div className="mb-1 font-bold">{head}</div> : null}
            <div>{body}</div>
            <div className="mt-1 text-right text-[9.5px] text-[#667781] dark:text-[#8696a0]">{time} ✓✓</div>
            {buttons.length > 0 ? (
              <div className="-mx-2 -mb-1.5 mt-1.5 flex flex-col gap-px">
                {buttons.map((b, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center gap-1.5 border-t border-[#e9edef] py-2 text-center text-[13px] font-medium text-[#00a5f4] dark:border-white/10 dark:text-[#53bdeb]"
                  >
                    <LinkIcon className="h-[13px] w-[13px]" />
                    {b}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-[#f0f0f0] px-3 py-2.5 dark:bg-[#1f2c33]">
          <span className="h-8 flex-1 rounded-full bg-white dark:bg-[#2a3942]" />
          <span className="grid size-8 place-items-center rounded-full bg-[#00a884] text-white">
            <Send className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- FlowNode */

export interface FlowNodeData {
  kind: string;
  title: string;
  icon: LucideIcon;
  tone?: string;
  tint?: string;
  chip?: React.ReactNode;
}

export interface FlowNodeProps {
  node: FlowNodeData;
  selected?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  className?: string;
}

export function FlowNode({ node, selected, onClick, className }: FlowNodeProps) {
  const Icon = node.icon;
  return (
    <div
      onClick={onClick}
      className={cn(
        'relative w-[260px] cursor-pointer rounded-xl border bg-card shadow-sm transition',
        selected ? 'border-brand shadow-md ring-2 ring-ring' : 'border-border hover:shadow-md',
        className,
      )}
    >
      <span className="absolute -top-1.5 left-1/2 h-[9px] w-[9px] -translate-x-1/2 rounded-full border-2 border-input bg-card" />
      <div className="flex items-center gap-2.5 p-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px]" style={{ background: node.tint, color: node.tone }}>
          <Icon className="h-[17px] w-[17px]" />
        </span>
        <div className="min-w-0">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground">{node.kind}</div>
          <div className="text-[13.5px] font-semibold leading-tight">{node.title}</div>
        </div>
      </div>
      {node.chip ? (
        <div className="px-3 pb-3">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground">
            <Icon className="size-3" />
            {node.chip}
          </span>
        </div>
      ) : null}
      <span className="absolute -bottom-1.5 left-1/2 h-[9px] w-[9px] -translate-x-1/2 rounded-full border-2 border-input bg-card" />
    </div>
  );
}

/* ---------------------------------------------------------------- Timeline */

export interface TimelineItem {
  title: React.ReactNode;
  /** Mono meta line under the title (timestamps, durations). */
  meta?: React.ReactNode;
  icon?: LucideIcon;
  tone?: ChipTone;
}

export interface TimelineProps {
  items: TimelineItem[];
  className?: string;
}

/** Mockup `.exec-item`: icon dot + connecting rail + title + mono meta. */
export function Timeline({ items, className }: TimelineProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      {items.map((item, i) => {
        const Icon = item.icon ?? Circle;
        const last = i === items.length - 1;
        return (
          <div key={i} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <Chip tone={item.tone ?? 'gray'} className="h-[22px] w-[22px] justify-center rounded-[7px] !px-0">
                <Icon className="size-3" />
              </Chip>
              {!last ? <span className="my-1 w-0.5 flex-1 rounded bg-border" /> : null}
            </div>
            <div className={cn('min-w-0 flex-1', !last && 'pb-3.5')}>
              <div className="text-[12.5px] font-semibold leading-snug">{item.title}</div>
              {item.meta ? (
                <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">{item.meta}</div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------- MessageComposer */

export interface ComposerMode {
  value: string;
  label: React.ReactNode;
}

export interface MessageComposerProps {
  /** Submit handler — receives the trimmed text; clears on (sync) return / resolve. */
  onSubmit: (text: string) => void | Promise<void>;
  /** Controlled value — pass with `onChange` to inject text (AI suggest etc.). */
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Optional mode toggle above the input (e.g. Reply / Internal note). */
  modes?: ComposerMode[];
  mode?: string;
  onModeChange?: (mode: string) => void;
  /** Slot before the send button — attach / emoji / AI buttons. */
  actions?: React.ReactNode;
  disabled?: boolean;
  submitting?: boolean;
  submitLabel?: React.ReactNode;
  className?: string;
}

/**
 * Generic message composer — inbox replies, WhatsApp sends, notes, AI chat.
 * Enter sends, Shift+Enter inserts a newline.
 */
export function MessageComposer({
  onSubmit,
  value: controlledValue,
  onChange,
  placeholder = 'Type a message…',
  modes,
  mode,
  onModeChange,
  actions,
  disabled,
  submitting,
  submitLabel,
  className,
}: MessageComposerProps) {
  const [internalText, setInternalText] = React.useState('');
  const text = controlledValue ?? internalText;
  const setText = React.useCallback(
    (v: string) => {
      if (controlledValue === undefined) setInternalText(v);
      onChange?.(v);
    },
    [controlledValue, onChange],
  );
  const [busy, setBusy] = React.useState(false);
  const pending = submitting ?? busy;
  const canSend = !disabled && !pending && text.trim().length > 0;

  const submit = async () => {
    if (!canSend) return;
    const value = text.trim();
    const result = onSubmit(value);
    if (result instanceof Promise) {
      setBusy(true);
      try {
        await result;
        setText('');
      } catch {
        // keep the draft on failure
      } finally {
        setBusy(false);
      }
    } else {
      setText('');
    }
  };

  const noteMode = mode != null && mode !== modes?.[0]?.value;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {modes && modes.length > 1 ? (
        <div className="flex items-center gap-0.5 self-start rounded-lg bg-muted p-0.5">
          {modes.map((m) => (
            <button
              key={m.value}
              onClick={() => onModeChange?.(m.value)}
              className={cn(
                'h-6 rounded-[6px] px-2.5 text-[12px] font-semibold transition-colors',
                m.value === mode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      ) : null}
      <div
        className={cn(
          'flex items-end gap-2 rounded-xl border bg-card p-2 transition-colors',
          'focus-within:border-brand focus-within:ring-2 focus-within:ring-ring/40',
          noteMode ? 'border-warning/40 bg-warning-muted/40' : 'border-input',
        )}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled || pending}
          rows={Math.min(6, Math.max(1, text.split('\n').length))}
          className="min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1 text-[13.5px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
        />
        {actions}
        <button
          onClick={() => void submit()}
          disabled={!canSend}
          aria-label="Send"
          className={cn(
            'grid h-8 shrink-0 place-items-center rounded-lg bg-primary px-2.5 text-primary-foreground transition-opacity',
            submitLabel ? 'gap-1.5 text-[12.5px] font-semibold' : 'w-8',
            !canSend && 'opacity-40',
          )}
        >
          {pending ? <Spinner size={14} className="border-current" /> : <Send className="h-[15px] w-[15px]" />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Stepper */

export interface StepperProps {
  steps: React.ReactNode[];
  /** 0-based index of the active step. */
  current: number;
  className?: string;
}

/** Wizard step indicator — numbered dots, check for completed, connectors. */
export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <div className={cn('flex items-center', className)}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={i}>
            {i > 0 ? <span className={cn('mx-2 h-px min-w-6 flex-1', done ? 'bg-brand' : 'bg-border')} /> : null}
            <span className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  'grid size-6 place-items-center rounded-full text-[11.5px] font-semibold transition-colors',
                  done
                    ? 'bg-brand text-brand-foreground'
                    : active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  'whitespace-nowrap text-[12.5px]',
                  active ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground',
                )}
              >
                {label}
              </span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------- ConversationItem */

export interface Conversation {
  name: string;
  company?: string;
  preview: string;
  time: string;
  unread?: number;
  channel?: { icon: LucideIcon; color?: string; tint?: string };
}

export function ConversationItem({ c, active, onClick, className }: { c: Conversation; active?: boolean; onClick?: React.MouseEventHandler<HTMLButtonElement>; className?: string }) {
  const ChannelIcon = c.channel?.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex w-full gap-3 border-b border-border p-3.5 text-left transition-colors',
        active ? 'bg-brand-muted' : 'hover:bg-muted/60',
        className,
      )}
    >
      {active ? <span className="absolute inset-y-0 left-0 w-[3px] bg-brand" /> : null}
      <span className="relative shrink-0">
        <Avatar name={c.name} size={40} />
        {ChannelIcon ? (
          <span
            className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-md ring-2 ring-card"
            style={{ background: c.channel?.tint, color: c.channel?.color }}
          >
            <ChannelIcon className="h-[9px] w-[9px]" />
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="flex-1 truncate text-[13.5px] font-semibold">{c.name}</span>
          <span className="text-[11px] text-muted-foreground">{c.time}</span>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">{c.preview}</span>
        {c.company || c.unread ? (
          <span className="mt-1.5 flex items-center gap-1.5">
            <span className="flex-1 truncate text-[11px] text-muted-foreground/70">{c.company}</span>
            {c.unread ? (
              <span className="grid h-[17px] min-w-[17px] place-items-center rounded-full bg-brand-muted px-1.5 text-[10px] font-semibold text-brand-strong">
                {c.unread}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </button>
  );
}
