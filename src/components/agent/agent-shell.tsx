'use client';

import { useEffect, useMemo, useState } from 'react';
import { CoreMessage } from 'ai';
import { useSession } from '@/lib/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';
import { PanelRightOpen } from 'lucide-react';

import { IconButton } from '@/components/ui-kit';
import { useAppHeader } from '@/components/app-header';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import {
  AgentBrandOption,
  buildAgentBrandSetupHref,
  getAgentStarterPrompts,
  normalizeAgentBrandsResponse,
} from './agent-launcher-state';
import { AgentMissionRail } from './agent-mission-rail';
import { AgentConversation } from './agent-conversation';
import { AgentContextRail } from './agent-context-rail';
import { MissionTemplatePicker } from './mission-template-picker';
import { useAgentMission } from '@/hooks/agent/use-agent-mission';
import { useAgentMissionContext } from '@/hooks/agent/use-agent-mission-context';
import { AgentMissionListItem, useAgentMissions } from '@/hooks/agent/use-agent-missions';
import {
  getMissionTemplates,
  MissionTemplate,
} from '@/lib/agent/mission-templates';
import { cn } from '@/lib/utils';

const DEFAULT_AGENT_MESSAGE: CoreMessage = {
  role: 'assistant',
  content: 'Mission workspace ready. Define a goal, then I will help you break it down, execute safe actions, and surface outputs in context.',
};

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

function formatMissionTime(value?: string | Date | null) {
  if (!value) return 'Ready';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Ready';

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes < 0) {
    const futureMinutes = Math.abs(diffMinutes);
    if (futureMinutes < 60) return `in ${futureMinutes}m`;
    const futureHours = Math.round(futureMinutes / 60);
    if (futureHours < 24) return `in ${futureHours}h`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  if (Math.abs(diffMinutes) < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getMissionModeLabel(mode?: AgentMissionListItem['mode']) {
  switch (mode) {
    case 'approval-first':
      return 'Plan + approval';
    case 'autonomous':
      return 'Full autonomy';
    default:
      return 'Mixed mode';
  }
}

function getMissionSpecialistLabel(agentId?: string) {
  if (!agentId) return 'General agent';
  return agentId
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getUserInitials(name?: string | null, email?: string | null) {
  const source = name || email || 'You';
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function toMissionMessages(events: ReturnType<typeof useAgentMission>['events']): CoreMessage[] {
  return events
    .filter(
      (event) =>
        event.type === 'message' &&
        (event.role === 'user' || event.role === 'assistant') &&
        typeof event.content === 'string' &&
        event.content.trim().length > 0
    )
    .map((event) => ({
      role: event.role as 'user' | 'assistant',
      content: event.content as string,
    }));
}

export function AgentShell() {
  const { data: session } = useSession();
  const { setHeaderInfo } = useAppHeader();
  const { currentBrandId: globalBrandId } = useCurrentBrand();
  const { replace } = useRouter();
  const { get: getSearchParam } = useSearchParams();
  const prompt = getSearchParam('prompt') ?? '';
  const queryMissionId = getSearchParam('missionId') ?? '';

  const [messages, setMessages] = useState<CoreMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [brands, setBrands] = useState<AgentBrandOption[]>([]);
  const [hasLoadedBrands, setHasLoadedBrands] = useState(false);
  const [activeBrandId, setActiveBrandId] = useState('');
  const [missionSearch, setMissionSearch] = useState('');
  const [activeMissionId, setActiveMissionId] = useState('');
  const [shouldHydrateMission, setShouldHydrateMission] = useState(false);
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(true);

  const missionTemplates = useMemo(() => getMissionTemplates(), []);

  useEffect(() => {
    setHeaderInfo({ type: 'page', title: 'Agent' });
  }, [setHeaderInfo]);

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

  // Sync with global brand context: if the global picker changes to a specific brand, mirror it here.
  useEffect(() => {
    if (!hasLoadedBrands) return;
    if (globalBrandId && globalBrandId !== activeBrandId) {
      setActiveBrandId(globalBrandId);
    }
  }, [globalBrandId, hasLoadedBrands, activeBrandId]);

  const buildCurrentAgentHref = (promptOverride?: string) => {
    const params = new URLSearchParams();
    if (queryMissionId) {
      params.set('missionId', queryMissionId);
    } else {
      const nextPrompt = (promptOverride ?? prompt).trim();
      if (nextPrompt) {
        params.set('prompt', nextPrompt);
      }
    }

    const query = params.toString();
    return query ? `/agent?${query}` : '/agent';
  };

  const redirectToBrandSetup = (returnTo = buildCurrentAgentHref()) => {
    replace(buildAgentBrandSetupHref({ returnTo }));
  };

  const {
    missions,
    statusCounts,
    total,
    isLoading: isMissionListLoading,
    createMission,
    refresh: refreshMissions,
  } = useAgentMissions({
    brandId: activeBrandId || undefined,
    search: missionSearch.trim() || undefined,
  });

  const {
    mission: activeMissionDetail,
    events: missionEvents,
    links: missionLinks,
    isLoading: isMissionLoading,
    refresh: refreshMission,
  } = useAgentMission(activeMissionId || null);

  const {
    summary: missionContextSummary,
    approvals: missionApprovals,
    scheduledTasks: missionScheduledTasks,
    refresh: refreshMissionContext,
  } = useAgentMissionContext(activeMissionId || null);

  // Live polling when mission is active or waiting for approval
  useEffect(() => {
    const status = activeMissionDetail?.status;
    if (!activeMissionId || isLoading || (status !== 'active' && status !== 'waiting')) return;

    const interval = setInterval(() => {
      void refreshMission();
      void refreshMissionContext();
    }, 5000);
    return () => clearInterval(interval);
  }, [activeMissionId, activeMissionDetail?.status, isLoading, refreshMission, refreshMissionContext]);

  useEffect(() => {
    if (queryMissionId) {
      setActiveMissionId(queryMissionId);
      setShouldHydrateMission(true);
      return;
    }

    if (activeMissionId) return;

    const storedMissionId = getStoredMissionId();
    const preferredMission = missions.find((mission) => mission._id === storedMissionId) ?? missions[0];

    if (preferredMission) {
      setActiveMissionId(preferredMission._id);
      setShouldHydrateMission(true);
    }
  }, [activeMissionId, missions, queryMissionId]);

  useEffect(() => {
    setStoredMissionId(activeMissionId);
  }, [activeMissionId]);

  useEffect(() => {
    if (!prompt) return;
    setInput(prompt);
  }, [prompt]);

  useEffect(() => {
    if (!hasLoadedBrands || brands.length > 0) return;
    const params = new URLSearchParams();
    if (queryMissionId) {
      params.set('missionId', queryMissionId);
    } else if (prompt.trim()) {
      params.set('prompt', prompt.trim());
    }
    const returnTo = params.toString() ? `/agent?${params.toString()}` : '/agent';
    replace(buildAgentBrandSetupHref({ returnTo }));
  }, [brands.length, hasLoadedBrands, prompt, queryMissionId, replace]);

  // When hydrating, clear live messages so the timeline renders from persisted events
  useEffect(() => {
    if (!activeMissionId || !shouldHydrateMission || isMissionLoading) return;
    setMessages([]);
    setShouldHydrateMission(false);
  }, [activeMissionId, isMissionLoading, shouldHydrateMission]);

  useEffect(() => {
    if (activeMissionId || isMissionLoading) return;
    if (messages.length === 0) {
      setMessages([DEFAULT_AGENT_MESSAGE]);
    }
  }, [activeMissionId, isMissionLoading, messages.length]);

  const submitMessage = async (messageOverride?: string) => {
    const nextMessage = (messageOverride ?? input).trim();
    if (!nextMessage || isLoading || !session?.user?.id) return;
    if (hasLoadedBrands && brands.length === 0) {
      redirectToBrandSetup(buildCurrentAgentHref(nextMessage));
      return;
    }

    const existingMissionId = activeMissionId || undefined;
    let responseMissionId = existingMissionId;

    setInput('');
    setMessages((previous) => [...previous, { role: 'user', content: nextMessage }]);
    setIsLoading(true);

    const historyFromEvents = toMissionMessages(missionEvents);

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeBrandId ? { 'x-brand-id': activeBrandId } : {}),
        },
        body: JSON.stringify({
          message: nextMessage,
          history: historyFromEvents,
          missionId: existingMissionId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to fetch Agent response');
      }

      responseMissionId = response.headers.get('x-mission-id') || existingMissionId;
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

      await refreshMissions();

      if (responseMissionId) {
        await refreshMission();
        await refreshMissionContext();
        setMessages([]);
        setShouldHydrateMission(false);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
      console.error('Agent workspace error:', error);
      setMessages((previous) => [
        ...previous,
        { role: 'assistant', content: `Sorry, I hit an error while handling that request: ${errorMessage}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const activeMission =
    activeMissionDetail ?? missions.find((mission) => mission._id === activeMissionId) ?? null;
  const userTurns = messages.filter((message) => message.role === 'user').length;
  const activeBrand = brands.find((brand) => brand.id === activeBrandId);
  const starterPrompts = getAgentStarterPrompts(userTurns > 0);
  const toolsUsed = missionEvents.filter(
    (event) => event.type === 'tool_call' || event.type === 'tool_result'
  ).length;
  const liveCount = (statusCounts.active || 0) + (statusCounts.waiting || 0);

  const userInitials = getUserInitials(session?.user?.name, session?.user?.email);

  // Filter live messages to suppress the default greeting if there is mission history
  const liveMessages = useMemo(() => {
    if (activeMissionId && missionEvents.length > 0) return messages;
    return messages.filter(
      (message) =>
        !(
          message.role === 'assistant' &&
          typeof message.content === 'string' &&
          message.content === DEFAULT_AGENT_MESSAGE.content
        )
    );
  }, [activeMissionId, messages, missionEvents.length]);

  const handleApproveAction = async (approvalId: string) => {
    try {
      await fetch(`/api/v2/agent/approvals/${approvalId}/approve`, { method: 'POST' });
      await refreshMissionContext();
    } catch (error) {
      console.error('Failed to approve action:', error);
    }
  };

  const handleRejectAction = async (approvalId: string) => {
    try {
      await fetch(`/api/v2/agent/approvals/${approvalId}/reject`, { method: 'POST' });
      await refreshMissionContext();
    } catch (error) {
      console.error('Failed to reject action:', error);
    }
  };

  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      await fetch(`/api/v2/agent/scheduled-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      await refreshMissionContext();
    } catch (error) {
      console.error('Failed to toggle scheduled task:', error);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    try {
      await fetch(`/api/v2/agent/scheduled-tasks/${taskId}`, { method: 'DELETE' });
      await refreshMissionContext();
    } catch (error) {
      console.error('Failed to cancel scheduled task:', error);
    }
  };

  const handleRetryTask = async (taskId: string) => {
    try {
      await fetch(`/api/v2/agent/scheduled-tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });
      await refreshMissionContext();
    } catch (error) {
      console.error('Failed to retry scheduled task:', error);
    }
  };

  const handleDeleteMission = async (missionId: string) => {
    try {
      await fetch(`/api/v2/agent/missions/${missionId}`, { method: 'DELETE' });
      if (activeMissionId === missionId) {
        setActiveMissionId('');
        setStoredMissionId('');
        setMessages([DEFAULT_AGENT_MESSAGE]);
      }
      await refreshMissions();
    } catch (error) {
      console.error('Failed to delete mission:', error);
    }
  };

  const handleChangeMissionMode = async (mode: AgentMissionListItem['mode']) => {
    if (!activeMissionId) return;
    try {
      await fetch(`/api/v2/agent/missions/${activeMissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      await refreshMission();
    } catch (error) {
      console.error('Failed to update mission mode:', error);
    }
  };

  const handleCreateMission = async () => {
    if (hasLoadedBrands && brands.length === 0) {
      redirectToBrandSetup();
      return;
    }

    try {
      const nextMission = await createMission({
        brandId: activeBrandId,
        status: 'draft',
        mode: 'mixed',
      });
      const nextMissionId = nextMission?._id || nextMission?.id;
      if (!nextMissionId) return;
      setActiveMissionId(String(nextMissionId));
      setMessages([DEFAULT_AGENT_MESSAGE]);
      setShouldHydrateMission(true);
      await refreshMissions();
    } catch (error) {
      console.error('Failed to create mission:', error);
    }
  };

  const handleCreateMissionFromTemplate = async (template: MissionTemplate) => {
    if (hasLoadedBrands && brands.length === 0) {
      redirectToBrandSetup(`/agent?prompt=${encodeURIComponent(template.starterPrompt)}`);
      return;
    }

    try {
      const nextMission = await createMission({
        brandId: activeBrandId,
        title: template.title,
        summary: template.summary,
        status: 'draft',
        mode: 'mixed',
      });
      const nextMissionId = nextMission?._id || nextMission?.id;
      if (!nextMissionId) return;
      setActiveMissionId(String(nextMissionId));
      setInput(template.starterPrompt);
      setMessages([
        {
          role: 'assistant',
          content: `${template.title} template loaded. ${template.description} Review the starter prompt below and send it when you want the Agent to begin.`,
        },
      ]);
      setShouldHydrateMission(false);
      setIsTemplatePickerOpen(false);
      await refreshMissions();
    } catch (error) {
      console.error('Failed to create mission from template:', error);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-5.5rem)] gap-2.5">
      <MissionTemplatePicker
        open={isTemplatePickerOpen}
        onOpenChange={setIsTemplatePickerOpen}
        templates={missionTemplates}
        onSelectTemplate={(template) => void handleCreateMissionFromTemplate(template)}
      />

      <AgentMissionRail
        missions={missions}
        isLoading={isMissionListLoading}
        activeMissionId={activeMissionId}
        searchValue={missionSearch}
        onSearchChange={setMissionSearch}
        onSelectMission={(missionId) => {
          setActiveMissionId(missionId);
          setShouldHydrateMission(true);
        }}
        onDeleteMission={(missionId) => void handleDeleteMission(missionId)}
        onCreateMission={() => void handleCreateMission()}
        onOpenTemplates={() => setIsTemplatePickerOpen(true)}
        formatTime={formatMissionTime}
        getSpecialistLabel={getMissionSpecialistLabel}
        liveCount={liveCount}
        totalCount={total || missions.length}
        showBrandBadge={!activeBrandId}
      />

      <AgentConversation
        mission={activeMission}
        events={missionEvents}
        liveMessages={liveMessages}
        isLoading={isLoading}
        isMissionLoading={isMissionLoading}
        input={input}
        onInputChange={setInput}
        onSubmit={() => void submitMessage()}
        onChangeMode={(mode) => void handleChangeMissionMode(mode)}
        formatTime={formatMissionTime}
        getModeLabel={getMissionModeLabel}
        starterPrompts={starterPrompts}
        onStarterPrompt={(value) => void submitMessage(value)}
        activeBrand={activeBrand}
        userTurns={userTurns}
        userInitials={userInitials}
      />

      {isContextOpen ? (
        <AgentContextRail
          mission={activeMission}
          summary={missionContextSummary}
          events={missionEvents}
          approvals={missionApprovals}
          scheduledTasks={missionScheduledTasks}
          links={missionLinks}
          toolsUsed={toolsUsed}
          activeBrand={activeBrand}
          formatTime={formatMissionTime}
          onChangeMode={(mode) => void handleChangeMissionMode(mode)}
          onApprove={(id) => void handleApproveAction(id)}
          onReject={(id) => void handleRejectAction(id)}
          onToggleTask={(id, status) => void handleToggleTask(id, status)}
          onCancelTask={(id) => void handleCancelTask(id)}
          onRetryTask={(id) => void handleRetryTask(id)}
          onClose={() => setIsContextOpen(false)}
          modeLabel={getMissionModeLabel}
        />
      ) : (
        <IconButton
          icon={PanelRightOpen}
          iconSize={14}
          onClick={() => setIsContextOpen(true)}
          aria-label="Show context"
          className={cn(
            'h-12 w-9 shrink-0 self-start rounded-l-md rounded-r-none border border-r-0 border-white/55 bg-white/72 backdrop-blur-md dark:border-white/[0.07] dark:bg-[#10101A]/78'
          )}
        />
      )}
    </div>
  );
}
