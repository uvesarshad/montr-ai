import { whatsappWorkflowRepository } from '../db/repository/whatsapp-workflow.repository';
import { workflowExecutionService } from './workflow-execution.service';

export class WorkflowTriggerService {
    /**
     * Process incoming WhatsApp message and trigger matching workflows
     */
    async processIncomingMessage(data: {
        contactId: string;
        message: string;
        userId: string;
        accountId: string;
    }): Promise<void> {
        try {
            // Find active workflows for this user
            const workflows = await whatsappWorkflowRepository.findByUserId(data.userId, {
                status: 'active',
            });

            // Filter workflows by account if specified
            const accountWorkflows = workflows.filter((w) => {
                if (!w.trigger.config.accountFilter) return true;
                return w.trigger.config.accountFilter === data.accountId;
            });

            // Check each workflow's trigger
            for (const workflow of accountWorkflows) {
                const matches = await workflowExecutionService.checkTrigger(
                    workflow,
                    data.message
                );

                if (matches) {
                    // Execute workflow asynchronously
                    this.executeWorkflowAsync(workflow._id.toString(), data);
                }
            }
        } catch (error) {
            console.error('Error processing incoming message for workflows:', error);
        }
    }

    /**
     * Execute workflow asynchronously (non-blocking)
     */
    private async executeWorkflowAsync(
        workflowId: string,
        data: {
            contactId: string;
            message: string;
            userId: string;
        }
    ): Promise<void> {
        try {
            await workflowExecutionService.executeWorkflow({
                workflowId,
                contactId: data.contactId,
                userId: data.userId,
                triggerData: {
                    message: data.message,
                    timestamp: new Date(),
                },
                variables: {
                    message: data.message,
                    contact_id: data.contactId,
                },
            });
        } catch (error) {
            console.error(`Error executing workflow ${workflowId}:`, error);
        }
    }

    /**
     * Process scheduled workflows (cron-based)
     */
    async processScheduledWorkflows(): Promise<void> {
        try {
            // Find all active time-based workflows
            const workflows = await whatsappWorkflowRepository.findActiveByTriggerType('time');

            const _now = new Date();

            for (const workflow of workflows) {
                if (workflow.status !== 'active') continue;

                // Check if workflow should run based on cron expression
                // This would require a cron parser library
                // For now, we'll skip the actual cron parsing

                // TODO: Implement cron expression parsing
                // const shouldRun = this.shouldRunCron(workflow.trigger.config.cronExpression, now);

                // if (shouldRun) {
                //     this.executeScheduledWorkflow(workflow._id.toString());
                // }
            }
        } catch (error) {
            console.error('Error processing scheduled workflows:', error);
        }
    }

    /**
     * Execute scheduled workflow
     */
    private async executeScheduledWorkflow(workflowId: string): Promise<void> {
        try {
            const workflow = await whatsappWorkflowRepository.findById(workflowId);
            if (!workflow) return;

            // Get all contacts for this user (or specific contact list)
            // For now, we'll skip this part as it requires contact management

            // TODO: Implement contact list retrieval and batch execution
        } catch (error) {
            console.error(`Error executing scheduled workflow ${workflowId}:`, error);
        }
    }

    /**
     * Process incoming email and trigger matching workflows
     */
    async processIncomingEmail(data: {
        userId: string;
        from: string;
        subject: string;
        body: string;
        labels?: string[];
        attachments?: string[];
        provider: 'gmail' | 'outlook';
    }): Promise<void> {
        try {
            const workflows = await whatsappWorkflowRepository.findByUserId(data.userId, {
                status: 'active',
            });

            // Filter workflows that have email triggers
            const emailWorkflows = workflows.filter((w) => {
                if (w.trigger?.type !== 'email') return false;
                const config = w.trigger.config;

                // Check provider filter
                if (config?.provider && config.provider !== data.provider) return false;

                // Check filter type
                if (config?.filterType === 'subject') {
                    return data.subject.toLowerCase().includes((config.filterValue || '').toLowerCase());
                }
                if (config?.filterType === 'sender') {
                    return data.from.toLowerCase().includes((config.filterValue || '').toLowerCase());
                }
                if (config?.filterType === 'label') {
                    return data.labels?.some(l => l.toLowerCase() === (config.filterValue || '').toLowerCase()) ?? false;
                }

                // 'any' filter — matches all emails
                return true;
            });

            for (const workflow of emailWorkflows) {
                this.executeWorkflowWithContext(workflow._id.toString(), {
                    userId: data.userId,
                    triggerData: {
                        type: 'email',
                        from: data.from,
                        subject: data.subject,
                        body: data.body,
                        labels: data.labels,
                        attachments: data.attachments,
                        timestamp: new Date(),
                    },
                    variables: {
                        email_from: data.from,
                        email_subject: data.subject,
                        email_body: data.body,
                        email_attachments: data.attachments?.join(', ') || '',
                    },
                });
            }
        } catch (error) {
            console.error('Error processing incoming email for workflows:', error);
        }
    }

    /**
     * Process social media event and trigger matching workflows
     */
    async processSocialEvent(data: {
        userId: string;
        platform: 'instagram' | 'linkedin' | 'x' | 'facebook';
        eventType: 'mention' | 'comment' | 'dm' | 'follower' | 'like';
        content?: string;
        author?: string;
        postId?: string;
    }): Promise<void> {
        try {
            const workflows = await whatsappWorkflowRepository.findByUserId(data.userId, {
                status: 'active',
            });

            const socialWorkflows = workflows.filter((w) => {
                if (w.trigger?.type !== 'social_event') return false;
                const config = w.trigger.config;

                // Check platform filter
                if ((config?.platforms?.length ?? 0) > 0 && !config.platforms!.includes(data.platform)) {
                    return false;
                }

                // Check event type filter
                if (config?.eventType && config.eventType !== data.eventType) return false;

                return true;
            });

            for (const workflow of socialWorkflows) {
                this.executeWorkflowWithContext(workflow._id.toString(), {
                    userId: data.userId,
                    triggerData: {
                        type: 'social_event',
                        platform: data.platform,
                        eventType: data.eventType,
                        content: data.content,
                        author: data.author,
                        postId: data.postId,
                        timestamp: new Date(),
                    },
                    variables: {
                        social_platform: data.platform,
                        social_event: data.eventType,
                        social_content: data.content || '',
                        social_author: data.author || '',
                        social_post_id: data.postId || '',
                    },
                });
            }
        } catch (error) {
            console.error('Error processing social event for workflows:', error);
        }
    }

    /**
     * Process keyword match from monitoring and trigger matching workflows
     */
    async processKeywordMatch(data: {
        userId: string;
        matchedKeyword: string;
        sourceUrl: string;
        contextText: string;
        source: 'web' | 'social' | 'news';
    }): Promise<void> {
        try {
            const workflows = await whatsappWorkflowRepository.findByUserId(data.userId, {
                status: 'active',
            });

            const keywordWorkflows = workflows.filter((w) => {
                if (w.trigger?.type !== 'keyword') return false;
                const config = w.trigger.config;

                // Check if the matched keyword is in the tracked list
                const trackedKeywords: string[] = config?.keywords || [];
                const matchFound = trackedKeywords.some(
                    (kw: string) => data.matchedKeyword.toLowerCase().includes(kw.toLowerCase())
                );
                if (!matchFound) return false;

                // Check source filter
                if ((config?.sources?.length ?? 0) > 0 && !config.sources!.includes(data.source)) {
                    return false;
                }

                return true;
            });

            for (const workflow of keywordWorkflows) {
                this.executeWorkflowWithContext(workflow._id.toString(), {
                    userId: data.userId,
                    triggerData: {
                        type: 'keyword',
                        matchedKeyword: data.matchedKeyword,
                        sourceUrl: data.sourceUrl,
                        contextText: data.contextText,
                        source: data.source,
                        timestamp: new Date(),
                    },
                    variables: {
                        keyword_matched: data.matchedKeyword,
                        keyword_source_url: data.sourceUrl,
                        keyword_context: data.contextText,
                        keyword_source: data.source,
                    },
                });
            }
        } catch (error) {
            console.error('Error processing keyword match for workflows:', error);
        }
    }

    /**
     * Process incoming Telegram message and trigger matching workflows
     */
    async processIncomingTelegram(data: {
        userId: string;
        accountId: string;          // The bot ID
        chatId: string;             // The user chatting with the bot
        message: string;            // Text content
        messageType: 'text' | 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'sticker' | 'contact' | 'location' | 'venue';
        firstName?: string;
        lastName?: string;
        username?: string;
    }): Promise<void> {
        try {
            const workflows = await whatsappWorkflowRepository.findByUserId(data.userId, {
                status: 'active',
            });

            // Filter workflows that have telegram triggers
            const telegramWorkflows = workflows.filter((w) => {
                if (w.trigger?.type !== 'telegram') return false;
                const config = w.trigger.config;

                // Account/Bot filter (must match the webhook's bot)
                if (config?.accountFilter && config.accountFilter !== data.accountId) return false;

                // Message type filter
                if (config?.messageType && config.messageType !== 'any' && config.messageType !== data.messageType) {
                    return false;
                }

                // Keyword matching for text messages
                if (config?.triggerType === 'keyword' && data.messageType === 'text') {
                    const keywords: string[] = config.keywords || [];
                    const hasMatch = keywords.some(k => data.message.toLowerCase().includes(k.trim().toLowerCase()));
                    if (!hasMatch) return false;
                }

                return true;
            });

            for (const workflow of telegramWorkflows) {
                this.executeWorkflowWithContext(workflow._id.toString(), {
                    userId: data.userId,
                    contactId: data.chatId, // Treat Chat ID as Contact ID
                    triggerData: {
                        type: 'telegram',
                        message: data.message,
                        messageType: data.messageType,
                        chatId: data.chatId,
                        sender: {
                            firstName: data.firstName,
                            lastName: data.lastName,
                            username: data.username,
                        },
                        timestamp: new Date(),
                    },
                    variables: {
                        telegram_message: data.message,
                        telegram_chat_id: data.chatId,
                        telegram_first_name: data.firstName || '',
                        telegram_username: data.username || '',
                        telegram_type: data.messageType,
                    },
                });
            }
        } catch (error) {
            console.error('Error processing incoming Telegram for workflows:', error);
        }
    }

    /**
     * Generic workflow execution with flexible context
     */
    private async executeWorkflowWithContext(
        workflowId: string,
        data: {
            userId: string;
            triggerData: Record<string, unknown>;
            variables: Record<string, unknown>;
            contactId?: string;
        }
    ): Promise<void> {
        try {
            await workflowExecutionService.executeWorkflow({
                workflowId,
                contactId: data.contactId || '',
                userId: data.userId,
                triggerData: data.triggerData,
                variables: data.variables,
            });
        } catch (error) {
            console.error(`Error executing workflow ${workflowId}:`, error);
        }
    }
}

export const workflowTriggerService = new WorkflowTriggerService();
