
import { it, expect } from 'vitest';
import { extractMissionLinksFromToolResult } from './mission-links';

it('extractMissionLinksFromToolResult maps CRM contact creation to a contact record link', () => {
  const links = extractMissionLinksFromToolResult('createContact', {
    success: true,
    contactId: 'contact-123',
    message: 'Contact created successfully.',
  });

  expect(links).toEqual([
    {
      targetType: 'contact',
      targetId: 'contact-123',
      targetLabel: 'Contact record',
      targetRoute: '/crm/contacts/contact-123',
      metadata: {
        sourceTool: 'createContact',
      },
    },
  ]);
});

it('extractMissionLinksFromToolResult maps deal updates to the canonical deal route', () => {
  const links = extractMissionLinksFromToolResult('updateDealStage', {
    success: true,
    dealId: 'deal-987',
    newStage: 'Negotiation',
  });

  expect(links).toEqual([
    {
      targetType: 'deal',
      targetId: 'deal-987',
      targetLabel: 'Deal record',
      targetRoute: '/crm/deals/deal-987',
      metadata: {
        sourceTool: 'updateDealStage',
      },
    },
  ]);
});

it('extractMissionLinksFromToolResult preserves social draft ids and routes', () => {
  const links = extractMissionLinksFromToolResult('schedulePost', {
    success: true,
    draftId: 'draft-55',
    deepLink: '/social/drafts',
    message: 'Draft created.',
  });

  expect(links).toEqual([
    {
      targetType: 'draft',
      targetId: 'draft-55',
      targetLabel: 'Social draft',
      targetRoute: '/social/drafts',
      metadata: {
        sourceTool: 'schedulePost',
      },
    },
  ]);
});

it('extractMissionLinksFromToolResult creates a brand memory link from knowledge base writes', () => {
  const links = extractMissionLinksFromToolResult(
    'addToKnowledgeBase',
    {
      success: true,
      entryId: 'kb-777',
      deepLink: '/settings?tab=brand-memory',
    },
    {
      title: 'Voice and tone guardrails',
    }
  );

  expect(links).toEqual([
    {
      targetType: 'brand_memory',
      targetId: 'kb-777',
      targetLabel: 'Voice and tone guardrails',
      targetRoute: '/settings?tab=brand-memory',
      metadata: {
        sourceTool: 'addToKnowledgeBase',
      },
    },
  ]);
});

it('extractMissionLinksFromToolResult creates workflow links for successful workflow executions', () => {
  const links = extractMissionLinksFromToolResult('triggerWorkflow', {
    success: true,
    workflowId: 'workflow-22',
    executionId: 'execution-9',
    status: 'completed',
  });

  expect(links).toEqual([
    {
      targetType: 'workflow',
      targetId: 'workflow-22',
      targetLabel: 'Workflow',
      targetRoute: '/crm/workflows/workflow-22',
      metadata: {
        executionId: 'execution-9',
        sourceTool: 'triggerWorkflow',
        status: 'completed',
      },
    },
  ]);
});

it('extractMissionLinksFromToolResult maps added roadmap tasks into mission-linked work items', () => {
  const links = extractMissionLinksFromToolResult(
    'addRoadmapTask',
    {
      success: true,
      taskId: 'task-123',
      message: 'Task added successfully.',
    },
    {
      title: 'Draft launch email sequence',
      type: 'campaign',
    }
  );

  expect(links).toEqual([
    {
      targetType: 'roadmap_task',
      targetId: 'task-123',
      targetLabel: 'Draft launch email sequence',
      targetRoute: '/dashboard',
      metadata: {
        sourceTool: 'addRoadmapTask',
        taskType: 'campaign',
      },
    },
  ]);
});

it('extractMissionLinksFromToolResult keeps roadmap task links when a task is completed', () => {
  const links = extractMissionLinksFromToolResult(
    'completeRoadmapTask',
    {
      success: true,
      taskId: 'task-88',
      taskTitle: 'Publish launch teaser',
      xpEarned: 20,
    },
    {
      taskId: 'task-88',
    }
  );

  expect(links).toEqual([
    {
      targetType: 'roadmap_task',
      targetId: 'task-88',
      targetLabel: 'Publish launch teaser',
      targetRoute: '/dashboard',
      metadata: {
        sourceTool: 'completeRoadmapTask',
        xpEarned: 20,
      },
    },
  ]);
});

it('extractMissionLinksFromToolResult links roadmap task execution plans back to the dashboard task', () => {
  const links = extractMissionLinksFromToolResult(
    'executeRoadmapTask',
    {
      success: true,
      taskId: 'task-99',
      taskTitle: 'Launch WhatsApp follow-up flow',
      requiresApproval: true,
    },
    {
      taskId: 'task-99',
    }
  );

  expect(links).toEqual([
    {
      targetType: 'roadmap_task',
      targetId: 'task-99',
      targetLabel: 'Launch WhatsApp follow-up flow',
      targetRoute: '/dashboard',
      metadata: {
        sourceTool: 'executeRoadmapTask',
        requiresApproval: true,
      },
    },
  ]);
});

it('extractMissionLinksFromToolResult falls back to deep links for successful non-record outputs', () => {
  const links = extractMissionLinksFromToolResult('getAnalytics', {
    success: true,
    deepLink: '/social/analytics',
  });

  expect(links).toEqual([
    {
      targetType: 'view',
      targetId: '/social/analytics',
      targetLabel: 'Social Analytics',
      targetRoute: '/social/analytics',
      metadata: {
        sourceTool: 'getAnalytics',
      },
    },
  ]);
});

it('extractMissionLinksFromToolResult ignores unsuccessful or unstructured tool outputs', () => {
  expect(extractMissionLinksFromToolResult('createContact', {
      success: false,
      error: 'Validation failed',
    })).toEqual([]);

  expect(extractMissionLinksFromToolResult('unknownTool', {
      success: true,
      id: 'opaque-1',
    })).toEqual([]);
});
