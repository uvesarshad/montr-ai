import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';

// Importing tools/index registers all tools into the registry.
import '@/lib/agent/tools/index';
import { toolRegistry } from '@/lib/agent/tool-registry';

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ALWAYS_APPROVAL = new Set([
    'send_whatsapp_text', 'send_whatsapp_template', 'send_whatsapp_image', 'send_whatsapp_buttons',
    'initiate_call', 'bulk_call', 'schedule_campaign', 'send_inbox_email',
    'create_form', 'request_approval', 'merge_contacts',
    'sendWhatsApp', 'sendEmail', 'deleteContact', 'deleteCompany', 'deleteDeal',
    'triggerWorkflow', 'schedulePost',
  ]);

  const READ_ONLY = new Set([
    'getContact', 'listContacts', 'listDeals', 'getDealsPipeline', 'searchKnowledgeBase',
    'getAnalytics', 'getCurrentDate', 'getRoadmapTasks', 'getCrossChannelReport',
    'getEmailCampaignMetrics', 'getWhatsAppCampaignMetrics',
    'get_inbox_thread', 'get_call_transcript', 'get_approval_status', 'get_execution_status',
    'list_workflows', 'list_conversations', 'read_conversation', 'list_form_submissions',
    'list_characters', 'resolve_contact', 'find_contact_by_attribute', 'check_availability',
    'generate_text',
    'read_memory', 'list_memory_keys',
    'get_campaign_metrics',
  ]);

  const tools = toolRegistry.getAllTools().map(t => ({
    name: t.name,
    description: t.description,
    hitlPolicy: ALWAYS_APPROVAL.has(t.name)
      ? 'always'
      : READ_ONLY.has(t.name)
        ? 'never'
        : 'supervised',
    scope: inferScope(t.name),
  }));

  return NextResponse.json({ tools, total: tools.length });
}

function inferScope(name: string): string {
  if (name.includes('whatsapp') || name.startsWith('send_whatsapp')) return 'whatsapp';
  if (name.includes('call') || name.includes('voice') || name.includes('bulk_call')) return 'voice';
  if (name.includes('email') || name.includes('campaign')) return 'email';
  if (name.includes('contact') || name.includes('deal') || name.includes('crm')) return 'crm';
  if (name.includes('workflow') || name.includes('execution')) return 'workflow';
  if (name.includes('conversation') || name.includes('inbox') || name.includes('reply')) return 'inbox';
  if (name.includes('form')) return 'forms';
  if (name.includes('calendar') || name.includes('event') || name.includes('availability')) return 'calendar';
  if (name.includes('generate') || name.includes('character') || name.includes('studio')) return 'ai-studio';
  if (name.includes('approval')) return 'approvals';
  if (name.includes('social') || name.includes('post') || name.includes('analytics')) return 'social';
  if (name.includes('knowledge') || name.includes('doc')) return 'knowledge';
  if (name.includes('memory') || name === 'delegate_to_agent') return 'agent';
  return 'general';
}
