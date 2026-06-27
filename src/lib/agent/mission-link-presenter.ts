import type { AgentMissionLink } from '@/hooks/agent/use-agent-mission';

type MissionLinkPresentation = {
  title: string;
  badgeLabel: string;
  detail: string;
  routeLabel: string;
  icon: 'brand_memory' | 'roadmap_task' | 'record';
};

function toTitleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function getRoadmapTaskPresentation(link: AgentMissionLink): MissionLinkPresentation {
  const sourceTool = typeof link.metadata?.sourceTool === 'string' ? link.metadata.sourceTool : '';
  const taskType = typeof link.metadata?.taskType === 'string' ? link.metadata.taskType : '';
  const xpEarned = typeof link.metadata?.xpEarned === 'number' ? link.metadata.xpEarned : null;
  const requiresApproval = typeof link.metadata?.requiresApproval === 'boolean'
    ? link.metadata.requiresApproval
    : null;

  if (sourceTool === 'completeRoadmapTask') {
    return {
      title: link.targetLabel || 'Roadmap task',
      badgeLabel: 'Completed task',
      detail: xpEarned
        ? `Marked complete on the roadmap and awarded ${xpEarned} XP.`
        : 'Marked complete on the roadmap.',
      routeLabel: 'Open Roadmap',
      icon: 'roadmap_task',
    };
  }

  if (sourceTool === 'executeRoadmapTask') {
    return {
      title: link.targetLabel || 'Roadmap task',
      badgeLabel: requiresApproval ? 'Execution plan' : 'In progress',
      detail: requiresApproval
        ? 'Execution strategy is ready and may require approval before running.'
        : 'Execution strategy is ready for the linked roadmap task.',
      routeLabel: 'Open Roadmap',
      icon: 'roadmap_task',
    };
  }

  return {
    title: link.targetLabel || 'Roadmap task',
    badgeLabel: taskType ? `${toTitleCase(taskType)} task` : 'Roadmap task',
    detail: 'Added to the marketing roadmap as mission-linked work.',
    routeLabel: 'Open Roadmap',
    icon: 'roadmap_task',
  };
}

export function getMissionLinkPresentation(link: AgentMissionLink): MissionLinkPresentation {
  if (link.targetType === 'brand_memory') {
    return {
      title: link.targetLabel || 'Brand memory entry',
      badgeLabel: 'Brand memory',
      detail: 'Saved to reusable brand knowledge for future agent decisions.',
      routeLabel: 'Open Brand Memory',
      icon: 'brand_memory',
    };
  }

  if (link.targetType === 'roadmap_task') {
    return getRoadmapTaskPresentation(link);
  }

  return {
    title: link.targetLabel || `${toTitleCase(link.targetType)} record`,
    badgeLabel: toTitleCase(link.targetType),
    detail: `Linked ${link.targetType} record available in its native module.`,
    routeLabel: 'Open Record',
    icon: 'record',
  };
}
