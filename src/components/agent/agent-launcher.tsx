'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CoreMessage } from 'ai';
import {
  ArrowUp,
  Bot,
  BrainCircuit,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Rocket,
  Sparkles,
  Wand2,
  Workflow,
  X,
} from 'lucide-react';
import { useSession } from '@/lib/auth-client';

import { ToolResultCard, detectToolResults } from '@/components/copilot/tool-result-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui-kit';

import {
  AgentBrandOption,
  AgentStarterPrompt,
  buildAgentBrandSetupHref,
  getAgentStarterPrompts,
  normalizeAgentBrandsResponse,
} from './agent-launcher-state';

function StarterPromptIcon({ icon }: { icon: AgentStarterPrompt['icon'] }) {
  if (icon === 'campaign') return <Rocket className="size-3.5" />;
  if (icon === 'workflow' || icon === 'action') return <Workflow className="size-3.5" />;
  if (icon === 'content' || icon === 'summary') return <Wand2 className="size-3.5" />;
  return <BrainCircuit className="size-3.5" />;
}

function getStoredBrandId() {
  return localStorage.getItem('agent-brand-id') || localStorage.getItem('copilot-brand-id');
}

function getStoredMissionId() {
  return localStorage.getItem('agent-active-mission-id') || '';
}

function setStoredMissionId(missionId: string) {
  if (!missionId) {
    localStorage.removeItem('agent-active-mission-id');
    return;
  }
  localStorage.setItem('agent-active-mission-id', missionId);
}

export function AgentLauncher() {
  const { push, replace } = useRouter();
  const { data: session } = useSession();
  const [messages, setMessages] = useState<CoreMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [brands, setBrands] = useState<AgentBrandOption[]>([]);
  const [hasLoadedBrands, setHasLoadedBrands] = useState(false);
  const [activeBrandId, setActiveBrandId] = useState('');
  const [activeMissionId, setActiveMissionId] = useState('');
  const scrollBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!session?.user?.id) return;

    fetch('/api/social/brands')
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const nextBrands = normalizeAgentBrandsResponse(payload);
        setBrands(nextBrands);
        if (nextBrands.length === 0) {
          setActiveBrandId('');
          localStorage.removeItem('agent-brand-id');
          localStorage.removeItem('copilot-brand-id');
          return;
        }

        const stored = getStoredBrandId();
        const match = stored ? nextBrands.find((brand) => brand.id === stored) : null;
        const nextActiveBrandId = match?.id ?? nextBrands[0]?.id ?? '';
        setActiveBrandId(nextActiveBrandId);

        if (nextActiveBrandId) {
          localStorage.setItem('agent-brand-id', nextActiveBrandId);
          localStorage.setItem('copilot-brand-id', nextActiveBrandId);
        }
      })
      .catch(() => {})
      .finally(() => setHasLoadedBrands(true));
  }, [session?.user?.id]);

  useEffect(() => {
    if (!activeBrandId) return;
    localStorage.setItem('agent-brand-id', activeBrandId);
    localStorage.setItem('copilot-brand-id', activeBrandId);
  }, [activeBrandId]);

  useEffect(() => {
    setActiveMissionId(getStoredMissionId());
  }, []);

  useEffect(() => {
    if (scrollBottomRef.current) {
      scrollBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen]);

  useEffect(() => {
    if (messages.length === 0 && isOpen) {
      setMessages([
        {
          role: 'assistant',
          content: "Hi, I'm the Montr AI Agent. I can help you shape missions, run tools, draft outputs, and turn strategy into tracked execution.",
        },
      ]);
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    const handleOpenAgent = (event: Event) => {
      const customEvent = event as CustomEvent<{ prompt?: string; brandId?: string }>;
      if (hasLoadedBrands && brands.length === 0) {
        push(buildAgentBrandSetupHref({ returnTo: '/agent' }));
        return;
      }

      // Pin the requested brand (e.g. the just-onboarded brand) so the strategy
      // tools run against the right brand context — the asset-bridge fix.
      const requestedBrandId = customEvent.detail?.brandId;
      if (requestedBrandId) {
        setActiveBrandId(requestedBrandId);
        localStorage.setItem('agent-brand-id', requestedBrandId);
        localStorage.setItem('copilot-brand-id', requestedBrandId);
      }

      setIsOpen(true);

      if (customEvent.detail?.prompt) {
        setInput(customEvent.detail.prompt);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    };

    window.addEventListener('open-agent', handleOpenAgent);
    window.addEventListener('open-copilot', handleOpenAgent);

    return () => {
      window.removeEventListener('open-agent', handleOpenAgent);
      window.removeEventListener('open-copilot', handleOpenAgent);
    };
  }, [brands.length, hasLoadedBrands, push]);

  useEffect(() => {
    if (!isOpen || !hasLoadedBrands || brands.length > 0) return;
    setIsOpen(false);
    replace(buildAgentBrandSetupHref({ returnTo: '/agent' }));
  }, [brands.length, hasLoadedBrands, isOpen, replace]);

  const buildWorkspaceHref = (promptOverride?: string) => {
    const params = new URLSearchParams();
    if (activeMissionId) {
      params.set('missionId', activeMissionId);
    } else {
      const nextPrompt = (promptOverride ?? input).trim();
      if (nextPrompt) {
        params.set('prompt', nextPrompt);
      }
    }

    const query = params.toString();
    return query ? `/agent?${query}` : '/agent';
  };

  const redirectToBrandSetup = (returnTo = buildWorkspaceHref()) => {
    setIsOpen(false);
    push(buildAgentBrandSetupHref({ returnTo }));
  };

  const submitMessage = async (messageOverride?: string) => {
    const nextMessage = (messageOverride ?? input).trim();
    if (!nextMessage || isLoading || !session?.user?.id) return;
    if (hasLoadedBrands && brands.length === 0) {
      redirectToBrandSetup(buildWorkspaceHref(nextMessage));
      return;
    }

    setInput('');
    setMessages((previous) => [...previous, { role: 'user', content: nextMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeBrandId ? { 'x-brand-id': activeBrandId } : {}),
        },
        body: JSON.stringify({
          message: nextMessage,
          history: messages,
          missionId: activeMissionId || undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to fetch Agent response');
      }

      const responseMissionId = response.headers.get('x-mission-id') || '';
      if (responseMissionId) {
        setActiveMissionId(responseMissionId);
        setStoredMissionId(responseMissionId);
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      setMessages((previous) => [...previous, { role: 'assistant', content: '' }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        setMessages((previous) => {
          const nextMessages = [...previous];
          const lastMessage = nextMessages[nextMessages.length - 1];
          if (lastMessage?.role === 'assistant') {
            lastMessage.content = `${lastMessage.content ?? ''}${chunk}`;
          }
          return nextMessages;
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
      console.error('Agent Chat Error:', error);
      setMessages((previous) => [
        ...previous,
        { role: 'assistant', content: `Sorry, I hit an error while handling that request: ${errorMessage}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenWorkspace = () => {
    const nextHref = buildWorkspaceHref();
    if (hasLoadedBrands && brands.length === 0) {
      redirectToBrandSetup(nextHref);
      return;
    }
    setIsOpen(false);
    push(nextHref);
  };

  const hasConversation = messages.some((message) => message.role === 'user');
  const starterPrompts = getAgentStarterPrompts(hasConversation);
  const activeBrand = brands.find((brand) => brand.id === activeBrandId);
  const userTurns = messages.filter((message) => message.role === 'user').length;

  return (
    <>
      {!isOpen && (
        <Button
          variant="primary"
          onClick={() => {
            if (hasLoadedBrands && brands.length === 0) {
              redirectToBrandSetup('/agent');
              return;
            }
            setIsOpen(true);
          }}
          icon={Sparkles}
          className="fixed bottom-6 right-6 z-50 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        >
          <span className="hidden text-[12.5px] font-medium sm:inline">Open Agent</span>
        </Button>
      )}

      {isOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close agent panel"
          className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm lg:hidden"
          onClick={() => setIsOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(false); } }}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border/60 bg-[var(--app-surface)] shadow-[var(--app-shadow)] backdrop-blur-[18px] transition-transform duration-300 sm:w-[420px] lg:w-[440px]',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="border-b border-border/50 px-4 py-3">
          {/* Status bar row */}
          <div className="mb-2.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-emerald-700">
              <span className="h-[5px] w-[5px] rounded-full bg-emerald-500" style={{ animation: 'pulseDot 1.6s ease-in-out infinite' }} />
              Ready
            </span>
            <span className="rounded-full border border-border/50 bg-muted/50 px-2 py-0.5 text-[9.5px] font-medium text-muted-foreground">
              {userTurns} {userTurns === 1 ? 'turn' : 'turns'}
            </span>
            <span className="rounded-full border border-border/50 bg-muted/50 px-2 py-0.5 text-[9.5px] font-medium text-muted-foreground">
              Mixed mode
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <IconButton
                icon={RefreshCcw}
                iconSize={14}
                aria-label="Reset conversation"
                onClick={() => {
                  setMessages([]);
                  setActiveMissionId('');
                  setStoredMissionId('');
                }}
                disabled={isLoading}
                className="size-7 rounded-[6px] border border-border/40 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              />
              <IconButton
                icon={X}
                iconSize={14}
                aria-label="Close"
                onClick={() => setIsOpen(false)}
                className="size-7 rounded-[6px] border border-border/40 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              />
            </div>
          </div>

          {/* Identity row */}
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-primary/20 bg-primary/10 text-primary">
              <Bot className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground">Montr AI Agent</p>
              <p className="text-[11px] text-muted-foreground">Quick mission control — plan, act, approve, execute</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={ExternalLink}
              onClick={handleOpenWorkspace}
              className="h-7 text-[11px]"
            >
              Full workspace
            </Button>
          </div>

          {/* Brand context */}
          <div className="mt-2.5">
            {brands.length > 1 ? (
              <Select value={activeBrandId} onValueChange={setActiveBrandId}>
                <SelectTrigger className="h-8 rounded-[8px] border-border/50 bg-muted/40 text-[12px] text-foreground focus:ring-primary/30">
                  <SelectValue placeholder="Choose brand context" />
                </SelectTrigger>
                <SelectContent className="border-border/50">
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id} className="text-[12px]">
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-8 items-center gap-2 rounded-[8px] border border-border/40 bg-muted/30 px-3">
                <BrainCircuit className="size-3.5 text-primary" />
                <span className="truncate text-[12px] font-medium text-foreground">
                  {activeBrand?.name ?? 'Workspace context'}
                </span>
                {activeBrand?.handle && (
                  <span className="ml-auto truncate text-[11px] text-muted-foreground">
                    @{activeBrand.handle}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="space-y-3 p-3.5 pb-6">
            {/* Starter prompts — no conversation yet */}
            {!hasConversation && (
              <div className="app-glass rounded-[10px] p-3.5 space-y-3">
                <div className="flex items-start gap-2.5">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-[6px] bg-primary/10 text-primary">
                    <Sparkles className="size-3.5" />
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-foreground">Start in quick mode</p>
                    <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                      Fast asks here — move to the full workspace for tracked outputs and side-panel context.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Missions', value: 'Goal first' },
                    { label: 'Approvals', value: 'Visible gates' },
                    { label: 'Outputs', value: 'Structured' },
                  ].map((cell) => (
                    <div key={cell.label} className="rounded-[8px] border border-border/40 bg-white/50 px-2.5 py-2">
                      <p className="text-[10px] text-muted-foreground">{cell.label}</p>
                      <p className="mt-1 text-[12px] font-medium text-foreground">{cell.value}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Quick starts</p>
                  <div className="grid gap-2">
                    {starterPrompts.map((starterPrompt) => (
                      <button
                        key={starterPrompt.title}
                        type="button"
                        onClick={() => void submitMessage(starterPrompt.prompt)}
                        disabled={isLoading}
                        className="flex items-center gap-3 rounded-[8px] border border-border/50 bg-white/70 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div className="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-primary/10 text-primary">
                          <StarterPromptIcon icon={starterPrompt.icon} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium text-foreground">{starterPrompt.title}</p>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{starterPrompt.prompt}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Continuation quick starts */}
            {hasConversation && (
              <div className="flex flex-wrap gap-1.5">
                {starterPrompts.map((starterPrompt) => (
                  <button
                    key={starterPrompt.title}
                    type="button"
                    onClick={() => setInput(starterPrompt.prompt)}
                    className="rounded-full border border-border/50 bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {starterPrompt.title}
                  </button>
                ))}
              </div>
            )}

            {/* Message thread */}
            {messages.map((message, index) => {
              const isUser = message.role === 'user';
              const content = typeof message.content === 'string' ? message.content : '';

              return (
                <div key={`${message.role}-${index}`} className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[92%]', isUser ? 'items-end' : 'items-start')}>
                    <div
                      className={cn(
                        'mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground',
                        isUser ? 'justify-end' : ''
                      )}
                    >
                      {isUser ? (
                        <>
                          <span>You</span>
                          <ArrowUp className="size-2.5" />
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-2.5 text-primary" />
                          <span>Agent</span>
                        </>
                      )}
                    </div>
                    <div
                      className={cn(
                        'rounded-[16px] border px-3.5 py-2.5 text-[12.5px] leading-[1.6] shadow-sm',
                        isUser
                          ? 'rounded-tr-[4px] border-primary/20 bg-primary text-primary-foreground'
                          : 'rounded-tl-[4px] border-border/60 bg-white/80 text-foreground backdrop-blur-sm'
                      )}
                    >
                      <div className="whitespace-pre-wrap break-words">{content}</div>
                    </div>
                    {!isUser && (
                      <div className="mt-1.5 space-y-1">
                        {detectToolResults(content).map((toolResult, toolIndex) => (
                          <ToolResultCard key={`${toolResult.toolName}-${toolIndex}`} {...toolResult} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Loading state */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[92%] rounded-[16px] rounded-tl-[4px] border border-border/60 bg-white/80 px-3.5 py-2.5 text-foreground backdrop-blur-sm">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    <Loader2 className="size-2.5 animate-spin text-primary" />
                    Agent is working
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.3s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:-0.15s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-primary/60" />
                  </div>
                </div>
              </div>
            )}

            <div ref={scrollBottomRef} />
          </div>
        </ScrollArea>

        {/* Input footer */}
        <div className="border-t border-border/50 p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-3 px-0.5">
            <span className="truncate rounded-full border border-border/40 bg-muted/40 px-2 py-0.5 text-[9.5px] font-medium text-muted-foreground">
              {activeBrand?.name ?? 'Workspace context'}
            </span>
            <Link
              href={
                hasLoadedBrands && brands.length === 0
                  ? buildAgentBrandSetupHref({ returnTo: buildWorkspaceHref() })
                  : buildWorkspaceHref()
              }
              className="shrink-0 text-[11px] text-primary hover:underline"
            >
              Open full workspace
            </Link>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitMessage();
            }}
            className="rounded-[10px] border border-border/50 bg-white/80 p-3"
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submitMessage();
                }
              }}
              placeholder="Ask the Agent to plan, draft, summarize, or execute..."
              disabled={isLoading}
              className="min-h-[76px] resize-none border-0 bg-transparent px-0 py-0 text-[12.5px] leading-6 text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <p className="text-[10.5px] leading-4 text-muted-foreground">
                Shift+Enter for newline
              </p>
              <Button
                variant="primary"
                type="submit"
                size="sm"
                disabled={isLoading || !input.trim()}
                icon={isLoading ? undefined : ArrowUp}
                className="h-8 px-3.5 text-[12px]"
              >
                {isLoading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  'Send'
                )}
              </Button>
            </div>
          </form>
        </div>
      </aside>
    </>
  );
}
