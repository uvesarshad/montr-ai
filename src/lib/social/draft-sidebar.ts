export interface DraftSidebarDraft {
  id: string;
  brandId: string;
  title: string;
  content: string;
  mediaCount: number;
  platformCount: number;
  lastEditedAt: string;
  createdAt: string;
  scheduleCount: number;
  matchKey?: string;
}

export interface DraftSidebarScheduledPost {
  id: string;
  sourceDraftId?: string | null;
  status: 'scheduled' | 'publishing';
  matchKey?: string;
}

export interface DraftSidebarItem extends DraftSidebarDraft {
  isScheduled: boolean;
  isRepeatedPost: boolean;
  activeScheduledPostId: string | null;
}

export type DraftSidebarFilter = 'all' | 'unscheduled';

export function buildDraftSidebarItems(
  drafts: DraftSidebarDraft[],
  activeScheduledPosts: DraftSidebarScheduledPost[],
): DraftSidebarItem[] {
  const activePostByDraftId = new Map<string, string>();
  const activePostByMatchKey = new Map<string, string>();

  for (const post of activeScheduledPosts) {
    if (post.sourceDraftId && !activePostByDraftId.has(post.sourceDraftId)) {
      activePostByDraftId.set(post.sourceDraftId, post.id);
    }

    if (post.matchKey && !activePostByMatchKey.has(post.matchKey)) {
      activePostByMatchKey.set(post.matchKey, post.id);
    }
  }

  return drafts.map((draft) => {
    const activeScheduledPostId =
      activePostByDraftId.get(draft.id) ??
      (draft.matchKey ? activePostByMatchKey.get(draft.matchKey) ?? null : null);

    return {
      ...draft,
      isScheduled: Boolean(activeScheduledPostId),
      isRepeatedPost: draft.scheduleCount > 1,
      activeScheduledPostId,
    };
  });
}

export function filterDraftSidebarItems(
  items: DraftSidebarItem[],
  filter: DraftSidebarFilter,
) {
  if (filter === 'unscheduled') {
    return items.filter((item) => !item.isScheduled);
  }

  return items;
}
