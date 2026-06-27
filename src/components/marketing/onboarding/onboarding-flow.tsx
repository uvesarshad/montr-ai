'use client';

/**
 * OnboardingFlow — the distraction-free, full-screen marketing onboarding.
 *
 * Port of the mockup's `Onboarding2` (the v0.6 design mockup (removed) 
 * onboarding.jsx + onboarding.css `.onbx*`): a fixed full-screen takeover
 * (covers rail + topbar, z-200) with a top logo/step/skip bar, a segmented
 * progress rail, and five centered screens:
 *
 *   0  What's your website?       — https:// pill, runs the AI site analysis
 *   1  What do you need help with? — multi-select choice cards
 *   2  Connect your platforms      — selection-only tile grid (no OAuth here)
 *   3  What's your main goal?      — single-select choice cards
 *   4  Building your plan          — the existing AI roadmap generation +
 *                                    refine chat (was step 4 of the old modal)
 *
 * Replaces the old `OnboardingModal` dialog. All AI/backend plumbing is the
 * same: `analyzeOnboardingWebsite`, `processOnboardingMessage` (creates the
 * marketing plan server-side), `openAgentLauncher` on finish.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';
import {
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
  ChevronRight,
  Inbox,
  LayoutGrid,
  Mail,
  MessageCircle,
  Send,
  Sparkles,
  TrendingUp,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import { processOnboardingMessage } from '@/ai/flows/onboarding-agent-flow';
import { analyzeOnboardingWebsite } from '@/ai/flows/onboarding-website-analysis';
import type { OnboardingStructuredData } from '@/ai/flows/onboarding-types';
import { Button, ChatBubble, Spinner } from '@/components/ui-kit';
import {
  FacebookLogo,
  NotionLogo,
  WordpressLogo,
  XLogo,
} from '@/components/social-icons';
import { openAgentLauncher } from '@/lib/agent/launcher';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface OnboardingFlowProps {
  initialHistory?: Message[];
  onComplete: () => void;
  onSkip: () => void;
  mode?: 'onboarding' | 'adjustment';
  brandId: string;
}

/* ------------------------------------------------------------- choice data */

type Choice = { id: string; icon: LucideIcon; tone: string; title: string; desc: string };

const NEEDS: Choice[] = [
  { id: 'email', icon: Mail, tone: 'text-info-foreground', title: 'Email Marketing', desc: 'Campaigns, sequences & deliverability' },
  { id: 'whatsapp', icon: MessageCircle, tone: 'text-success-foreground', title: 'WhatsApp Marketing', desc: 'Broadcasts, flows & templates' },
  { id: 'social', icon: CalendarDays, tone: 'text-brand-strong', title: 'Social Media', desc: 'Plan, publish & analyze posts' },
  { id: 'content', icon: Sparkles, tone: 'text-brand-strong', title: 'Content & Creative', desc: 'Generate image, video, copy & audio' },
  { id: 'crm', icon: Users, tone: 'text-info-foreground', title: 'CRM & Sales', desc: 'Track contacts, deals & pipeline' },
  { id: 'support', icon: Inbox, tone: 'text-warning-foreground', title: 'Customer Support', desc: 'Omni-channel inbox & AI bots' },
];

const GOALS: Choice[] = [
  { id: 'sales', icon: TrendingUp, tone: 'text-success-foreground', title: 'Increase my sales', desc: 'Fill the pipeline and close more deals' },
  { id: 'content', icon: Sparkles, tone: 'text-brand-strong', title: 'Automate my content', desc: 'Generate & schedule on autopilot' },
  { id: 'crm', icon: Users, tone: 'text-brand-strong', title: 'Automate my CRM', desc: 'Enrich, route & update records' },
  { id: 'outreach', icon: Send, tone: 'text-info-foreground', title: 'Automate outreach & follow-up', desc: 'Sequences that never drop a lead' },
  { id: 'marketing', icon: Workflow, tone: 'text-warning-foreground', title: 'Automate marketing tasks', desc: 'Hand the busywork to AI agents' },
  { id: 'support', icon: Bot, tone: 'text-success-foreground', title: 'Scale customer support', desc: 'Resolve more with AI bots' },
];

/* ---------------------------------------------------------- platform tiles */

/** Brand marks missing from social-icons.tsx — ported from the mockup PLAT. */
const InstagramMark = () => (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="#fff" strokeWidth="2" />
    <circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="2" />
    <circle cx="17.2" cy="6.8" r="1.3" fill="#fff" />
  </svg>
);
const AnalyticsMark = () => (
  <svg viewBox="0 0 24 24" fill="#fff">
    <rect x="4" y="13" width="4" height="7" rx="2" />
    <rect x="10" y="9" width="4" height="11" rx="2" />
    <rect x="16" y="4" width="4" height="16" rx="2" />
  </svg>
);
const StripeMark = () => (
  <svg viewBox="0 0 24 24" fill="#fff">
    <path d="M13 9.2c0-.6.5-.9 1.3-.9 1.2 0 2.7.4 3.9 1V5.6c-1.3-.5-2.6-.7-3.9-.7-3.2 0-5.3 1.7-5.3 4.4 0 4.3 5.9 3.6 5.9 5.5 0 .7-.6 1-1.5 1-1.3 0-3-.6-4.3-1.3v3.7c1.4.6 2.9.9 4.3.9 3.3 0 5.5-1.6 5.5-4.4 0-4.6-5.9-3.8-5.9-5.5Z" />
  </svg>
);
const YoutubeMark = () => (
  <svg viewBox="0 0 24 24" fill="#fff">
    <path d="M22 8.2a3 3 0 0 0-2-2C18 5.6 12 5.6 12 5.6s-6 0-8 .6a3 3 0 0 0-2 2C1.6 9.8 1.6 12 1.6 12s0 2.2.4 3.8a3 3 0 0 0 2 2c2 .6 8 .6 8 .6s6 0 8-.6a3 3 0 0 0 2-2c.4-1.6.4-3.8.4-3.8s0-2.2-.4-3.8ZM10 15V9l5.2 3L10 15Z" />
  </svg>
);
const MailchimpMark = () => (
  <svg viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="11" r="1.3" fill="#241c15" />
    <circle cx="15" cy="11" r="1.3" fill="#241c15" />
    <path d="M7 6c1-1.5 3-2.3 5-2.3S15.8 4.5 17 6c2 2 2.6 5 2 8-.5 2.6-2.4 4.7-4.8 5.6M7 6c-1.6 1.6-2.4 4-2 6.4" stroke="#241c15" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const GoogleMark = () => (
  <svg viewBox="0 0 24 24">
    <path fill="#4285F4" d="M21.6 12.2c0-.6-.1-1.2-.2-1.8H12v3.5h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2Z" />
    <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z" />
    <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1Z" />
  </svg>
);

type Platform = { id: string; name: string; bg: string; bordered?: boolean; mark: React.ReactNode };

const PLATFORMS: Platform[] = [
  { id: 'instagram', name: 'Instagram', bg: 'linear-gradient(135deg,#feda75,#d62976 45%,#962fbf 80%,#4f5bd5)', mark: <InstagramMark /> },
  { id: 'facebook', name: 'Facebook', bg: '#1877f2', mark: <FacebookLogo className="h-[23px] w-[23px] text-white" /> },
  { id: 'x', name: 'X', bg: '#000', mark: <XLogo className="h-[19px] w-[19px] text-white" /> },
  { id: 'ga', name: 'Analytics', bg: '#f9ab00', mark: <AnalyticsMark /> },
  { id: 'wordpress', name: 'WordPress', bg: '#21759b', mark: <WordpressLogo className="h-[23px] w-[23px] text-white" /> },
  { id: 'stripe', name: 'Stripe', bg: '#635bff', mark: <StripeMark /> },
  { id: 'youtube', name: 'YouTube', bg: '#ff0000', mark: <YoutubeMark /> },
  { id: 'mailchimp', name: 'Mailchimp', bg: '#ffe01b', mark: <MailchimpMark /> },
  { id: 'notion', name: 'Notion', bg: '#fff', bordered: true, mark: <NotionLogo className="h-[23px] w-[23px] text-[#111]" /> },
  { id: 'google', name: 'Google', bg: '#fff', bordered: true, mark: <GoogleMark /> },
];

/** Selections that are real marketing channels (fold into structuredData.channels). */
const CHANNEL_IDS = new Set(['email', 'whatsapp', 'social', 'instagram', 'facebook', 'x', 'youtube']);

const STEPS = 5;

function Nav({
  wide = false,
  next,
  back,
  canContinue,
  isAnalyzing,
  step,
}: {
  wide?: boolean;
  next: () => void;
  back: () => void;
  canContinue: boolean;
  isAnalyzing: boolean;
  step: number;
}) {
  return (
    <div className={cn('mt-8 flex flex-col items-center gap-3.5', wide && 'mt-9')}>
      <Button
        variant="primary"
        onClick={() => void next()}
        disabled={!canContinue}
        className="h-[46px] rounded-full px-7 text-[14.5px]"
        iconRight={step === STEPS - 1 ? ArrowRight : ChevronRight}
      >
        {isAnalyzing ? 'Analyzing your site…' : step === STEPS - 1 ? 'Enter Montr' : 'Continue'}
      </Button>
      <button
        type="button"
        onClick={back}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {step === 0 ? 'Skip for now' : 'Back'}
      </button>
    </div>
  );
}

function ChoiceGrid({
  items,
  selected,
  onPick,
}: {
  items: Choice[];
  selected: string[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="mt-7 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {items.map((item) => {
        const Icon = item.icon;
        const isSel = selected.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(item.id)}
            className={cn(
              'relative flex items-center gap-3 rounded-xl border p-[14px_15px] text-left transition-colors',
              isSel ? 'border-brand bg-brand-muted' : 'border-border bg-card hover:bg-muted/60',
            )}
          >
            <span
              className={cn(
                'grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px]',
                isSel ? 'bg-card' : 'bg-muted',
                item.tone,
              )}
            >
              <Icon className="h-[19px] w-[19px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold tracking-[-0.01em] text-foreground">
                {item.title}
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
                {item.desc}
              </span>
            </span>
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors',
                isSel ? 'border-brand bg-brand text-white' : 'border-border text-transparent',
              )}
            >
              <Check className="h-[13px] w-[13px]" strokeWidth={3} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- component */

export function OnboardingFlow({
  initialHistory = [],
  onComplete,
  onSkip,
  mode = 'onboarding',
  brandId,
}: OnboardingFlowProps) {
  const [step, setStep] = useState(mode === 'adjustment' ? 4 : 0);
  const [formData, setFormData] = useState<OnboardingStructuredData>({
    businessName: '',
    businessType: '',
    website: '',
    industry: '',
    websiteAnalysis: undefined,
    targetAudience: '',
    brandTone: '',
    productsServices: [],
    channels: [],
    contentVolume: '',
    goals: [],
    budgetRange: '',
    timeline: '',
    challenge: '',
  });
  const [needs, setNeeds] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>(['google']);
  const [goal, setGoal] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(initialHistory);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [websiteError, setWebsiteError] = useState('');
  const [planReady, setPlanReady] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  // Portal target — the takeover must escape the page's PageTransition
  // wrapper (its transform/filter would turn `fixed` into container-relative).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const aiCallMade = useRef(false);
  const scrollBottomRef = useRef<HTMLDivElement>(null);
  const { width, height } = useWindowSize();

  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const buildSummary = useCallback(
    (data: OnboardingStructuredData) => buildFormSummary(data, needs, platforms),
    [needs, platforms],
  );

  const runPlanGeneration = useCallback(
    async (message: string, data: OnboardingStructuredData) => {
      setIsLoading(true);
      try {
        const result = await processOnboardingMessage({ message, brandId, mode, structuredData: data });
        setMessages((prev) => [...prev, { role: 'assistant', content: result.response }]);
        if (result.isCompleted) {
          setPlanReady(true);
          setShowConfetti(true);
        }
      } catch (error) {
        console.error('OnboardingFlow - plan generation error:', error);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: "I've captured your context. Send one more detail and I'll finish the roadmap." },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [brandId, mode],
  );

  // Auto-build the plan when the final screen is reached (fresh onboarding only;
  // adjustment mode waits for the user's message, as the old modal did).
  useEffect(() => {
    if (step === 4 && !aiCallMade.current && messages.length === 0 && mode !== 'adjustment') {
      aiCallMade.current = true;
      void runPlanGeneration(buildSummary(formData), formData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const analyzeWebsite = useCallback(async () => {
    if (!formData.website?.trim()) return;
    setIsAnalyzing(true);
    setWebsiteError('');
    try {
      const analysis = await analyzeOnboardingWebsite({ website: formData.website });
      setFormData((prev) => ({
        ...prev,
        website: analysis.normalizedUrl || prev.website,
        businessName: prev.businessName || analysis.businessName || '',
        businessType: prev.businessType || analysis.businessType || '',
        industry: prev.industry || analysis.industry || '',
        targetAudience: prev.targetAudience || analysis.targetAudience || '',
        brandTone: prev.brandTone || analysis.brandTone || '',
        productsServices: prev.productsServices?.length ? prev.productsServices : analysis.productsServices || [],
        websiteAnalysis: analysis,
      }));
      if (!analysis.fetchSucceeded) {
        setWebsiteError('Automatic extraction was limited — the AI will ask follow-ups instead.');
      }
    } catch {
      // Don't trap the user on a failed scan — the AI screen recovers.
      setWebsiteError('We could not analyze that website right now. Continuing without it.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [formData.website]);

  const handleChatSend = async () => {
    if (!input.trim() || isLoading) return;
    const message = input;
    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setInput('');
    await runPlanGeneration(message, formData);
  };

  const handleFinish = () => {
    openAgentLauncher({
      prompt: 'My marketing roadmap is ready. Show me what to work on first.',
      context: {
        source: 'marketing_onboarding',
        entityType: 'onboarding',
        entityLabel: formData.businessName || 'Brand onboarding',
        route: '/dashboard',
        notes: [
          formData.website ? `Website: ${formData.website}` : '',
          formData.goals?.length ? `Goals: ${formData.goals.join(', ')}` : '',
        ].filter((note): note is string => Boolean(note)),
      },
    });
    onComplete();
  };

  const canContinue =
    step === 0
      ? (formData.website?.trim().length ?? 0) > 2 && !isAnalyzing
      : step === 1
        ? needs.length > 0
        : step === 2
          ? true
          : step === 3
            ? goal != null
            : planReady;

  const next = async () => {
    if (step === 0) {
      await analyzeWebsite();
      setStep(1);
      return;
    }
    if (step === 3) {
      // Fold the selections into the structured data before the AI screen.
      const channels = Array.from(
        new Set([...needs, ...platforms].filter((id) => CHANNEL_IDS.has(id))),
      );
      setFormData((prev) => ({ ...prev, channels, goals: goal ? [goal] : [] }));
      setStep(4);
      return;
    }
    if (step === 4) {
      handleFinish();
      return;
    }
    setStep((s) => s + 1);
  };

  const back = () => (step > 0 ? setStep((s) => s - 1) : onSkip());

  const toggle = (arr: string[], set: (next: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  /* ------------------------------------------------------------ rendering */

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-background">
      {showConfetti && (
        <Confetti
          width={width}
          height={height}
          recycle={false}
          numberOfPieces={350}
          className="pointer-events-none fixed inset-0 z-[201]"
        />
      )}

      {/* Top bar — logo · step counter · skip */}
      <div className="flex shrink-0 items-center px-7 py-[22px]">
        <div className="flex items-center gap-2.5">
          <span className="grid h-[30px] w-[30px] place-items-center rounded-[9px] bg-foreground text-[16px] font-extrabold text-background shadow-sm dark:bg-brand dark:text-white">
            M
          </span>
          <span className="text-[16px] font-bold tracking-[-0.02em] text-foreground">Montr</span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="font-mono text-[12px] text-muted-foreground">
            {step + 1} / {STEPS}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip
          </button>
        </div>
      </div>

      {/* Progress rail */}
      <div className="flex shrink-0 gap-1.5 px-7 pb-1">
        {Array.from({ length: STEPS }).map((_, i) => (
          <span key={i} className="h-0.5 flex-1 overflow-hidden rounded-[3px] bg-muted">
            <span
              className="block h-full rounded-[3px] bg-brand transition-[width] [transition-duration:400ms] [transition-timing-function:cubic-bezier(.22,1,.36,1)]"
              style={{ width: i <= step ? '100%' : '0%' }}
            />
          </span>
        ))}
      </div>

      {/* Centered stage */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-2 pt-6 text-center">
        {step === 0 && (
          <div key="s0" className="w-full max-w-[560px] duration-300 animate-in fade-in slide-in-from-bottom-2">
            <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground">
              What&apos;s your website?
            </h1>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted-foreground">
              We&apos;ll scan it to learn your brand, tone and products.
            </p>
            <div className="mx-auto mt-7 flex h-[50px] max-w-[420px] items-center rounded-xl border border-border bg-card transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/30">
              <span className="flex items-center pl-4 pr-0.5 text-[14.5px] text-muted-foreground">https://</span>
              <input
                autoFocus
                value={formData.website || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, website: e.target.value, websiteAnalysis: undefined }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canContinue) void next();
                }}
                placeholder="acme.com"
                className="h-full flex-1 border-0 bg-transparent px-1 pr-3.5 text-[14.5px] text-foreground outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            {websiteError && <p className="mt-3.5 text-[12.5px] text-amber-600">{websiteError}</p>}
            <Nav next={next} back={back} canContinue={canContinue} isAnalyzing={isAnalyzing} step={step} />
          </div>
        )}

        {step === 1 && (
          <div key="s1" className="w-full max-w-[720px] duration-300 animate-in fade-in slide-in-from-bottom-2">
            <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground">
              What do you need help with?
            </h1>
            <p className="mt-2.5 text-[14.5px] text-muted-foreground">Pick everything that applies.</p>
            <ChoiceGrid items={NEEDS} selected={needs} onPick={(id) => toggle(needs, setNeeds, id)} />
            <Nav wide next={next} back={back} canContinue={canContinue} isAnalyzing={isAnalyzing} step={step} />
          </div>
        )}

        {step === 2 && (
          <div key="s2" className="w-full max-w-[720px] duration-300 animate-in fade-in slide-in-from-bottom-2">
            <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground">
              Connect your platforms
            </h1>
            <p className="mt-2.5 text-[14.5px] text-muted-foreground">Link the tools you already use.</p>
            <div className="mt-6 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {PLATFORMS.map((platform) => {
                const on = platforms.includes(platform.id);
                return (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => toggle(platforms, setPlatforms, platform.id)}
                    className={cn(
                      'relative flex flex-col items-center gap-2.5 rounded-xl border px-2 pb-3 pt-[15px] transition-colors',
                      on ? 'border-brand bg-brand-muted' : 'border-border bg-card hover:bg-muted/60',
                    )}
                  >
                    {on && (
                      <span className="absolute right-[7px] top-[7px] grid h-[17px] w-[17px] place-items-center rounded-full bg-brand text-white">
                        <Check className="h-[11px] w-[11px]" strokeWidth={3} />
                      </span>
                    )}
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-[11px] [&_svg]:h-[23px] [&_svg]:w-[23px]"
                      style={{
                        background: platform.bg,
                        boxShadow: platform.bordered ? 'inset 0 0 0 1px hsl(var(--border))' : undefined,
                      }}
                    >
                      {platform.mark}
                    </span>
                    <span className="text-[12px] font-medium text-muted-foreground">{platform.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                <LayoutGrid className="size-3.5" /> More integrations are available in Settings
              </span>
            </div>
            <Nav wide next={next} back={back} canContinue={canContinue} isAnalyzing={isAnalyzing} step={step} />
          </div>
        )}

        {step === 3 && (
          <div key="s3" className="w-full max-w-[720px] duration-300 animate-in fade-in slide-in-from-bottom-2">
            <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground">
              What&apos;s your main goal?
            </h1>
            <p className="mt-2.5 text-[14.5px] text-muted-foreground">
              We&apos;ll line up the right agents and automations.
            </p>
            <ChoiceGrid items={GOALS} selected={goal ? [goal] : []} onPick={(id) => setGoal(id)} />
            <Nav wide next={next} back={back} canContinue={canContinue} isAnalyzing={isAnalyzing} step={step} />
          </div>
        )}

        {step === 4 && (
          <div key="s4" className="flex h-full w-full max-w-[640px] flex-col duration-300 animate-in fade-in slide-in-from-bottom-2">
            <h1 className="shrink-0 text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground">
              {planReady ? 'Your plan is ready' : mode === 'adjustment' ? 'Adjust your roadmap' : 'Building your plan'}
            </h1>
            <p className="mt-2.5 shrink-0 text-[14.5px] text-muted-foreground">
              {planReady
                ? 'Step inside — your agents and roadmap are waiting.'
                : mode === 'adjustment'
                  ? 'Tell the AI what should change and it will rework the plan.'
                  : 'The AI is turning your answers into a marketing roadmap. Add details any time.'}
            </p>

            <div className="mt-6 flex min-h-[180px] flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-card p-4 text-left">
              {messages.map((message, index) => (
                <ChatBubble key={`${index}-${message.role}`} dir={message.role === 'user' ? 'out' : 'in'}>
                  {message.content}
                </ChatBubble>
              ))}
              {isLoading && (
                <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Spinner size={14} /> Generating roadmap…
                </span>
              )}
              {messages.length === 0 && !isLoading && mode === 'adjustment' && (
                <span className="text-[13px] text-muted-foreground">
                  Describe the change you want — channels, goals, pace…
                </span>
              )}
              <div ref={scrollBottomRef} />
            </div>

            {planReady ? (
              <Nav next={next} back={back} canContinue={canContinue} isAnalyzing={isAnalyzing} step={step} />
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleChatSend();
                }}
                className="mt-4 flex shrink-0 items-center gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Reply to the AI…"
                  disabled={isLoading}
                  autoFocus
                  className="h-[44px] flex-1 rounded-full border border-border bg-card px-4 text-[13.5px] text-foreground outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-[3px] focus:ring-brand/30 placeholder:text-muted-foreground/60"
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isLoading || !input.trim()}
                  className="h-[44px] rounded-full px-5"
                  icon={Sparkles}
                >
                  Send
                </Button>
              </form>
            )}
            <div className="h-4 shrink-0" />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ----------------------------------------------------------------- summary */

function buildFormSummary(formData: OnboardingStructuredData, needs: string[], platforms: string[]) {
  const analysis = formData.websiteAnalysis;
  const needTitles = NEEDS.filter((n) => needs.includes(n.id)).map((n) => n.title);
  const platformNames = PLATFORMS.filter((p) => platforms.includes(p.id)).map((p) => p.name);
  return [
    `Business: ${formData.businessName || analysis?.businessName || 'Unknown'} (${formData.businessType || analysis?.businessType || 'General'})`,
    formData.website ? `Website: ${formData.website}` : '',
    (formData.industry || analysis?.industry) ? `Industry: ${formData.industry || analysis?.industry}` : '',
    analysis?.summary ? `Website Summary: ${analysis.summary}` : '',
    (formData.targetAudience || analysis?.targetAudience) ? `Target Audience: ${formData.targetAudience || analysis?.targetAudience}` : '',
    (formData.brandTone || analysis?.brandTone) ? `Brand Tone: ${formData.brandTone || analysis?.brandTone}` : '',
    (formData.productsServices?.length || analysis?.productsServices?.length) ? `Products / Services: ${(formData.productsServices?.length ? formData.productsServices : analysis?.productsServices)?.join(', ')}` : '',
    analysis?.brandColors?.length ? `Brand Colors: ${analysis.brandColors.join(', ')}` : '',
    analysis?.brandAssets?.length ? `Brand Assets: ${analysis.brandAssets.join(', ')}` : '',
    needTitles.length ? `Needs: ${needTitles.join(', ')}` : '',
    platformNames.length ? `Connected platforms: ${platformNames.join(', ')}` : '',
    formData.channels?.length ? `Active Channels: ${formData.channels.join(', ')}` : '',
    formData.goals?.length ? `Goals: ${formData.goals.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}
