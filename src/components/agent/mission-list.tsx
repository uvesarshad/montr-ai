'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';

import { Button, Chip, IconButton } from '@/components/ui-kit';
import { AgentMissionListItem } from '@/hooks/agent/use-agent-missions';
import { cn } from '@/lib/utils';
import type { ChipTone } from '@/components/ui-kit';

interface MissionListProps {
  missions: AgentMissionListItem[];
  activeMissionId: string;
  isLoading: boolean;
  onSelectMission: (missionId: string) => void;
  onDeleteMission?: (missionId: string) => void;
  formatTime: (value?: string | Date | null) => string;
  getStatusClasses: (status: AgentMissionListItem['status']) => string;
  getSpecialistLabel: (agentId?: string) => string;
}

const STATUS_TONE: Record<string, ChipTone> = {
  active:    'ok',
  draft:     'gray',
  waiting:   'warn',
  blocked:   'danger',
  scheduled: 'purple',
  completed: 'info',
};

export function MissionList({
  missions,
  activeMissionId,
  isLoading,
  onSelectMission,
  onDeleteMission,
  formatTime,
  getSpecialistLabel,
}: MissionListProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteClick = (event: React.MouseEvent, missionId: string) => {
    event.stopPropagation();
    setConfirmDeleteId(missionId);
  };

  const handleConfirmDelete = (event: React.MouseEvent, missionId: string) => {
    event.stopPropagation();
    setConfirmDeleteId(null);
    onDeleteMission?.(missionId);
  };

  const handleCancelDelete = (event: React.MouseEvent) => {
    event.stopPropagation();
    setConfirmDeleteId(null);
  };

  return (
    <div className="space-y-2 pt-2">
      <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Missions
      </div>
      <div className="h-[calc(100vh-23rem)] space-y-2 overflow-y-auto pr-1">
        {missions.map((mission) => (
          <div key={mission._id} className="group relative">
            <button
              type="button"
              onClick={() => onSelectMission(mission._id)}
              className={cn(
                'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                mission._id === activeMissionId
                  ? 'border-brand/30 bg-accent text-foreground shadow-sm'
                  : 'border-border bg-card text-foreground hover:bg-muted'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate pr-6 text-sm font-medium text-foreground">{mission.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {mission.summary}
                  </div>
                </div>
                <Chip tone={STATUS_TONE[mission.status] ?? 'gray'} className="shrink-0">
                  {mission.status}
                </Chip>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span className="truncate font-mono">{getSpecialistLabel(mission.activeAgentId)}</span>
                <span className="shrink-0 font-mono">{formatTime(mission.lastActivityAt)}</span>
              </div>
            </button>

            {onDeleteMission && confirmDeleteId !== mission._id && (
              <IconButton
                icon={Trash2}
                iconSize={14}
                aria-label="Delete mission"
                className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                onClick={(event) => handleDeleteClick(event, mission._id)}
              />
            )}

            {confirmDeleteId === mission._id && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl border border-border bg-card/95 px-3">
                <span className="text-xs text-muted-foreground">Delete mission?</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                  onClick={(event) => handleConfirmDelete(event, mission._id)}
                >
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={handleCancelDelete}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ))}

        {!isLoading && missions.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3.5 py-6 text-sm text-muted-foreground">
            No missions match this view yet. Start from a template, create a blank mission, or ask the Agent to begin one.
          </div>
        )}
      </div>
    </div>
  );
}
