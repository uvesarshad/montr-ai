/**
 * Tool Registration Index
 * 
 * This file must be imported before using toolRegistry.getToolsForAgent().
 * Each tool file self-registers with the toolRegistry when imported.
 */

// CRM Tools: createContact, getContact, listContacts, updateContact,
// createActivity, createCompany, getCompany, listCompanies
import './crm-tools';

// CRM Deal Tools: createDeal, updateDealStage, getDealsPipeline
import './deal-tools';

// Knowledge Base Tools: searchKnowledgeBase, create_doc, update_doc
import './knowledge-tools';

// Workflow Tools: triggerWorkflow
import './workflow-tools';

// Social Tools: schedulePost, getAnalytics
import './social-tools';

// Utility Tools: getCurrentDate, addToKnowledgeBase
import './utility-tools';

// Marketing Roadmap Tools: getRoadmapTasks, completeRoadmapTask, addRoadmapTask,
// executeRoadmapTask, getCrossChannelReport, getEmailCampaignMetrics,
// getWhatsAppCampaignMetrics, iterateMarketingPlan
import './marketing-tools';

// Mission Control Tools: createPlan, completeMission, reportBlocked
import './mission-tools';

// B1-2.1 — WhatsApp tools
import './whatsapp-tools';

// B1-2.2 — Voice tools
import './voice-tools';

// B1-2.3 — Email tools (inbox + marketing campaigns)
import './email-tools';

// B1-2.4 — AI Studio tools (generate_image, generate_video, generate_audio, generate_text)
import './ai-studio-tools';

// B1-2.5 — Inbox tools (omnichannel conversations)
import './inbox-tools';

// B1-2.6 — Forms tools
import './forms-tools';

// B1-2.8 — Calendar tools
import './calendar-tools';

// B1-2.10 — Approval tools
import './approval-tools';

// B1-2.11 — Identity tools (explicit X2 wrapper)
import './identity-tools';

// B1-3.3 — Agent delegation tool
import './delegation-tools';

// B1-3.4 — Agent brand-scoped memory tools
import './memory-tools';

// Ads & Analytics tools (read-only): get_ads_insights, get_marketing_analytics, get_ad_leads
import './ads-tools';

// Phase 1 (2026-06-05) — Agent self-scheduling + long-horizon hibernation:
// create/list/cancel_scheduled_task, create/list/delete_mission_trigger, sleep_until
import './schedule-tools';

// Phase 1 (2026-06-05) — Agent Workspace in Docs:
// list_workspace_docs, read_doc, write_workspace_doc
import './workspace-tools';

// Phase 1 (2026-06-05) — Goal Mode strategy pipeline:
// generate_strategy, get_strategy, activate_strategy (gated), iterate_strategy
import './strategy-tools';

// Phase 2 (2026-06-05, D1) — Ads write path:
// list_ad_accounts, create_ad_campaign (gated; create-only → PAUSED via write-ops)
import './ads-write-tools';

// Phase 2 (2026-06-05, G13) — Asset & inspiration ingestion:
// ingest_website, import_social_content, analyze_inspiration
import './ingestion-tools';

// Phase 3 (2026-06-05, G11) — Integrations hub awareness:
// list_integrations
import './integration-tools';

export { toolRegistry } from '../tool-registry';
