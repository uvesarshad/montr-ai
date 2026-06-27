'use client';

/**
 * StudioWorkspace — the unified, type-first AI Studio surface.
 *
 * One ModuleShell (rail-less, editor density) with the mode switcher in the
 * filter bar and a 3-pane body: history sidebar | mode view | (mode owns its
 * own right-hand params). Replaces the five separate route-pages.
 *
 * History is source-aware: image/video projects come from AiStudioProject,
 * text threads from the Conversation model (full backfill is M3). Selection is
 * tracked as {source, id} so a project id and a conversation id never collide.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { useStudioProjects } from '@/hooks/ai-studio/use-studio-projects';
import { useCharacters } from '@/hooks/ai-studio/use-characters';
import { useConversations } from '@/hooks/use-conversations';
import { useToast } from '@/hooks/use-toast';

import { ModeSwitcher } from './mode-switcher';
import { HistorySidebar } from './history-sidebar';
import { ImageMode } from './image-mode';
import { VideoMode } from './video-mode';
import { AudioMode } from './audio-mode';
import { TextMode } from './text-mode';
import { CharacterMode } from './character-mode';
import { LegacyMediaViewer } from './legacy-media-viewer';
import { ModeBridge } from './mode-bridge';
import {
  STUDIO_MODE_META,
  STUDIO_MODE_ORDER,
  type StudioHistoryItem,
  type StudioMode,
} from './studio-meta';

type ActiveSelection = { source: 'project' | 'conversation' | 'character'; id: string } | null;

export function StudioWorkspace({
  initialMode,
  initialConversationId,
}: { initialMode?: StudioMode; initialConversationId?: string } = {}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<StudioMode>(initialMode ?? 'image');
  const [active, setActive] = useState<ActiveSelection>(
    initialConversationId ? { source: 'conversation', id: initialConversationId } : null,
  );

  const {
    projects,
    isLoading: projectsLoading,
    archiveProject,
    refresh: refreshProjects,
  } = useStudioProjects();

  // No type filter — text threads are live; image/video conversations are
  // legacy read-only history (made on the old pages). createConversation()
  // still defaults to type 'text'.
  const {
    conversations,
    isLoading: convsLoading,
    createConversation,
    updateConversation,
    refresh: refreshConvs,
  } = useConversations();

  const {
    characters,
    isLoading: charsLoading,
    archiveCharacter,
    refresh: refreshChars,
  } = useCharacters();

  // Normalize both sources into one history list (text lives in conversations).
  const items = useMemo<StudioHistoryItem[]>(() => {
    const fromProjects: StudioHistoryItem[] = projects
      .filter((p) => p.kind !== 'text')
      .map((p) => ({
        source: 'project',
        id: p._id,
        kind: p.kind as StudioHistoryItem['kind'],
        name: p.name,
        updatedAt: p.updatedAt,
        count: p.sessionCount,
      }));
    const fromConvs: StudioHistoryItem[] = conversations
      .filter((c) => !c.type || c.type === 'text' || c.type === 'image' || c.type === 'video')
      .map((c) => ({
        source: 'conversation',
        id: c._id,
        kind: (c.type ?? 'text') as StudioHistoryItem['kind'],
        name: c.title,
        updatedAt: c.updatedAt,
        count: c.messageCount,
      }));
    const fromChars: StudioHistoryItem[] = characters.map((ch) => ({
      source: 'character',
      id: ch._id,
      kind: 'character',
      name: ch.name,
      updatedAt: ch.updatedAt,
      count: ch.usageCount,
    }));
    return [...fromProjects, ...fromConvs, ...fromChars];
  }, [projects, conversations, characters]);

  // Deep-link sync: when opened with ?c=<conversationId>, switch the mode to
  // match that conversation's kind once it loads (text/image/video). Runs once.
  const deepLinkSyncedRef = useRef(false);
  useEffect(() => {
    if (deepLinkSyncedRef.current || !initialConversationId) return;
    const item = items.find((i) => i.source === 'conversation' && i.id === initialConversationId);
    if (!item) return;
    deepLinkSyncedRef.current = true;
    if ((STUDIO_MODE_ORDER as string[]).includes(item.kind)) {
      setMode(item.kind as StudioMode);
    }
  }, [initialConversationId, items]);

  const createTextThread = useCallback(async () => {
    try {
      const c = await createConversation();
      setMode('text');
      setActive({ source: 'conversation', id: c._id });
    } catch {
      toast({ variant: 'destructive', title: 'Could not start a chat', description: 'Please try again.' });
    }
  }, [createConversation, toast]);

  const handleSelect = useCallback((item: StudioHistoryItem) => {
    if ((STUDIO_MODE_ORDER as string[]).includes(item.kind)) {
      setMode(item.kind as StudioMode);
    }
    setActive({ source: item.source, id: item.id });
  }, []);

  const handleNew = useCallback(() => {
    if (mode === 'text') {
      void createTextThread();
    } else {
      setActive(null);
    }
  }, [mode, createTextThread]);

  const handleModeChange = useCallback((m: StudioMode) => {
    setMode(m);
    setActive(null);
  }, []);

  const handleArchive = useCallback(
    async (item: StudioHistoryItem) => {
      if (item.source === 'project') {
        await archiveProject(item.id);
      } else if (item.source === 'character') {
        await archiveCharacter(item.id);
      } else {
        await updateConversation(item.id, { isArchived: true });
      }
      setActive((cur) => (cur && cur.id === item.id ? null : cur));
    },
    [archiveProject, archiveCharacter, updateConversation],
  );

  const handleProjectCreated = useCallback(
    (projectId: string) => {
      setActive({ source: 'project', id: projectId });
      refreshProjects();
    },
    [refreshProjects],
  );

  const handleCharacterSaved = useCallback(
    (id: string) => {
      setActive({ source: 'character', id });
      refreshChars();
    },
    [refreshChars],
  );

  const activeProjectId = active?.source === 'project' ? active.id : null;
  const activeConversationId = active?.source === 'conversation' ? active.id : null;
  const activeCharacterId = active?.source === 'character' ? active.id : null;
  const meta = STUDIO_MODE_META[mode];

  return (
    <ModuleShell
      title="AI Studio"
      icon={Sparkles}
      meta={meta.label}
      editor
      filterBar={<ModeSwitcher mode={mode} onChange={handleModeChange} />}
      // The (app) main is min-h-screen (no h-full chain); give the shell a
      // concrete viewport height so editor flex-1 + internal column scroll work.
      // ~6.5rem ≈ header + header/main gap + pb-6. Tune in QA if it scrolls.
      className="h-[calc(100vh-6.5rem)]"
      contentClassName="overflow-hidden rounded-xl border border-border"
    >
      <div className="flex h-full min-h-0">
        <HistorySidebar
          items={items}
          isLoading={projectsLoading || convsLoading || charsLoading}
          activeId={active?.id ?? null}
          onSelect={handleSelect}
          onNew={handleNew}
          onArchive={handleArchive}
        />
        <div className="min-w-0 flex-1">
          {mode === 'image' ? (
            active?.source === 'conversation' ? (
              <LegacyMediaViewer conversationId={active.id} kind="image" />
            ) : (
              <ImageMode activeProjectId={activeProjectId} onProjectCreated={handleProjectCreated} />
            )
          ) : mode === 'video' ? (
            active?.source === 'conversation' ? (
              <LegacyMediaViewer conversationId={active.id} kind="video" />
            ) : (
              <VideoMode activeProjectId={activeProjectId} onProjectCreated={handleProjectCreated} />
            )
          ) : mode === 'audio' ? (
            <AudioMode activeProjectId={activeProjectId} onProjectCreated={handleProjectCreated} />
          ) : mode === 'text' ? (
            <TextMode
              conversationId={activeConversationId}
              onRequestNew={() => void createTextThread()}
              onActivity={refreshConvs}
            />
          ) : mode === 'character' ? (
            <CharacterMode characterId={activeCharacterId} onSaved={handleCharacterSaved} />
          ) : (
            <ModeBridge meta={meta} />
          )}
        </div>
      </div>
    </ModuleShell>
  );
}
