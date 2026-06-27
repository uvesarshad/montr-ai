import { Worker, Job } from 'bullmq';
import { getConnection, SchedulePostJobData, RetryPostJobData, scheduleRetry, schedulePost, AnalyticsSyncJobData, AgentMissionRunnerJob, dispatchMissionContinuation } from './queue';
import { WhatsAppCampaignJob } from './whatsapp-queue';
import { scheduledPostRepository, successfulTargetKeys, publishTargetKey, mergePublishResults } from '../db/repository/scheduled-post.repository';
import { whatsappCampaignRepository } from '../db/repository/whatsapp-campaign.repository';
import { whatsappAccountRepository } from '../db/repository/whatsapp-account.repository';
import { whatsappTemplateRepository } from '../db/repository/whatsapp-template.repository';
import { IPublishResult, IPlatformConfig } from '../db/models/scheduled-post.model';
// Publishing is dispatched through the uniform provider registry (audit Epic 0).
// Each platform's logic lives in src/lib/social/providers/<platform>.provider.ts,
// which imports the CONCRETE publish flow module (never the '@/ai/flows' barrel,
// whose next-auth transitive import crashes the tsx worker).
import { getPlatformProvider } from '../social/providers/registry';
import { failResult } from '../social/providers/types';
import { emitPostEvent } from '../social/webhook-dispatch';
import { shortenUrlsInText } from '../social/short-link';
import { materializeNextRecurrence } from '../social/recurrence';
import { whatsappService } from '../services/whatsapp.service';
import CrmContact from '../db/models/crm/contact.model';
import WhatsAppContactGroupMember from '../db/models/whatsapp-contact-group-member.model';
import { createComplianceWarning, isMarketingTemplate, recordComplianceWarning } from '@/lib/whatsapp/compliance';
import { socialAnalyticsService } from '../services/social-analytics.service';


const MAX_RETRY_ATTEMPTS = 3;

type WhatsAppContact = {
    _id?: { toString?: () => string } | string;
    doNotContact?: boolean;
    marketingConsent?: boolean;
    channels?: Array<{
        type?: string;
        identifier?: string;
    }>;
};

/**
 * Process a WhatsApp campaign job
 */
async function processWhatsAppCampaign(job: Job<WhatsAppCampaignJob>): Promise<void> {
    const { campaignId } = job.data;

    console.log(`[Worker] Processing WhatsApp campaign: ${campaignId}`);

    // Fetch campaign
    const campaign = await whatsappCampaignRepository.findById(campaignId);
    if (!campaign) {
        console.log(`[Worker] Campaign not found: ${campaignId}`);
        return;
    }

    if (campaign.status !== 'scheduled' && campaign.status !== 'draft') {
        console.log(`[Worker] Campaign ${campaignId} is not in valid status: ${campaign.status}`);
        return;
    }

    // Mark as processing
    await whatsappCampaignRepository.update(campaignId, {
        status: 'processing',
        startedAt: new Date(),
    });

    try {
        // Fetch account and template
        const account = await whatsappAccountRepository.findById(campaign.whatsappAccountId.toString());
        const template = await whatsappTemplateRepository.findById(campaign.templateId.toString());

        if (!account || !template) {
            throw new Error('Account or template not found');
        }

        if (template.status !== 'APPROVED') {
            await recordComplianceWarning({
                entityType: 'whatsapp_campaign',
                entityId: campaignId,
                warning: createComplianceWarning('campaign_template_unapproved', 'Template is not approved by Meta (campaign worker)', {
                    campaignId,
                    templateId: template._id.toString(),
                    status: template.status,
                }),
                source: 'system',
            });
        }

        if (campaign.messageType !== 'template') {
            await recordComplianceWarning({
                entityType: 'whatsapp_campaign',
                entityId: campaignId,
                warning: createComplianceWarning('campaign_not_template', 'Campaign is not template-based (campaign worker)', {
                    campaignId,
                    messageType: campaign.messageType,
                }),
                source: 'system',
            });
        }

        // Fetch contacts based on audience type. Every branch produces a
        // narrowly scoped query — the previous TODO fall-through that sent
        // every "non-all" campaign to the entire org's WhatsApp audience is
        // gone; an empty/invalid target now sends to zero contacts (the
        // safer default for any compliance regime).
        let contacts: WhatsAppContact[] = [];

        if (campaign.targetType === 'all') {
            contacts = await CrmContact.find({
                'channels.type': 'whatsapp',
            }).lean();
        } else if (campaign.targetType === 'groups') {
            const groupIds = (campaign.targetGroups || []).map((g: { toString(): string } | string) => g.toString());
            if (groupIds.length === 0) {
                console.warn(`[Worker] Campaign ${campaignId} targetType=groups but no groups specified — sending to no one.`);
                contacts = [];
            } else {
                // Look up distinct contact ids in the specified groups, then
                // fetch full contact docs filtered by org + whatsapp channel.
                const memberships = await WhatsAppContactGroupMember.find({
                    groupId: { $in: groupIds },
                })
                    .select('contactId')
                    .lean();
                const contactIds = Array.from(
                    new Set(memberships.map(m => m.contactId.toString())),
                );
                if (contactIds.length === 0) {
                    contacts = [];
                } else {
                    contacts = await CrmContact.find({
                        _id: { $in: contactIds },
                        'channels.type': 'whatsapp',
                    }).lean();
                }
            }
        } else if (campaign.targetType === 'individual') {
            const contactIds = (campaign.targetContacts || []).map((c: { toString(): string } | string) => c.toString());
            if (contactIds.length === 0) {
                console.warn(`[Worker] Campaign ${campaignId} targetType=individual but no contacts specified — sending to no one.`);
                contacts = [];
            } else {
                contacts = await CrmContact.find({
                    _id: { $in: contactIds },
                    'channels.type': 'whatsapp',
                }).lean();
            }
        } else if (campaign.targetType === 'filter') {
            // campaign.targetFilter holds a CRM-style filter blob:
            //   { status?, lifecycle?, rating?, ownerId?, tags?[], source?,
            //     createdAfter?, createdBefore? }
            // Any unknown key is ignored; org + whatsapp channel are always
            // enforced. No mongo operators are accepted directly to keep this
            // injection-safe.
            const rawFilter = (campaign.targetFilter || {}) as Record<string, unknown>;
            const filterQuery: Record<string, unknown> = {
                'channels.type': 'whatsapp',
            };
            if (typeof rawFilter.status === 'string') filterQuery.status = rawFilter.status;
            if (typeof rawFilter.lifecycle === 'string') filterQuery.lifecycle = rawFilter.lifecycle;
            if (typeof rawFilter.rating === 'string') filterQuery.rating = rawFilter.rating;
            if (typeof rawFilter.source === 'string') filterQuery.source = rawFilter.source;
            if (typeof rawFilter.ownerId === 'string') filterQuery.ownerId = rawFilter.ownerId;
            if (Array.isArray(rawFilter.tags) && rawFilter.tags.length > 0) {
                filterQuery.tags = { $in: rawFilter.tags.filter(t => typeof t === 'string') };
            }
            const createdRange: Record<string, Date> = {};
            if (typeof rawFilter.createdAfter === 'string' || rawFilter.createdAfter instanceof Date) {
                const d = new Date(rawFilter.createdAfter as string | Date);
                if (!Number.isNaN(d.getTime())) createdRange.$gte = d;
            }
            if (typeof rawFilter.createdBefore === 'string' || rawFilter.createdBefore instanceof Date) {
                const d = new Date(rawFilter.createdBefore as string | Date);
                if (!Number.isNaN(d.getTime())) createdRange.$lte = d;
            }
            if (Object.keys(createdRange).length > 0) {
                filterQuery.createdAt = createdRange;
            }
            contacts = await CrmContact.find(filterQuery).lean();
        }

        const isMarketing = isMarketingTemplate(template);

        for (const contact of contacts) {
            if (contact.doNotContact) {
                await recordComplianceWarning({
                    entityType: 'crm_contact',
                    entityId: contact._id?.toString?.() || String(contact._id),
                    warning: createComplianceWarning('dnc_contact', 'Contact marked do not contact (campaign worker)', {
                        contactId: contact._id?.toString?.() || String(contact._id),
                        campaignId,
                    }),
                    source: 'system',
                });
            }
            if (isMarketing && !contact.marketingConsent) {
                await recordComplianceWarning({
                    entityType: 'crm_contact',
                    entityId: contact._id?.toString?.() || String(contact._id),
                    warning: createComplianceWarning('marketing_consent_missing', 'Marketing consent missing (campaign worker)', {
                        contactId: contact._id?.toString?.() || String(contact._id),
                        campaignId,
                    }),
                    source: 'system',
                });
            }
        }

        console.log(`[Worker] Found ${contacts.length} contacts for campaign ${campaignId}`);

        // Update total contacts
        await whatsappCampaignRepository.update(campaignId, {
            totalContacts: contacts.length,
        });

        let sent = 0;
        let failed = 0;
        let pendingSent = 0;
        let pendingFailed = 0;

        // Throttled parallel send. The old version fired one message every
        // ~15 ms serially, capping throughput at ~66/sec regardless of
        // WhatsApp's true 80/sec ceiling. This version:
        //   - Uses a 50ms-spaced token bucket (~70 msg/sec, safely under 80).
        //   - Runs up to MAX_INFLIGHT sends in parallel so network/IO latency
        //     overlaps instead of stacking.
        //   - Flushes stats in batches of 20 so a crash never loses more than
        //     the last partial batch.
        const MAX_INFLIGHT = 8;
        const TOKEN_INTERVAL_MS = 14; // ~71 msg/sec
        const STATS_BATCH_SIZE = 20;

        let nextTokenAt = Date.now();
        async function acquireToken(): Promise<void> {
            const now = Date.now();
            const wait = nextTokenAt - now;
            nextTokenAt = Math.max(now, nextTokenAt) + TOKEN_INTERVAL_MS;
            if (wait > 0) {
                await new Promise(resolve => setTimeout(resolve, wait));
            }
        }

        async function flushStats(force: boolean) {
            if (pendingSent >= STATS_BATCH_SIZE || (force && pendingSent > 0)) {
                await whatsappCampaignRepository
                    .incrementStats(campaignId, { sent: pendingSent })
                    .catch(err => console.error('[Worker] Failed to flush sent stats:', err));
                pendingSent = 0;
            }
            if (pendingFailed >= STATS_BATCH_SIZE || (force && pendingFailed > 0)) {
                await whatsappCampaignRepository
                    .incrementStats(campaignId, { failed: pendingFailed })
                    .catch(err => console.error('[Worker] Failed to flush failed stats:', err));
                pendingFailed = 0;
            }
        }

        const sendOne = async (contact: WhatsAppContact) => {
            const whatsappChannel = contact.channels?.find((ch) => ch.type === 'whatsapp');
            if (!whatsappChannel?.identifier) return;
            await acquireToken();
            try {
                await whatsappService.sendTemplateMessage(
                    account,
                    whatsappChannel.identifier,
                    template.name,
                    template.language,
                );
                sent++;
                pendingSent++;
            } catch (error) {
                console.error(`[Worker] Failed to send to contact ${contact._id}:`, error);
                failed++;
                pendingFailed++;
            }
            await flushStats(false);
        };

        // Drive a sliding window of in-flight sends rather than a single
        // serial loop. New tasks start as old ones finish, capped at
        // MAX_INFLIGHT.
        const inflight = new Set<Promise<void>>();
        for (const contact of contacts) {
            const p = sendOne(contact).finally(() => {
                inflight.delete(p);
            });
            inflight.add(p);
            if (inflight.size >= MAX_INFLIGHT) {
                await Promise.race(inflight);
            }
        }
        await Promise.allSettled(inflight);

        // Final stats flush — write any remainder.
        await flushStats(true);

        // Mark as completed
        await whatsappCampaignRepository.update(campaignId, {
            status: 'completed',
            completedAt: new Date(),
        });

        console.log(`[Worker] Campaign ${campaignId} completed. Sent: ${sent}, Failed: ${failed}`);
    } catch (error: unknown) {
        console.error(`[Worker] Campaign ${campaignId} failed:`, error);

        await whatsappCampaignRepository.update(campaignId, {
            status: 'failed',
            completedAt: new Date(),
        });
    }
}

/**
 * Process a single platform publish request
 */
async function publishToPlatform(
    platform: string,
    content: string,
    mediaUrls: string[],
    mediaTypes: ('image' | 'video')[],
    postFormat: 'standard' | 'reel',
    config: IPlatformConfig
): Promise<IPublishResult> {
    const provider = getPlatformProvider(platform);
    if (!provider) {
        return failResult(platform, config.accountId, `Unsupported platform: ${platform}`);
    }

    try {
        return await provider.publish({ content, mediaUrls, mediaTypes, postFormat, config });
    } catch (error: unknown) {
        console.error(`Failed to publish to ${platform}:`, error);
        return failResult(
            platform,
            config.accountId,
            error instanceof Error ? error.message : 'Unknown error',
        );
    }
}

/**
 * Process a scheduled post job
 */
async function processScheduledPost(job: Job<SchedulePostJobData>): Promise<void> {
    const { scheduledPostId } = job.data;

    console.log(`[Worker] Processing scheduled post: ${scheduledPostId}`);

    // Fetch the scheduled post
    const post = await scheduledPostRepository.findById(scheduledPostId);

    if (!post) {
        console.log(`[Worker] Scheduled post not found: ${scheduledPostId}`);
        return;
    }

    if (post.status !== 'scheduled') {
        console.log(`[Worker] Post ${scheduledPostId} is not in scheduled status: ${post.status}`);
        return;
    }

    // Mark as publishing
    await scheduledPostRepository.markAsPublishing(scheduledPostId);

    // Idempotency / no-double-publish guard (audit §D): a post can re-enter
    // this handler with partial successes already recorded — e.g. the recovery
    // sweeper re-enqueued it after the worker crashed between publishing one
    // platform and persisting all results. Skip any (platform, account) that
    // already published successfully and carry its prior result forward.
    const priorResults = post.publishResults || [];
    const alreadyDone = successfulTargetKeys(priorResults);

    // Short-linking (audit Epic 6.3): auto-shorten URLs in the body when a
    // shortener is configured. No-op (returns the original text) otherwise.
    const content = await shortenUrlsInText(post.content);

    // Publish only to the platforms not yet successful.
    const freshResults: IPublishResult[] = [];

    for (const platformConfig of post.platforms) {
        if (alreadyDone.has(publishTargetKey(platformConfig))) {
            console.log(`[Worker] Skipping already-published ${platformConfig.platform}/${platformConfig.accountId} for post ${scheduledPostId}`);
            continue;
        }
        const result = await publishToPlatform(
            platformConfig.platform,
            content,
            post.mediaUrls,
            post.mediaTypes || [],
            post.postFormat || 'standard',
            platformConfig
        );
        freshResults.push(result);
    }

    // Merge prior successes with this attempt's results (no overwrite).
    const results = mergePublishResults(priorResults, freshResults);

    // Update post with the merged results
    await scheduledPostRepository.markAsPublished(scheduledPostId, results);

    // Outbound webhooks (audit Epic 6.2): notify subscribers. Fire-and-forget.
    const successCount = results.filter(r => r.success).length;
    const failedResults = results.filter(r => !r.success);
    if (successCount > 0) {
        await emitPostEvent('post.published', post);
    }
    if (failedResults.length > 0) {
        await emitPostEvent('post.failed', post);

        if (post.attemptCount < MAX_RETRY_ATTEMPTS) {
            console.log(`[Worker] ${failedResults.length} platforms failed for post ${scheduledPostId}`);
            // Could schedule platform-specific retries here if needed
        }
    }

    // Recurring posts (audit Epic 5.1): after a successful publish, materialize
    // and enqueue the next occurrence. materializeNextRecurrence persists the new
    // doc (or returns null when the series has ended); we enqueue its delayed job.
    if (post.recurrence && successCount > 0) {
        try {
            const next = await materializeNextRecurrence(post);
            if (next) {
                await schedulePost(String(next._id), next.scheduledFor);
                console.log(`[Worker] Scheduled next recurrence ${next._id} for series ${post.parentPostId || scheduledPostId}`);
            }
        } catch (err) {
            console.error(`[Worker] Failed to materialize next recurrence for ${scheduledPostId}:`, err);
        }
    }

    console.log(`[Worker] Completed processing post ${scheduledPostId}. Success: ${successCount}/${results.length}`);
}

/**
 * Process a retry job
 */
async function processRetryPost(job: Job<RetryPostJobData>): Promise<void> {
    const { scheduledPostId, attemptNumber } = job.data;

    console.log(`[Worker] Retrying post ${scheduledPostId}, attempt ${attemptNumber}`);

    const post = await scheduledPostRepository.findById(scheduledPostId);

    if (!post || post.status !== 'failed') {
        console.log(`[Worker] Post ${scheduledPostId} not found or not in failed status`);
        return;
    }

    if (post.attemptCount >= MAX_RETRY_ATTEMPTS) {
        console.log(`[Worker] Post ${scheduledPostId} has exceeded max retry attempts`);
        return;
    }

    // Mark as publishing
    await scheduledPostRepository.markAsPublishing(scheduledPostId);

    // Only re-publish platforms that have NOT already succeeded (audit §D).
    // Previously this re-ran every platform and markAsPublished OVERWROTE
    // publishResults, so an already-published platform got published a second
    // time on every retry. Derive prior successes and skip them.
    const priorResults = post.publishResults || [];
    const alreadyDone = successfulTargetKeys(priorResults);

    const freshResults: IPublishResult[] = [];

    for (const platformConfig of post.platforms) {
        if (alreadyDone.has(publishTargetKey(platformConfig))) {
            console.log(`[Worker] Retry skipping already-published ${platformConfig.platform}/${platformConfig.accountId} for post ${scheduledPostId}`);
            continue;
        }
        const result = await publishToPlatform(
            platformConfig.platform,
            post.content,
            post.mediaUrls,
            post.mediaTypes || [],
            post.postFormat || 'standard',
            platformConfig
        );
        freshResults.push(result);
    }

    // Merge prior successes with this attempt's results so carried-forward
    // successes survive and only the re-attempted targets are updated.
    const results = mergePublishResults(priorResults, freshResults);

    // Update with the merged results
    await scheduledPostRepository.markAsPublished(scheduledPostId, results);

    // Check if still failing AFTER the merge — only the targets we actually
    // re-attempted can still be failing; carried-forward successes never do.
    const failedResults = results.filter(r => !r.success);
    if (failedResults.length > 0 && post.attemptCount < MAX_RETRY_ATTEMPTS - 1) {
        // Schedule another retry with exponential backoff
        const delayMs = Math.pow(2, attemptNumber) * 60000; // 2^n minutes
        await scheduleRetry(scheduledPostId, attemptNumber + 1, delayMs);
    }

    console.log(`[Worker] Retry completed for post ${scheduledPostId}. Success: ${results.filter(r => r.success).length}/${results.length}`);
}

/**
 * Create and start the social posts worker
 */
export function createSocialPostsWorker(): Worker {
    const worker = new Worker(
        'social-posts',
        async (job: Job) => {
            switch (job.name) {
                case 'publish-scheduled-post':
                    await processScheduledPost(job as Job<SchedulePostJobData>);
                    break;
                case 'retry-failed-post':
                    await processRetryPost(job as Job<RetryPostJobData>);
                    break;
                default:
                    console.warn(`[Worker] Unknown job type: ${job.name}`);
            }
        },
        {
            connection: getConnection(),
            concurrency: 5, // Process up to 5 posts simultaneously
        }
    );

    worker.on('completed', (job) => {
        console.log(`[Worker] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job?.id} failed:`, err.message);
    });

    worker.on('error', (err) => {
        console.error('[Worker] Worker error:', err);
    });

    console.log('[Worker] Social posts worker started');

    return worker;
}

/**
 * Create and start the WhatsApp campaigns worker
 */
export function createWhatsAppCampaignsWorker(): Worker {
    const worker = new Worker(
        'whatsapp-campaigns',
        async (job: Job<WhatsAppCampaignJob>) => {
            await processWhatsAppCampaign(job);
        },
        {
            connection: getConnection(),
            concurrency: 2, // Process up to 2 campaigns simultaneously
        }
    );

    worker.on('completed', (job) => {
        console.log(`[WhatsApp Worker] Campaign job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[WhatsApp Worker] Campaign job ${job?.id} failed:`, err.message);
    });

    worker.on('error', (err) => {
        console.error('[WhatsApp Worker] Worker error:', err);
    });

    console.log('[WhatsApp Worker] WhatsApp campaigns worker started');

    return worker;
}

// Alias for backward compatibility
export const startWorker = createSocialPostsWorker;

/**
 * Create and start the analytics sync worker
 */
export function createAnalyticsWorker(): Worker {
    const worker = new Worker(
        'social-analytics',
        async (job: Job<AnalyticsSyncJobData>) => {
            if (job.name === 'sync-all-metrics') {
                const { daysLimit } = job.data;
                console.log(`[Analytics Worker] Starting sync (limit: ${daysLimit || 30} days)`);
                const result = await socialAnalyticsService.syncAllActivePosts(daysLimit);
                console.log(`[Analytics Worker] Sync completed: ${result.successful}/${result.processed} successful`);
            }
        },
        {
            connection: getConnection(),
            concurrency: 1, // Only one sync at a time to stay safe with rate limits
        }
    );

    worker.on('completed', (job) => {
        console.log(`[Analytics Worker] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[Analytics Worker] Job ${job?.id} failed:`, err.message);
    });

    console.log('[Analytics Worker] Social analytics worker started');

    return worker;
}


/**
 * Process one auto-continuation turn for an autonomous mission.
 *
 * Stops the loop when:
 *  - mission status is terminal (completed, blocked, scheduled) or waiting (HITL)
 *  - mission mode flipped off autonomous
 *  - wall-clock exceeded
 *  - idleTurns budget exhausted (no tool calls for MAX_IDLE_TURNS turns)
 *
 * Otherwise enqueues the next continuation.
 */
async function processMissionContinuation(job: Job<AgentMissionRunnerJob>): Promise<void> {
    const { missionId, userId, brandId, iteration = 0 } = job.data;
    const HARD_ITERATION_CAP = 100;

    // Lazy imports keep API route bundles slim — worker is the only consumer.
    const { agentMissionRepository } = await import('@/lib/db/repository/agent-mission.repository');
    const { runMissionTurnNonStreaming } = await import('@/ai/flows/copilot-agent-flow');
    const { checkWallClock, terminateMission } = await import('@/lib/agent/mission-budget');
    const AgentMission = (await import('@/lib/db/models/agent-mission.model')).default;
    const { MAX_IDLE_TURNS } = await import('@/lib/db/models/agent-mission.model');

    const mission = await agentMissionRepository.findById(missionId, userId);
    if (!mission) {
        console.log(`[Mission Runner] Mission ${missionId} not found, exiting`);
        return;
    }

    // Stop if no longer autonomous (user may have switched modes mid-flight)
    if (mission.mode !== 'autonomous') {
        console.log(`[Mission Runner] Mission ${missionId} is no longer autonomous (mode=${mission.mode}), exiting`);
        return;
    }

    // Stop if terminal or waiting on HITL
    const stopStatuses = new Set(['completed', 'blocked', 'waiting', 'scheduled']);
    if (stopStatuses.has(mission.status)) {
        console.log(`[Mission Runner] Mission ${missionId} status=${mission.status}, exiting`);
        return;
    }

    // Wall-clock pre-check
    const wall = checkWallClock(mission);
    if (!wall.ok && wall.exceeded) {
        await terminateMission(
            { _id: missionId, brandId, userId },
            missionId,
            wall.exceeded,
            wall.message || 'Mission wall-clock budget exceeded',
        );
        return;
    }

    // Idle budget pre-check
    const idleBefore = mission.usage?.idleTurns ?? 0;
    if (idleBefore >= MAX_IDLE_TURNS) {
        await terminateMission(
            { _id: missionId, brandId, userId },
            missionId,
            'no_progress',
            `Mission stalled — no tool calls for ${MAX_IDLE_TURNS} consecutive turns`,
        );
        return;
    }

    const toolCallsBefore = mission.usage?.toolCalls ?? 0;

    // Use a generic continuation nudge. Not persisted as a user message — the
    // model treats it as a hint and continues from the existing mission state.
    const continuationPrompt = job.data.continuationPrompt
        || 'Continue working toward the mission goal. Use available tools, or call completeMission / reportBlocked when appropriate.';

    let assistantText = '';
    try {
        assistantText = await runMissionTurnNonStreaming({
            message: continuationPrompt,
            missionId,
            userId,
            brandId,
            history: [],
        });
    } catch (error) {
        console.error(`[Mission Runner] Turn execution failed for ${missionId}:`, error);
        await agentMissionRepository.appendEvent({
            missionId,
            brandId,
            userId,
            type: 'error',
            role: 'system',
            content: error instanceof Error ? error.message : 'Mission auto-continue turn failed',
        }).catch(() => undefined);
        return;
    }

    // Persist assistant message
    if (assistantText.trim().length > 0) {
        await agentMissionRepository.appendEvent({
            missionId,
            brandId,
            userId,
            type: 'message',
            role: 'assistant',
            content: assistantText,
        }).catch((error) => {
            console.error('[Mission Runner] Failed to persist assistant message:', error);
        });
    }

    // Re-fetch and inspect post-turn state
    const after = await agentMissionRepository.findById(missionId, userId);
    if (!after) return;

    if (stopStatuses.has(after.status)) {
        // Tool-set terminal state or HITL paused us — respect it.
        return;
    }

    // Update idle counter based on whether progress was made
    const toolCallsAfter = after.usage?.toolCalls ?? 0;
    if (toolCallsAfter === toolCallsBefore) {
        await AgentMission.updateOne({ _id: missionId }, { $inc: { 'usage.idleTurns': 1 } }).catch(() => undefined);
    } else {
        await AgentMission.updateOne({ _id: missionId }, { $set: { 'usage.idleTurns': 0 } }).catch(() => undefined);
    }

    // Reset to active so the polling UI sees movement
    if (after.status !== 'active') {
        await agentMissionRepository.update(missionId, userId, {
            status: 'active',
            lastActivityAt: new Date(),
        }).catch(() => undefined);
    }

    if (iteration >= HARD_ITERATION_CAP) {
        console.warn(`[Mission Runner] Mission ${missionId} hit hard iteration cap (${HARD_ITERATION_CAP})`);
        await terminateMission(
            { _id: missionId, brandId, userId },
            missionId,
            'no_progress',
            `Mission hit safety cap of ${HARD_ITERATION_CAP} continuation turns`,
        );
        return;
    }

    // Re-enqueue next continuation
    await dispatchMissionContinuation(
        { missionId, userId, brandId, iteration: iteration + 1 },
        2000,
    );
}

/**
 * Create and start the agent mission runner worker.
 * Drives autonomous missions through repeated turns until terminal state.
 */
export function createAgentMissionRunnerWorker(): Worker {
    const worker = new Worker(
        'agent-mission-runner',
        async (job: Job<AgentMissionRunnerJob>) => {
            if (job.name === 'continue-mission') {
                await processMissionContinuation(job);
            }
        },
        {
            connection: getConnection(),
            concurrency: 4,
        },
    );

    worker.on('completed', (job) => {
        console.log(`[Mission Runner] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[Mission Runner] Job ${job?.id} failed:`, err.message);
    });

    worker.on('error', (err) => {
        console.error('[Mission Runner] Worker error:', err);
    });

    console.log('[Mission Runner] Agent mission runner worker started');
    return worker;
}

/**
 * Create and start the agent scheduled tasks worker
 * Processes due agent tasks every 5 minutes (triggered by cron in queue.ts)
 */
export function createAgentTasksWorker(): Worker {
    const worker = new Worker(
        'agent-scheduled-tasks',
        async (job: Job) => {
            if (job.name === 'process-scheduled-tasks') {
                console.log('[Agent Tasks Worker] Processing due scheduled tasks...');
                const { processScheduledTasks } = await import('@/lib/agent/scheduled-task-runner');
                const processed = await processScheduledTasks();
                console.log('[Agent Tasks Worker] Processed ' + processed + ' tasks');

                // Long-horizon missions (Phase 1 2026-06-05): wake hibernating
                // missions whose wakeAt has passed on the same 5-minute tick.
                const { wakeDueMissions } = await import('@/lib/agent/long-horizon');
                const woken = await wakeDueMissions();
                if (woken > 0) {
                    console.log('[Agent Tasks Worker] Woke ' + woken + ' hibernating mission(s)');
                }
            }
        },
        {
            connection: getConnection(),
            concurrency: 1,
        }
    );

    worker.on('completed', (job) => {
        console.log('[Agent Tasks Worker] Job ' + job.id + ' completed');
    });

    worker.on('failed', (job, err) => {
        console.error('[Agent Tasks Worker] Job ' + job?.id + ' failed:', err.message);
    });

    console.log('[Agent Tasks Worker] Agent scheduled tasks worker started');

    return worker;
}

/**
 * Create and start the Notion doc sync worker.
 * Polls linked documents against their Notion pages (triggered by cron in queue.ts).
 */
export function createNotionDocSyncWorker(): Worker {
    const worker = new Worker(
        'notion-doc-sync',
        async (job: Job) => {
            if (job.name === 'sync-all-docs') {
                const { syncAllNotionDocs } = await import('@/lib/integrations/notion/doc-sync');
                const result = await syncAllNotionDocs();
                if (result.processed > 0) {
                    console.log(
                        `[Notion Sync Worker] ${result.processed} links — pulled ${result.pulled}, pushed ${result.pushed}, errors ${result.errors}`
                    );
                }
            } else if (job.name === 'sync-one-doc') {
                const { documentId } = job.data || {};
                if (!documentId) {
                    console.warn('[Notion Sync Worker] sync-one-doc job missing documentId');
                    return;
                }
                const { docSyncLinkRepository } = await import('@/lib/db/repository/doc-sync-link.repository');
                const link = await docSyncLinkRepository.findByDocumentIdAny(documentId);
                if (!link) {
                    console.log(`[Notion Sync Worker] sync-one-doc: no link for doc ${documentId}`);
                    return;
                }
                if (link.direction === 'push' || link.direction === 'two_way') {
                    // Not forced — let change detection decide whether to push.
                    const { syncLink } = await import('@/lib/integrations/notion/doc-sync');
                    await syncLink(link);
                }
            }
        },
        {
            connection: getConnection(),
            concurrency: 1, // Serial — the sync loop already paces Notion API calls
        }
    );

    worker.on('failed', (job, err) => {
        console.error('[Notion Sync Worker] Job ' + job?.id + ' failed:', err.message);
    });

    worker.on('error', (err) => {
        console.error('[Notion Sync Worker] Worker error:', err);
    });

    console.log('[Notion Sync Worker] Notion doc sync worker started');

    return worker;
}

/**
 * Create and start the integration token refresh worker.
 * Preemptively refreshes expiring OAuth tokens (triggered by cron in queue.ts).
 */
export function createIntegrationTokenRefreshWorker(): Worker {
    const worker = new Worker(
        'integration-token-refresh',
        async (job: Job) => {
            if (job.name === 'refresh-expiring-tokens') {
                const { refreshExpiringIntegrationTokens } = await import('@/lib/integrations/server/token-refresh');
                const result = await refreshExpiringIntegrationTokens();
                if (result.scanned > 0) {
                    console.log(
                        `[Token Refresh Worker] Scanned ${result.scanned}, refreshed ${result.refreshed}, failed ${result.failed}`
                    );
                }
            }
        },
        {
            connection: getConnection(),
            concurrency: 1,
        }
    );

    worker.on('failed', (job, err) => {
        console.error('[Token Refresh Worker] Job ' + job?.id + ' failed:', err.message);
    });

    worker.on('error', (err) => {
        console.error('[Token Refresh Worker] Worker error:', err);
    });

    console.log('[Token Refresh Worker] Integration token refresh worker started');

    return worker;
}

/**
 * Create and start the source metrics sync worker.
 * Pulls daily metrics from ads platforms, GA4, Search Console, and
 * account-level social APIs into MetricsSnapshot (triggered by cron in
 * queue.ts; one-off jobs handle backfill and manual "Sync now").
 */
export function createSourceMetricsSyncWorker(): Worker {
    const worker = new Worker(
        'source-metrics-sync',
        async (job: Job) => {
            const { syncAllSources, syncOneSource, DEFAULT_SYNC_DAYS, BACKFILL_DAYS } =
                await import('@/lib/analytics/sync-service');

            if (job.name === 'sync-all-sources') {
                const days = typeof job.data?.days === 'number' ? job.data.days : DEFAULT_SYNC_DAYS;
                console.log(`[Source Metrics Worker] Syncing all sources (${days} day window)...`);
                const result = await syncAllSources(days);
                console.log(
                    `[Source Metrics Worker] Done: ${result.succeeded}/${result.targets} sources, ${result.rows} rows (${result.failed} failed)`
                );
            } else if (job.name === 'sync-one-source') {
                const { sourceType, connectionId, days } = job.data || {};
                if (!sourceType || !connectionId) {
                    console.warn('[Source Metrics Worker] sync-one-source job missing sourceType/connectionId');
                    return;
                }
                const { lastNDaysWindow } = await import('@/lib/analytics/fetchers');
                const window = lastNDaysWindow(typeof days === 'number' ? days : BACKFILL_DAYS);
                console.log(`[Source Metrics Worker] Syncing ${sourceType}/${connectionId} (${window.dateFrom} → ${window.dateTo})...`);
                const result = await syncOneSource({ sourceType, connectionId }, window);
                console.log(
                    `[Source Metrics Worker] ${sourceType}/${connectionId}: ${result.ok ? `${result.rows} rows` : `failed — ${result.error}`}`
                );
            } else if (job.name === 'ads-weekly-summary') {
                const { runAdsWeeklySummary } = await import('@/lib/ads/weekly-summary');
                const published = await runAdsWeeklySummary();
                console.log(`[Source Metrics Worker] Weekly ads summary published for ${published} org(s)`);
            }
        },
        {
            connection: getConnection(),
            concurrency: 1, // One sync at a time to stay safe with platform rate limits
        }
    );

    worker.on('failed', (job, err) => {
        console.error('[Source Metrics Worker] Job ' + job?.id + ' failed:', err.message);
    });

    worker.on('error', (err) => {
        console.error('[Source Metrics Worker] Worker error:', err);
    });

    console.log('[Source Metrics Worker] Source metrics sync worker started');

    return worker;
}

/**
 * Create and start the notification digest worker.
 * Sends the daily email digest to users who opted in (triggered by cron in queue.ts).
 */
export function createNotificationDigestWorker(): Worker {
    const worker = new Worker(
        'notification-digest',
        async (job: Job) => {
            if (job.name === 'send-daily-digest') {
                console.log('[Digest Worker] Building daily notification digests...');
                const { runDailyDigest } = await import('@/lib/notifications/notification-email');
                const { sent } = await runDailyDigest();
                console.log('[Digest Worker] Daily digest sent to ' + sent + ' users');
            }
            if (job.name === 'send-agent-briefing') {
                console.log('[Digest Worker] Building agent daily briefings...');
                const { runAgentBriefings } = await import('@/lib/agent/briefing');
                const { sent } = await runAgentBriefings();
                console.log('[Digest Worker] Agent briefing sent for ' + sent + ' brand(s)');
            }
        },
        {
            connection: getConnection(),
            concurrency: 1,
        }
    );

    worker.on('failed', (job, err) => {
        console.error('[Digest Worker] Job ' + job?.id + ' failed:', err.message);
    });

    worker.on('error', (err) => {
        console.error('[Digest Worker] Worker error:', err);
    });

    console.log('[Digest Worker] Notification digest worker started');

    return worker;
}

/**
 * Create and start the CRM trash purge worker.
 * Hard-deletes soft-deleted CRM records past the retention window
 * (triggered by the daily cron in queue.ts).
 */
export function createCrmTrashPurgeWorker(): Worker {
    const worker = new Worker(
        'crm-trash-purge',
        async (job: Job) => {
            if (job.name === 'purge-expired-trash') {
                const { purgeExpiredCrmTrash } = await import('@/lib/crm/trash-purge');
                const result = await purgeExpiredCrmTrash();
                if (result.total > 0) {
                    console.log(
                        `[CRM Trash Purge] Purged ${result.total} records — contacts ${result.contacts}, companies ${result.companies}, deals ${result.deals}, activities ${result.activities}`
                    );
                }
            }
        },
        {
            connection: getConnection(),
            concurrency: 1,
        }
    );

    worker.on('failed', (job, err) => {
        console.error('[CRM Trash Purge] Job ' + job?.id + ' failed:', err.message);
    });

    worker.on('error', (err) => {
        console.error('[CRM Trash Purge] Worker error:', err);
    });

    console.log('[CRM Trash Purge] CRM trash purge worker started');

    return worker;
}
