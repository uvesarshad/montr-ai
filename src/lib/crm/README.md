# CRM Workflow & Webhook System

This directory contains the automation infrastructure for the MontrAI CRM system, including workflows, webhooks, and an event bus.

## Architecture Overview

```
┌─────────────────┐
│  CRM API Routes │ (Contact, Deal, Company CRUD)
└────────┬────────┘
         │ emits events
         ▼
┌─────────────────┐
│   Event Bus     │ (event-handlers.ts)
└────────┬────────┘
         │ triggers
         ├──────────────┬────────────────┐
         ▼              ▼                ▼
   ┌──────────┐  ┌──────────┐    ┌──────────┐
   │ Workflow │  │ Webhook  │    │ Other    │
   │ Engine   │  │ Delivery │    │ Handlers │
   └──────────┘  └──────────┘    └──────────┘
```

## Files

### Core Engine Files

- **events.ts** - Event bus system for publishing/subscribing to CRM events
- **workflow-engine.ts** - Workflow automation engine (triggers, conditions, actions)
- **webhook-delivery.ts** - Webhook delivery with retry logic and signature generation
- **event-handlers.ts** - Event handlers that connect events to workflows/webhooks
- **index.ts** - Main exports

### API Routes

#### Workflows
- `POST /api/v2/crm/workflows` - Create workflow
- `GET /api/v2/crm/workflows` - List workflows
- `GET /api/v2/crm/workflows/[id]` - Get workflow
- `PATCH /api/v2/crm/workflows/[id]` - Update workflow
- `DELETE /api/v2/crm/workflows/[id]` - Delete workflow
- `POST /api/v2/crm/workflows/[id]/activate` - Activate workflow
- `POST /api/v2/crm/workflows/[id]/deactivate` - Deactivate workflow
- `POST /api/v2/crm/workflows/[id]/test` - Test workflow
- `GET /api/v2/crm/workflows/[id]/logs` - Get execution logs

#### Webhooks
- `POST /api/v2/crm/webhooks` - Create webhook
- `GET /api/v2/crm/webhooks` - List webhooks
- `GET /api/v2/crm/webhooks/[id]` - Get webhook
- `PATCH /api/v2/crm/webhooks/[id]` - Update webhook
- `DELETE /api/v2/crm/webhooks/[id]` - Delete webhook
- `POST /api/v2/crm/webhooks/[id]/test` - Test webhook
- `GET /api/v2/crm/webhooks/[id]/logs` - Get delivery logs

## Usage

### Emitting Events from API Routes

When you create, update, or delete CRM records, emit events to trigger workflows and webhooks:

```typescript
import { emitContactCreated, emitContactUpdated } from '@/lib/crm';

// After creating a contact
await emitContactCreated(organizationId, contact, userId);

// After updating a contact
await emitContactUpdated(organizationId, contact, changes, userId);

// After updating deal stage
await emitDealStageChanged(organizationId, deal, previousStageId, userId);
```

### Workflow Triggers (11 types)

1. `record_created` - When a record is created
2. `record_updated` - When a record is updated
3. `field_changed` - When a specific field changes
4. `stage_changed` - When deal stage changes
5. `deal_won` - When deal is won
6. `deal_lost` - When deal is lost
7. `tag_added` - When tag is added
8. `tag_removed` - When tag is removed
9. `scheduled` - Cron-based trigger (not yet implemented)
10. `manual` - Manual trigger (not yet implemented)
11. `webhook_received` - External webhook trigger (not yet implemented)

### Workflow Actions (13 types)

1. `update_field` - Update a field value
2. `add_tag` - Add a tag
3. `remove_tag` - Remove a tag
4. `assign_owner` - Assign to user
5. `create_task` - Create a task activity
6. `create_activity` - Create an activity (note, call, meeting)
7. `send_email` - Send email (placeholder)
8. `send_webhook` - Send HTTP webhook
9. `send_whatsapp` - Send WhatsApp message (placeholder)
10. `create_deal` - Create a new deal
11. `move_stage` - Move deal to different stage
12. `wait` - Delay execution (requires job queue)
13. `condition` - Conditional branching

### Condition Operators

- `equals` / `not_equals`
- `contains` / `not_contains`
- `greater_than` / `less_than`
- `is_empty` / `is_not_empty`
- `in_list` / `not_in_list`

### Creating a Workflow (Example)

```json
{
  "name": "Auto-assign hot leads",
  "description": "Automatically assign leads with rating 'hot' to sales team",
  "trigger": {
    "type": "record_created",
    "entityType": "contact",
    "config": {}
  },
  "conditions": [
    {
      "field": "rating",
      "operator": "equals",
      "value": "hot",
      "conjunction": "and"
    }
  ],
  "actions": [
    {
      "type": "assign_owner",
      "config": {
        "ownerId": "USER_ID_HERE"
      }
    },
    {
      "type": "add_tag",
      "config": {
        "tagId": "TAG_ID_HERE"
      }
    },
    {
      "type": "create_task",
      "config": {
        "subject": "Follow up with hot lead",
        "dueInDays": 1,
        "assignTo": "owner"
      }
    }
  ]
}
```

### Webhook Events

All webhook events:
- `contact.created`, `contact.updated`, `contact.deleted`
- `company.created`, `company.updated`, `company.deleted`
- `deal.created`, `deal.updated`, `deal.deleted`, `deal.stage_changed`, `deal.won`, `deal.lost`
- `activity.created`, `task.completed`
- `email.received`, `email.sent`

### Creating a Webhook (Example)

```json
{
  "name": "Slack Notification",
  "description": "Notify Slack when deal is won",
  "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json"
  },
  "secret": "your-signing-secret",
  "events": ["deal.won"],
  "filters": [
    {
      "field": "value",
      "operator": "greater_than",
      "value": 10000
    }
  ],
  "maxRetries": 3,
  "retryDelaySeconds": 60
}
```

### Webhook Payload Format

```json
{
  "event": "deal.won",
  "timestamp": "2026-01-15T12:00:00.000Z",
  "data": {
    "_id": "...",
    "name": "Big Deal",
    "value": 50000,
    "status": "won",
    ...
  },
  "metadata": {
    "entityType": "deal",
    "entityId": "...",
    "userId": "..."
  }
}
```

### Webhook Signature Verification

Webhooks include an `X-Webhook-Signature` header with HMAC-SHA256 signature:

```typescript
import { verifySignature } from '@/lib/crm';

const payload = await request.json();
const signature = request.headers.get('X-Webhook-Signature');
const secret = 'your-webhook-secret';

if (!verifySignature(payload, signature, secret)) {
  return new Response('Invalid signature', { status: 401 });
}
```

## Retry Logic

Webhooks automatically retry on failure with exponential backoff:

1. Attempt 1: Immediate
2. Attempt 2: 1 minute later
3. Attempt 3: 5 minutes later
4. Attempt 4: 15 minutes later
5. Attempt 5: 1 hour later
6. Attempt 6: 6 hours later

Max retries and delay are configurable per webhook.

## TODO / Future Enhancements

1. **Workflow Execution Logs** - Create separate collection to track each workflow execution with details
2. **Scheduled Workflows** - Implement cron-based triggers using job queue
3. **Manual Workflows** - Allow manual execution from UI
4. **Wait Action** - Implement delayed actions using job queue (Bull/Agenda)
5. **Email Integration** - Connect send_email action to email service
6. **WhatsApp Integration** - Connect send_whatsapp action to WhatsApp API
7. **Workflow Templates** - Pre-built workflow templates library
8. **Workflow Version History** - Track changes to workflows
9. **Workflow Testing UI** - Visual workflow builder and tester
10. **Performance Monitoring** - Track workflow execution performance
11. **Rate Limiting** - Prevent runaway workflows
12. **Workflow Permissions** - Role-based access control

## Integration with Existing APIs

To integrate workflows and webhooks into existing CRM API routes, add event emissions:

```typescript
// In /api/v2/crm/contacts/route.ts
import { emitContactCreated } from '@/lib/crm';

export async function POST(request: NextRequest) {
  // ... existing code to create contact ...

  const contact = await contactRepository.create({...});

  // Emit event to trigger workflows and webhooks
  await emitContactCreated(organizationId, contact, userId);

  return NextResponse.json(contact, { status: 201 });
}
```

## Testing

### Test a Workflow

```bash
POST /api/v2/crm/workflows/[id]/test
{
  "entityId": "contact_id_here",
  "dryRun": true
}
```

### Test a Webhook

```bash
POST /api/v2/crm/webhooks/[id]/test
{
  "event": "contact.created",
  "payload": {
    "name": "Test Contact",
    "email": "test@example.com"
  }
}
```

## Security

- All API routes require authentication via NextAuth
- Multi-tenancy enforced via organizationId filtering
- Only workflow/webhook owners can modify/delete
- Webhook signatures prevent tampering
- Secrets stored securely in database

## Performance Considerations

- Events are processed asynchronously via event bus
- Webhook delivery doesn't block API responses
- Failed webhooks retry in background
- Consider using job queue (Bull/Agenda) for production
- Implement rate limiting for workflow actions

## Debugging

Enable debug logging:

```typescript
// In workflow-engine.ts or webhook-delivery.ts
console.log('Workflow execution:', { workflow, eventData });
console.log('Webhook delivery:', { webhook, payload });
```

Check execution stats:
```bash
GET /api/v2/crm/workflows/[id]/logs
GET /api/v2/crm/webhooks/[id]/logs
```
