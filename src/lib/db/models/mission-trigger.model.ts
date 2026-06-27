/**
 * Event-triggered mission configuration (B1-6.2).
 *
 * Maps a domain event type to a mission template. When the event fires for
 * the matching brand/org, a new AgentMission is spawned from the template.
 */

import mongoose, { Document, Schema } from 'mongoose';

export type MissionTriggerEventType =
  | 'form.submitted'
  | 'contact.created'
  | 'deal.stage_changed'
  | 'deal.won'
  | 'deal.lost'
  | 'email.received'
  | 'campaign.completed'
  // Phase 2 (2026-06-05) — inbound-channel + lifecycle events (domain bus)
  | 'whatsapp.message_received'
  | 'message.received'
  | 'ai_bot.escalation_requested'
  | 'ads.lead_captured'
  | 'meeting.booked'
  | 'voice.call_completed';

export interface IMissionTrigger extends Document {
  brandId: string;
  userId: string;
  templateId: string;
  name: string;
  eventType: MissionTriggerEventType;
  /** Optional JSON-serialised condition (e.g. `{ "stageId": "xxx" }`). */
  conditions?: string;
  /** Mode for spawned missions (default 'mixed'; 'autonomous' starts the runner immediately). */
  missionMode?: 'mixed' | 'approval-first' | 'autonomous' | 'watch' | 'autopilot';
  enabled: boolean;
  triggerCount: number;
  lastTriggeredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MissionTriggerSchema = new Schema<IMissionTrigger>(
  {
    brandId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    templateId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    eventType: {
      type: String,
      required: true,
      enum: [
        'form.submitted',
        'contact.created',
        'deal.stage_changed',
        'deal.won',
        'deal.lost',
        'email.received',
        'campaign.completed',
        'whatsapp.message_received',
        'message.received',
        'ai_bot.escalation_requested',
        'ads.lead_captured',
        'meeting.booked',
        'voice.call_completed',
      ],
    },
    conditions: { type: String, default: null },
    missionMode: {
      type: String,
      enum: ['mixed', 'approval-first', 'autonomous', 'watch', 'autopilot'],
      default: 'mixed',
    },
    enabled: { type: Boolean, default: true, index: true },
    triggerCount: { type: Number, default: 0 },
    lastTriggeredAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'agent_mission_triggers' },
);

MissionTriggerSchema.index({ brandId: 1, eventType: 1 });

const MissionTrigger =
  mongoose.models.MissionTrigger ||
  mongoose.model<IMissionTrigger>('MissionTrigger', MissionTriggerSchema);

export default MissionTrigger;
