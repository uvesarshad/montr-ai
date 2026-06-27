import type { AgentMissionLink } from '@/hooks/agent/use-agent-mission';

type MissionLinkGroupId = 'knowledge' | 'roadmap' | 'records' | 'views';

type MissionLinkGroup = {
  id: MissionLinkGroupId;
  label: string;
  links: AgentMissionLink[];
};

const groupMeta: Record<MissionLinkGroupId, { label: string }> = {
  knowledge: { label: 'Knowledge' },
  roadmap: { label: 'Roadmap' },
  records: { label: 'Records' },
  views: { label: 'Views' },
};

function getMissionLinkGroupId(link: AgentMissionLink): MissionLinkGroupId {
  if (link.targetType === 'brand_memory') {
    return 'knowledge';
  }

  if (link.targetType === 'roadmap_task') {
    return 'roadmap';
  }

  if (link.targetType === 'view') {
    return 'views';
  }

  return 'records';
}

export function groupMissionLinks(links: AgentMissionLink[]): MissionLinkGroup[] {
  const grouped = new Map<MissionLinkGroupId, AgentMissionLink[]>();

  for (const link of links) {
    const groupId = getMissionLinkGroupId(link);
    const current = grouped.get(groupId) || [];
    current.push(link);
    grouped.set(groupId, current);
  }

  const orderedIds: MissionLinkGroupId[] = ['knowledge', 'roadmap', 'records', 'views'];

  return orderedIds
    .map((id) => {
      const groupLinks = grouped.get(id) || [];
      if (groupLinks.length === 0) {
        return null;
      }

      return {
        id,
        label: groupMeta[id].label,
        links: groupLinks,
      };
    })
    .filter((group): group is MissionLinkGroup => Boolean(group));
}
