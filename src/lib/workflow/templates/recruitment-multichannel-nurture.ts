/**
 * Recruitment-flow template — multi-channel candidate nurture.
 *
 * The flagship use case: trigger → outbound call → if no answer, fall back
 * to WhatsApp → if no reply, fall back to email → interview reminder.
 *
 * Built as a `workflow_template` doc (B2 owns the template marketplace per
 * the locked decisions). Voice nodes are reserved on B2's branch and become
 * runnable when bundle-3-voice-strengthening merges into v0.5.
 *
 * Seeded via `seedRecruitmentTemplate({ authorId })` — idempotent on the
 * template's `name`.
 */

import { Types } from 'mongoose';
import {
  IWorkflowNode,
  IWorkflowEdge,
  IWorkflowTrigger,
} from '../../db/models/unified-workflow.model';

export const RECRUITMENT_TEMPLATE_NAME = 'Multi-channel candidate nurture';

/**
 * Build the canonical node graph for the recruitment nurture.
 *
 *   trigger.manual
 *     → identity_resolve (ensure CRM contact)
 *       → make_outbound_call (AI agent reads script)
 *         → branch [disposition === 'no_answer']
 *           ├── true: delay 1h → send_whatsapp_template
 *           │              → wait_for_channel_response (24h)
 *           │                → branch [no reply]
 *           │                  ├── true: send_marketing_email → end
 *           │                  └── false: create_activity (replied) → end
 *           └── false: create_activity (talked) → end
 */
export function buildRecruitmentTemplateGraph(): { nodes: IWorkflowNode[]; edges: IWorkflowEdge[]; trigger: IWorkflowTrigger } {
  const trigger: IWorkflowTrigger = {
    type: 'manual',
    config: {},
  };

  const nodes: IWorkflowNode[] = [
    {
      id: 'trigger_1',
      type: 'trigger',
      subType: 'manual',
      position: { x: 200, y: 0 },
      data: { label: 'Start nurture', config: {} },
    },
    {
      id: 'resolve_1',
      type: 'data',
      subType: 'identity_resolve',
      position: { x: 200, y: 120 },
      data: {
        label: 'Resolve / create contact',
        config: {
          email: '{{$trigger.email}}',
          phone: '{{$trigger.phone}}',
          source: 'recruitment-template',
          createIfMissing: true,
        },
      },
    },
    {
      id: 'call_1',
      type: 'action',
      subType: 'make_outbound_call',
      position: { x: 200, y: 240 },
      data: {
        label: 'Call candidate',
        config: {
          contactId: '{{$resolve_1.contactId}}',
          script: 'Hi {{$trigger.firstName}}, this is {{$workflow.recruiter}} calling about the role at {{$workflow.company}}.',
          maxDurationSeconds: 300,
          aiBotId: '{{$workflow.aiBotId}}',
        },
      },
    },
    {
      id: 'branch_no_answer',
      type: 'logic',
      subType: 'branch',
      position: { x: 200, y: 360 },
      data: {
        label: 'No answer?',
        config: {
          isNaturalLanguage: false,
          conditions: [
            {
              variable: '$call_1.disposition',
              operator: 'in',
              value: ['no_answer', 'voicemail', 'failed', 'busy'],
              output: 'true',
            },
          ],
          defaultOutput: 'false',
        },
      },
    },
    {
      id: 'delay_1h',
      type: 'control',
      subType: 'delay',
      position: { x: 100, y: 480 },
      data: {
        label: 'Wait 1 hour',
        config: { delayMs: 60 * 60 * 1000 },
      },
    },
    {
      id: 'wa_1',
      type: 'action',
      subType: 'send_whatsapp_template',
      position: { x: 100, y: 600 },
      data: {
        label: 'WhatsApp follow-up',
        config: {
          templateName: 'recruitment_follow_up',
          templateParams: ['{{$trigger.firstName}}', '{{$workflow.company}}'],
        },
      },
    },
    {
      id: 'wait_reply',
      type: 'control',
      subType: 'wait_for_channel_response',
      position: { x: 100, y: 720 },
      data: {
        label: 'Wait 24h for reply',
        config: {
          contactId: '{{$resolve_1.contactId}}',
          channels: ['whatsapp'],
          timeoutMs: 24 * 60 * 60 * 1000,
        },
      },
    },
    {
      id: 'branch_no_reply',
      type: 'logic',
      subType: 'branch',
      position: { x: 100, y: 840 },
      data: {
        label: 'No reply?',
        config: {
          isNaturalLanguage: false,
          conditions: [
            { variable: '$wait_reply.timedOut', operator: 'equals', value: true, output: 'true' },
          ],
          defaultOutput: 'false',
        },
      },
    },
    {
      id: 'email_1',
      type: 'action',
      subType: 'send_marketing_email',
      position: { x: 0, y: 960 },
      data: {
        label: 'Email final reminder',
        config: {
          subject: 'Last chance — interview slot at {{$workflow.company}}',
          body: 'Hi {{$trigger.firstName}}, we tried reaching you by phone and WhatsApp. Would you still be interested?',
        },
      },
    },
    {
      id: 'activity_replied',
      type: 'action',
      subType: 'create_activity',
      position: { x: 200, y: 960 },
      data: {
        label: 'Log reply',
        config: {
          kind: 'note',
          subject: 'Replied via WhatsApp',
          body: '{{$wait_reply.lastMessage}}',
        },
      },
    },
    {
      id: 'activity_talked',
      type: 'action',
      subType: 'create_activity',
      position: { x: 300, y: 480 },
      data: {
        label: 'Log call',
        config: {
          kind: 'call',
          subject: 'Phone call completed',
          body: '{{$call_1.transcriptSummary}}',
        },
      },
    },
    {
      id: 'end',
      type: 'control',
      subType: 'end',
      position: { x: 200, y: 1080 },
      data: { label: 'End', config: {} },
    },
  ];

  const edges: IWorkflowEdge[] = [
    { id: 'e_trigger_resolve', source: 'trigger_1', target: 'resolve_1' },
    { id: 'e_resolve_call', source: 'resolve_1', target: 'call_1' },
    { id: 'e_call_branch', source: 'call_1', target: 'branch_no_answer' },
    { id: 'e_branch_delay', source: 'branch_no_answer', target: 'delay_1h', sourceHandle: 'true', label: 'no answer' },
    { id: 'e_branch_talked', source: 'branch_no_answer', target: 'activity_talked', sourceHandle: 'false', label: 'talked' },
    { id: 'e_delay_wa', source: 'delay_1h', target: 'wa_1' },
    { id: 'e_wa_wait', source: 'wa_1', target: 'wait_reply' },
    { id: 'e_wait_branch', source: 'wait_reply', target: 'branch_no_reply' },
    { id: 'e_branch_email', source: 'branch_no_reply', target: 'email_1', sourceHandle: 'true', label: 'no reply' },
    { id: 'e_branch_replied', source: 'branch_no_reply', target: 'activity_replied', sourceHandle: 'false', label: 'replied' },
    { id: 'e_email_end', source: 'email_1', target: 'end' },
    { id: 'e_activity_replied_end', source: 'activity_replied', target: 'end' },
    { id: 'e_activity_talked_end', source: 'activity_talked', target: 'end' },
  ];

  return { nodes, edges, trigger };
}

/**
 * Idempotently seed the recruitment template. Safe to re-run.
 *
 * Uses a dynamic import so the seeder typechecks even before the template
 * model is loaded in the host context (e.g. running from an admin tool).
 */
export interface SeedOptions {
  authorId: Types.ObjectId | string;
  authorName?: string;
  /** When true, build the graph but don't persist — for tests / previews. */
  dryRun?: boolean;
}

export async function seedRecruitmentTemplate(options: SeedOptions): Promise<{
  templateId?: string;
  created: boolean;
  dryRun: boolean;
}> {
  const graph = buildRecruitmentTemplateGraph();

  if (options.dryRun) {
    return { created: false, dryRun: true };
  }

  const modulePath = '@/lib/db/models/workflow-template.model';
  const { default: WorkflowTemplate } = (await import(/* webpackIgnore: true */ modulePath)) as {
    default: { findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>, opts: Record<string, unknown>) => Promise<{ _id: { toString(): string } } | null> };
  };

  const doc = await WorkflowTemplate.findOneAndUpdate(
    { name: RECRUITMENT_TEMPLATE_NAME, authorType: 'system' },
    {
      $set: {
        description: 'Multi-channel candidate nurture: call → WhatsApp → email, with reply / no-reply branches.',
        category: 'engagement',
        tags: ['recruitment', 'voice', 'whatsapp', 'email', 'flagship'],
        difficulty: 'medium',
        authorName: options.authorName ?? 'MontrAI System',
        authorType: 'system',
        isOfficial: true,
        workflowType: 'unified',
        trigger: graph.trigger,
        nodes: graph.nodes,
        edges: graph.edges,
        variables: [
          { key: 'recruiter', label: 'Recruiter name', type: 'string', scope: 'workflow' },
          { key: 'company', label: 'Company name', type: 'string', scope: 'workflow' },
          { key: 'aiBotId', label: 'AI bot to run the call', type: 'string', scope: 'workflow' },
        ],
        parameters: [
          { key: 'recruiter', label: 'Recruiter name', type: 'string', required: true, description: 'Name announced on the call', placeholder: 'Jane Smith' },
          { key: 'company', label: 'Company name', type: 'string', required: true, description: 'Used in messaging', placeholder: 'Acme Inc.' },
          { key: 'aiBotId', label: 'AI bot id', type: 'string', required: false, description: 'Voice bot to drive the outbound call' },
        ],
        requirements: [
          { type: 'integration', name: 'twilio', description: 'Voice provider must be configured at the org level', required: true },
          { type: 'integration', name: 'whatsapp_account', description: 'WhatsApp Business account', required: true },
          { type: 'integration', name: 'marketing_email', description: 'Email provider (SES / SendGrid / etc) configured', required: true },
        ],
        version: 1,
      },
      $setOnInsert: {
        authorId: new Types.ObjectId(String(options.authorId)),
      },
    },
    { new: true, upsert: true }
  );

  return {
    templateId: doc?._id?.toString(),
    created: !!doc,
    dryRun: false,
  };
}
