import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the UnifiedWorkflow model + the enqueue function so the test runs
// without a real Mongo connection. We exercise the dispatcher's filter logic
// against a synthetic set of workflows.
vi.mock('../../db/models/unified-workflow.model', () => {
  return {
    UnifiedWorkflow: {
      find: vi.fn(),
    },
  };
});
vi.mock('../queue/execution-queue', () => ({
  enqueueExecution: vi.fn().mockResolvedValue({ jobId: 'test-job' }),
  QueueDepthExceededError: class QueueDepthExceededError extends Error {},
  ExecutionQuotaExceededError: class ExecutionQuotaExceededError extends Error {},
  QuotaCheckUnavailableError: class QuotaCheckUnavailableError extends Error {},
}));

import { dispatchTrigger } from './dispatch';
import { UnifiedWorkflow } from '../../db/models/unified-workflow.model';

const findMock = UnifiedWorkflow.find as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  findMock.mockReset();
});

const baseEvent = {
  organizationId: '507f1f77bcf86cd799439011',
  aiBotId: '507f1f77bcf86cd799439012',
  conversationId: '507f1f77bcf86cd799439013',
  channel: 'whatsapp' as const,
};

describe('dispatchTrigger — ai_bot.escalation_requested', () => {
  it('fires for workflows whose trigger.type matches', async () => {
    findMock.mockResolvedValueOnce([
      { _id: 'w1', trigger: { type: 'ai_bot.escalation_requested', config: {} }, status: 'active' },
    ]);

    const result = await dispatchTrigger({
      kind: 'ai_bot.escalation_requested',
      reason: 'customer asked for human',
      ...baseEvent,
    });

    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', 'trigger.type': 'ai_bot.escalation_requested' }),
    );
    expect(result.matched).toBe(1);
  });

  it('filters by aiBotId when workflow trigger.config narrows', async () => {
    findMock.mockResolvedValueOnce([
      {
        _id: 'w1',
        trigger: { type: 'ai_bot.escalation_requested', config: { aiBotId: 'other-bot' } },
        status: 'active',
      },
      {
        _id: 'w2',
        trigger: { type: 'ai_bot.escalation_requested', config: { aiBotId: baseEvent.aiBotId } },
        status: 'active',
      },
    ]);

    const result = await dispatchTrigger({
      kind: 'ai_bot.escalation_requested',
      ...baseEvent,
    });

    expect(result.matched).toBe(1);
  });

  it('filters by channel when configured', async () => {
    findMock.mockResolvedValueOnce([
      {
        _id: 'w1',
        trigger: { type: 'ai_bot.escalation_requested', config: { channel: 'inbox' } },
        status: 'active',
      },
      {
        _id: 'w2',
        trigger: { type: 'ai_bot.escalation_requested', config: { channel: 'whatsapp' } },
        status: 'active',
      },
    ]);

    const result = await dispatchTrigger({
      kind: 'ai_bot.escalation_requested',
      ...baseEvent, // channel: 'whatsapp'
    });

    expect(result.matched).toBe(1);
  });
});

describe('dispatchTrigger — ai_bot.conversation_ended', () => {
  it('routes through dispatchAiBot and matches workflows', async () => {
    findMock.mockResolvedValueOnce([
      { _id: 'w1', trigger: { type: 'ai_bot.conversation_ended', config: {} }, status: 'active' },
    ]);

    const result = await dispatchTrigger({
      kind: 'ai_bot.conversation_ended',
      turnCount: 10,
      ...baseEvent,
    });

    expect(result.matched).toBe(1);
  });
});
