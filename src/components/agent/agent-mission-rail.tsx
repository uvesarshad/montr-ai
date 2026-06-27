'use client';

import { useMemo, useState } from 'react';
import {
  CalendarClock,
  ChevronRight,
  FileText,
  FolderKanban,
  Inbox,
  Layers,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button, Chip, SearchInput, EmptyState, IconButton, ConfirmDialog } from '@/components/ui-kit';
import { AgentMissionListItem } from '@/hooks/agent/use-agent-missions';
import styles from './agent-shell.module.css';

type SectionKey = 'active' | 'waiting' | 'scheduled' | 'recent' | 'templates';

interface AgentMissionRailProps {
  missions: AgentMissionListItem[];
  isLoading: boolean;
  activeMissionId: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelectMission: (missionId: string) => void;
  onDeleteMission?: (missionId: string) => void;
  onCreateMission: () => void;
  onOpenTemplates: () => void;
  formatTime: (value?: string | Date | null) => string;
  getSpecialistLabel: (agentId?: string) => string;
  liveCount: number;
  totalCount: number;
  showBrandBadge?: boolean;
}

interface MissionGroup {
  key: SectionKey;
  label: string;
  items: AgentMissionListItem[];
}

function groupMissions(missions: AgentMissionListItem[]): MissionGroup[] {
  const active: AgentMissionListItem[] = [];
  const waiting: AgentMissionListItem[] = [];
  const scheduled: AgentMissionListItem[] = [];
  const recent: AgentMissionListItem[] = [];

  for (const mission of missions) {
    switch (mission.status) {
      case 'active':
      case 'draft':
        active.push(mission);
        break;
      case 'waiting':
      case 'blocked':
        waiting.push(mission);
        break;
      case 'scheduled':
        scheduled.push(mission);
        break;
      case 'completed':
        recent.push(mission);
        break;
      default:
        recent.push(mission);
    }
  }

  return [
    { key: 'active', label: 'Active', items: active },
    { key: 'waiting', label: 'Waiting', items: waiting },
    { key: 'scheduled', label: 'Scheduled', items: scheduled },
    { key: 'recent', label: 'Recent', items: recent.slice(0, 8) },
  ];
}

const SPECIALIST_ICONS: Record<string, { Icon: LucideIcon; tone: string }> = {
  marketing: { Icon: Sparkles, tone: 'bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-300' },
  social:    { Icon: FolderKanban, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300' },
  crm:       { Icon: Users, tone: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300' },
  knowledge: { Icon: FileText, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' },
  automation:{ Icon: Layers, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300' },
  general:   { Icon: Sparkles, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300' },
};

function getMissionIcon(mission: AgentMissionListItem) {
  const key = (mission.activeAgentId || 'general').toLowerCase();
  return SPECIALIST_ICONS[key] ?? SPECIALIST_ICONS.general;
}

function getStatusDot(status: AgentMissionListItem['status']) {
  switch (status) {
    case 'active':
    case 'draft':
      return cn('size-1.5 rounded-full', styles.dotLive, styles.blink);
    case 'waiting':
    case 'blocked':
      return cn('size-1.5 rounded-full', styles.dotWait);
    case 'scheduled':
      return cn('size-1.5 rounded-full', styles.dotSched);
    case 'completed':
      return cn('size-1.5 rounded-full', styles.dotDone);
    default:
      return cn('size-1.5 rounded-full', styles.dotDone);
  }
}

function getStatusLabel(mission: AgentMissionListItem, formatTime: (v?: string | Date | null) => string) {
  const specialist = mission.activeAgentId ? `@${mission.activeAgentId.toLowerCase()}` : 'general';
  switch (mission.status) {
    case 'waiting':
      return 'Awaiting approval';
    case 'blocked':
      return 'Blocked';
    case 'scheduled':
      return `Next ${formatTime(mission.lastActivityAt)}`;
    case 'completed':
      return `Done · ${formatTime(mission.lastActivityAt)}`;
    default:
      return `${specialist} · ${formatTime(mission.lastActivityAt)}`;
  }
}

export function AgentMissionRail({
  missions,
  isLoading,
  activeMissionId,
  searchValue,
  onSearchChange,
  onSelectMission,
  onDeleteMission,
  onCreateMission,
  onOpenTemplates,
  formatTime,
  liveCount,
  totalCount,
  showBrandBadge = false,
}: AgentMissionRailProps) {
  const groups = useMemo(() => groupMissions(missions), [missions]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <aside
      className={cn(
        'flex w-[260px] shrink-0 flex-col overflow-hidden rounded-[10px] border border-white/55 dark:border-white/[0.07]',
        styles.railFrame
      )}
    >
      {/* Top: title + search + new mission */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-black/[0.07] px-3 py-3 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground">Agent</span>
          {liveCount > 0 && (
            <Chip tone="ok" className="h-5 px-1.5 text-[9.5px] uppercase tracking-[0.04em]">
              <span className={cn('size-1 rounded-full bg-current', styles.blink)} />
              {liveCount} Live
            </Chip>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {totalCount}
          </span>
        </div>

        <SearchInput
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search missions..."
        />

        <Button
          variant="brand"
          size="sm"
          icon={Plus}
          onClick={onCreateMission}
          className="w-full justify-center"
        >
          New mission
        </Button>
      </div>

      {/* Scrollable mission groups */}
      <div className={cn('flex-1 overflow-y-auto px-1.5 py-1.5', styles.slimScroll)}>
        {groups.map((group) => {
          if (group.items.length === 0 && group.key !== 'templates') {
            return null;
          }

          return (
            <div key={group.key} className="mb-1">
              <div className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                <span>{group.label}</span>
                <span className="rounded-md bg-black/[0.06] px-1 py-px text-[9.5px] font-semibold dark:bg-white/[0.08]">
                  {group.items.length}
                </span>
              </div>
              {group.items.map((mission) => {
                const { Icon, tone } = getMissionIcon(mission);
                const isActive = mission._id === activeMissionId;

                return (
                  <div
                    key={mission._id}
                    className={cn(
                      'group relative mb-px flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04]',
                      isActive && 'bg-brand-muted',
                      isActive && styles.missionItemActive
                    )}
                    onClick={() => onSelectMission(mission._id)}
                    role="button"
                    tabIndex={0}
                  >
                    <span className={cn('mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px]', tone)}>
                      <Icon className="size-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className={cn(
                          'flex-1 truncate text-[12.5px] leading-tight',
                          isActive ? 'font-semibold text-brand-strong' : 'font-medium text-foreground'
                        )}>
                          {mission.title || 'Untitled mission'}
                        </span>
                        {showBrandBadge && mission.brandId && (
                          <Chip tone="gray" className="h-[15px] max-w-[60px] truncate px-1 text-[9px] font-medium">
                            {mission.brandId.slice(-6)}
                          </Chip>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        <span className={getStatusDot(mission.status)} />
                        <span className="truncate">{getStatusLabel(mission, formatTime)}</span>
                      </div>
                    </div>

                    {onDeleteMission && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfirmDeleteId(mission._id);
                        }}
                        className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-500/15"
                        aria-label="Delete mission"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        <div className="mb-1 mt-2">
          <div className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
            <span>Templates</span>
            <IconButton
              icon={ChevronRight}
              iconSize={12}
              onClick={onOpenTemplates}
              aria-label="Browse templates"
              className="ml-auto size-4"
            />
          </div>
          <button
            type="button"
            onClick={onOpenTemplates}
            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
          >
            <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
              <Sparkles className="size-3" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium text-foreground">Browse templates</div>
              <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">5 mission patterns ready to launch</div>
            </div>
          </button>
        </div>

        {!isLoading && missions.length === 0 && (
          <EmptyState
            icon={Inbox}
            title="No missions yet"
            note="Create one or pick a template to get started."
            className="p-6"
          />
        )}
      </div>

      {/* Bottom nav */}
      <div className="flex shrink-0 flex-col gap-px border-t border-black/[0.07] p-1.5 dark:border-white/[0.06]">
        <Button variant="ghost" size="sm" icon={Inbox} className="w-full justify-start text-muted-foreground">
          All missions
        </Button>
        <Button variant="ghost" size="sm" icon={CalendarClock} className="w-full justify-start text-muted-foreground">
          Schedule
        </Button>
        <Button variant="ghost" size="sm" icon={Settings} className="w-full justify-start text-muted-foreground">
          Agent settings
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
        title="Delete mission?"
        description="This permanently removes the mission and its conversation history."
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteId) onDeleteMission?.(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </aside>
  );
}
