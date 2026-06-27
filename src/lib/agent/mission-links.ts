interface MissionLinkResult {
  targetType: string;
  targetId: string;
  targetLabel?: string;
  targetRoute?: string;
  metadata?: Record<string, unknown>;
}

type ToolArgs = Record<string, unknown>;
type SuccessfulToolResult = Record<string, unknown> & {
  success?: boolean;
  deepLink?: string;
};

function isSuccessfulToolResult(result: unknown): result is SuccessfulToolResult {
  return Boolean(
    result &&
    typeof result === 'object' &&
    ('success' in result ? (result as { success?: unknown }).success !== false : true)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toTitleCase(value: string) {
  return value
    .split(/[\s/-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function getViewLabelFromRoute(route: string) {
  const lastSegment = route.split('/').filter(Boolean).pop();
  if (!lastSegment) {
    return 'Linked view';
  }

  const parentSegment = route.split('/').filter(Boolean).slice(-2, -1)[0];
  if (parentSegment && lastSegment !== parentSegment) {
    return `${toTitleCase(parentSegment)} ${toTitleCase(lastSegment)}`;
  }

  return toTitleCase(lastSegment);
}

function withSourceTool(toolName: string, metadata?: Record<string, unknown>) {
  return {
    sourceTool: toolName,
    ...(metadata || {}),
  };
}

export function extractMissionLinksFromToolResult(
  toolName: string,
  result: unknown,
  args?: ToolArgs
): MissionLinkResult[] {
  if (!isSuccessfulToolResult(result)) {
    return [];
  }

  if (toolName === 'createContact' && isNonEmptyString(result.contactId)) {
    return [{
      targetType: 'contact',
      targetId: result.contactId,
      targetLabel: 'Contact record',
      targetRoute: `/crm/contacts/${result.contactId}`,
      metadata: withSourceTool(toolName),
    }];
  }

  if ((toolName === 'createDeal' || toolName === 'updateDealStage') && isNonEmptyString(result.dealId)) {
    return [{
      targetType: 'deal',
      targetId: result.dealId,
      targetLabel: 'Deal record',
      targetRoute: `/crm/deals/${result.dealId}`,
      metadata: withSourceTool(toolName),
    }];
  }

  if (toolName === 'schedulePost' && isNonEmptyString(result.draftId)) {
    return [{
      targetType: 'draft',
      targetId: result.draftId,
      targetLabel: 'Social draft',
      targetRoute: isNonEmptyString(result.deepLink) ? result.deepLink : '/social/drafts',
      metadata: withSourceTool(toolName),
    }];
  }

  if (toolName === 'addToKnowledgeBase' && isNonEmptyString(args?.title)) {
    return [{
      targetType: 'brand_memory',
      targetId: isNonEmptyString(result.entryId) ? result.entryId : args.title,
      targetLabel: args.title,
      targetRoute: isNonEmptyString(result.deepLink) ? result.deepLink : '/settings?tab=brand-memory',
      metadata: withSourceTool(toolName),
    }];
  }

  if (toolName === 'triggerWorkflow' && isNonEmptyString(result.workflowId)) {
    return [{
      targetType: 'workflow',
      targetId: result.workflowId,
      targetLabel: 'Workflow',
      targetRoute: `/crm/workflows/${result.workflowId}`,
      metadata: withSourceTool(toolName, {
        executionId: isNonEmptyString(result.executionId) ? result.executionId : undefined,
        status: isNonEmptyString(result.status) ? result.status : undefined,
      }),
    }];
  }

  if (toolName === 'addRoadmapTask' && isNonEmptyString(result.taskId)) {
    return [{
      targetType: 'roadmap_task',
      targetId: result.taskId,
      targetLabel: isNonEmptyString(args?.title) ? args.title : 'Roadmap task',
      targetRoute: '/dashboard',
      metadata: withSourceTool(toolName, {
        taskType: isNonEmptyString(args?.type) ? args.type : undefined,
      }),
    }];
  }

  if (toolName === 'completeRoadmapTask' && isNonEmptyString(result.taskId)) {
    return [{
      targetType: 'roadmap_task',
      targetId: result.taskId,
      targetLabel: isNonEmptyString(result.taskTitle) ? result.taskTitle : 'Roadmap task',
      targetRoute: '/dashboard',
      metadata: withSourceTool(toolName, {
        xpEarned: typeof result.xpEarned === 'number' ? result.xpEarned : undefined,
      }),
    }];
  }

  if (toolName === 'executeRoadmapTask' && isNonEmptyString(result.taskId)) {
    return [{
      targetType: 'roadmap_task',
      targetId: result.taskId,
      targetLabel: isNonEmptyString(result.taskTitle) ? result.taskTitle : 'Roadmap task',
      targetRoute: '/dashboard',
      metadata: withSourceTool(toolName, {
        requiresApproval: typeof result.requiresApproval === 'boolean' ? result.requiresApproval : undefined,
      }),
    }];
  }

  if (isNonEmptyString(result.deepLink) && result.deepLink.startsWith('/')) {
    return [{
      targetType: 'view',
      targetId: result.deepLink,
      targetLabel: getViewLabelFromRoute(result.deepLink),
      targetRoute: result.deepLink,
      metadata: withSourceTool(toolName),
    }];
  }

  return [];
}
