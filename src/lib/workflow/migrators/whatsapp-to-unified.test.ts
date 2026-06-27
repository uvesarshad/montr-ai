/**
 * Pure-converter tests for the whatsapp_workflows → unified-workflow migrator.
 * No DB I/O — exercises `convertWhatsAppWorkflow` in isolation.
 */

import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { convertWhatsAppWorkflow } from './whatsapp-to-unified';
import { WorkflowStatus, WorkflowType, VariableScope } from '../../db/models/unified-workflow.model';
import type { IWhatsAppWorkflow } from '../../db/models/whatsapp-workflow.model';

function makeWa(overrides: Partial<IWhatsAppWorkflow> = {}): IWhatsAppWorkflow {
  return {
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    organizationId: new Types.ObjectId(),
    name: 'Test WA workflow',
    status: 'active',
    trigger: { type: 'message', config: {} },
    nodes: [],
    edges: [],
    variables: [],
    executionCount: 0,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as IWhatsAppWorkflow;
}

describe('convertWhatsAppWorkflow', () => {
  it('maps trigger types from legacy → unified', () => {
    const cases: Array<[IWhatsAppWorkflow['trigger']['type'], string]> = [
      ['message', 'message_received'],
      ['keywords', 'keyword_match'],
      ['time', 'scheduled'],
      ['email', 'email_received'],
      ['social_event', 'social_event'],
      ['telegram', 'telegram_message'],
      ['keyword', 'keyword_monitor'],
      ['webhook', 'webhook'],
    ];
    for (const [from, to] of cases) {
      const wa = makeWa({ trigger: { type: from, config: {} } });
      const { workflow } = convertWhatsAppWorkflow(wa);
      expect(workflow.trigger?.type).toBe(to);
    }
  });

  it('converts variables to key/value/scope shape', () => {
    const wa = makeWa({
      variables: [
        { name: 'orderId', type: 'string', defaultValue: '', description: 'Order ID' },
        { name: 'count', type: 'number', defaultValue: 0 },
      ],
    });
    const { workflow } = convertWhatsAppWorkflow(wa);
    expect(workflow.variables).toHaveLength(2);
    expect(workflow.variables?.[0].key).toBe('orderId');
    expect(workflow.variables?.[0].label).toBe('orderId');
    expect(workflow.variables?.[0].scope).toBe(VariableScope.WORKFLOW);
    expect(workflow.variables?.[1].value).toBe(0);
  });

  it('remaps known node subTypes (send-text → send_whatsapp_text)', () => {
    const wa = makeWa({
      nodes: [
        {
          id: 'n1',
          type: 'message',
          subType: 'send-text',
          position: { x: 0, y: 0 },
          data: { label: 'Greet', config: { message: 'Hi' } },
        },
      ],
    });
    const { workflow } = convertWhatsAppWorkflow(wa);
    expect(workflow.nodes?.[0].type).toBe('action');
    expect(workflow.nodes?.[0].subType).toBe('send_whatsapp_text');
  });

  it('warns when a node subType has no processor yet', () => {
    const wa = makeWa({
      nodes: [
        {
          id: 'n1',
          type: 'message',
          subType: 'send-pdf',
          position: { x: 0, y: 0 },
          data: { config: { pdfUrl: 'x' } },
        },
      ],
    });
    const { warnings } = convertWhatsAppWorkflow(wa);
    expect(warnings.some(w => w.includes('send_whatsapp_pdf'))).toBe(true);
  });

  it('preserves unknown node subTypes as set_variable placeholders', () => {
    const wa = makeWa({
      nodes: [
        {
          id: 'n1',
          type: 'message',
          subType: 'never-heard-of-it',
          position: { x: 0, y: 0 },
          data: { config: { foo: 'bar' } },
        },
      ],
    });
    const { workflow, warnings } = convertWhatsAppWorkflow(wa);
    expect(workflow.nodes?.[0].subType).toBe('set_variable');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('folds bot-config into a variable set with the original payload', () => {
    const wa = makeWa({
      nodes: [
        {
          id: 'n1',
          type: 'data',
          subType: 'bot-config',
          position: { x: 0, y: 0 },
          data: { config: { personality: 'friendly', language: 'en' } },
        },
      ],
    });
    const { workflow } = convertWhatsAppWorkflow(wa);
    expect(workflow.nodes?.[0].subType).toBe('set_variable');
    const cfg = workflow.nodes?.[0].data?.config as { variable: string; value: unknown };
    expect(cfg.variable).toBe('_legacy_bot_config');
    expect(cfg.value).toMatchObject({ personality: 'friendly', language: 'en' });
  });

  it('falls back organizationId to userId when missing, with a warning', () => {
    const userId = new Types.ObjectId();
    const wa = makeWa({ userId, organizationId: undefined as unknown as Types.ObjectId });
    const { workflow, warnings } = convertWhatsAppWorkflow(wa);
    expect(workflow.organizationId?.toString()).toBe(userId.toString());
    expect(warnings.some(w => w.includes('no organizationId'))).toBe(true);
  });

  it('stamps migrationMetadata with the source id and version', () => {
    const wa = makeWa();
    const { workflow } = convertWhatsAppWorkflow(wa);
    expect(workflow.migrationMetadata?.sourceSystem).toBe('whatsapp_workflow');
    expect(workflow.migrationMetadata?.sourceId?.toString()).toBe(wa._id?.toString());
    expect(workflow.type).toBe(WorkflowType.WHATSAPP);
  });

  it('maps status enum', () => {
    expect(convertWhatsAppWorkflow(makeWa({ status: 'draft' })).workflow.status).toBe(WorkflowStatus.DRAFT);
    expect(convertWhatsAppWorkflow(makeWa({ status: 'paused' })).workflow.status).toBe(WorkflowStatus.PAUSED);
    expect(convertWhatsAppWorkflow(makeWa({ status: 'archived' })).workflow.status).toBe(WorkflowStatus.ARCHIVED);
  });
});
