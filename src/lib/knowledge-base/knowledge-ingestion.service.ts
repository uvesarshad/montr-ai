import { knowledgeBaseService } from '@/lib/inbox/knowledge-base.service';
import { Types } from 'mongoose';
import User from '@/lib/db/models/user.model';
import KnowledgeBase from '@/lib/db/models/knowledge-base.model';
import { IDocument } from '@/lib/db/models/document.model';

export class KnowledgeIngestionService {

    /**
     * Ingests a long-term AI chat history (Copilot)
     */
    async ingestCopilotConversation(
        userId: string,
        conversationId: string,
        title: string,
        messages: Array<{ role: string, content: string }>
    ): Promise<void> {
        try {
            const { createdById } = await this.resolveContext(userId);
            const summary = `AI COPILOT CONVERSATION HISTORY
Title: ${title}

Context & Key Insights:
The user previously discussed the following with the AI. This context should be used to remember brand preferences and ongoing strategies.

Transcript:
${messages.slice(-8).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}
`;

            await KnowledgeBase.deleteMany({
                'metadata.conversationId': conversationId.toString()
            });

            await knowledgeBaseService.indexDocument({
                name: `AI Memory: ${title}`,
                content: summary,
                type: 'ai_memory',
                metadata: {
                    conversationId: conversationId.toString(),
                },
                createdById
            });
            console.log(`[KnowledgeIngestion] indexed AI conversation ${conversationId}`);
        } catch (error) {
            console.error('[KnowledgeIngestion] Failed to index AI conversation:', error);
        }
    }

    /**
     * Extracts text from TipTap JSON or HTML and indexes it
     */
    async ingestDocument(doc: IDocument): Promise<void> {
        try {
            if (!doc.content) return;

            const { createdById } = await this.resolveContext(doc.userId);
            const plainText = this.extractText(doc.content);
            if (!plainText.trim()) return;

            // Delete existing knowledge base entries for this document to prevent duplicates
            await KnowledgeBase.deleteMany({
                'metadata.documentId': doc._id.toString()
            });

            await knowledgeBaseService.indexDocument({
                name: doc.title || 'Untitled Document',
                content: plainText,
                type: 'document',
                metadata: {
                    documentId: doc._id.toString(),
                    url: `/docs/${doc._id}`
                },
                createdById
            });
            console.log(`[KnowledgeIngestion] indexed doc ${doc._id}`);
        } catch (error) {
            console.error('[KnowledgeIngestion] Failed to index document:', error);
        }
    }

    /**
     * Ingests a Social Media Post report to teach the AI brand voice & optimize future posts
     */
    async ingestSocialPostReport(
        userId: string,
        postId: string,
        platform: string,
        content: string,
        metrics: { reach?: number, engagement?: number, sentiment?: string }
    ): Promise<void> {
        try {
            const { createdById } = await this.resolveContext(userId);
            const summary = `SOCIAL MEDIA PERFORMANCE REPORT
Platform: ${platform}
Content: "${content}"
Performance Metrics: 
- Reach: ${metrics.reach || 'N/A'}
- Engagement Rate: ${metrics.engagement ? metrics.engagement + '%' : 'N/A'}
- Audience Sentiment: ${metrics.sentiment || 'Neutral'}

Context: This represents a historical post for the organization's brand voice. High engagement indicates strong resonance with the target audience.`;

            // Delete existing knowledge base entries for this post report (if re-ingesting)
            await KnowledgeBase.deleteMany({
                'metadata.postId': postId.toString()
            });

            await knowledgeBaseService.indexDocument({
                name: `Social Report: ${platform} Post Analytics`,
                content: summary,
                type: 'social_report',
                metadata: {
                    postId: postId.toString(),
                    platform
                },
                createdById
            });
            console.log(`[KnowledgeIngestion] indexed social post ${postId}`);
        } catch (error) {
            console.error('[KnowledgeIngestion] Failed to index social post:', error);
        }
    }

    /**
     * Ingests a CRM Entity (Deal or Contact)
     */
    async ingestCrmEntity(
        userId: string,
        entityId: string,
        type: 'contact' | 'deal',
        name: string,
        description: string,
        tags: string[] = []
    ): Promise<void> {
        try {
            const { createdById } = await this.resolveContext(userId);
            const summary = `CRM RECORD: ${type.toUpperCase()}
Name/Title: ${name}
Tags: ${tags.join(', ')}

Details & Notes:
${description}

Context: This represents a high-value relationship or sales cycle inside the organization's CRM.`;

            await KnowledgeBase.deleteMany({
                'metadata.entityId': entityId.toString()
            });

            await knowledgeBaseService.indexDocument({
                name: `CRM ${type}: ${name}`,
                content: summary,
                type: `crm_${type}`,
                metadata: {
                    entityId: entityId.toString(),
                },
                createdById
            });
            console.log(`[KnowledgeIngestion] indexed CRM ${type} ${entityId}`);
        } catch (error) {
            console.error(`[KnowledgeIngestion] Failed to index CRM ${type}:`, error);
        }
    }

    /**
     * Ingests a resolved WhatsApp / Inbox thread to act as an automated FAQ
     */
    async ingestResolvedInboxThread(
        userId: string,
        threadId: string,
        customerName: string,
        summaryText: string
    ): Promise<void> {
        try {
            const { createdById } = await this.resolveContext(userId);
            const summary = `CUSTOMER SERVICE RESOLUTION
Customer: ${customerName}

Thread Summary & Resolution:
${summaryText}

Context: This represents a resolved customer inquiry. This can be used to generate automated FAQ responses or understand common customer pain points.`;

            await KnowledgeBase.deleteMany({
                'metadata.threadId': threadId.toString()
            });

            await knowledgeBaseService.indexDocument({
                name: `Resolved Ticket: ${customerName}`,
                content: summary,
                type: 'inbox_thread',
                metadata: {
                    threadId: threadId.toString(),
                },
                createdById
            });
            console.log(`[KnowledgeIngestion] indexed inbox thread ${threadId}`);
        } catch (error) {
            console.error('[KnowledgeIngestion] Failed to index inbox thread:', error);
        }
    }

    /**
     * Ingests a Form structure or long-form submission
     */
    async ingestFormContext(
        userId: string,
        formId: string,
        formTitle: string,
        contextPayload: string
    ): Promise<void> {
        try {
            const { createdById } = await this.resolveContext(userId);
            await KnowledgeBase.deleteMany({
                'metadata.formId': formId.toString()
            });

            await knowledgeBaseService.indexDocument({
                name: `Form Structure: ${formTitle}`,
                content: contextPayload, // Expected to be a readable string description of the form's purpose and fields
                type: 'form',
                metadata: {
                    formId: formId.toString(),
                },
                createdById
            });
            console.log(`[KnowledgeIngestion] indexed form ${formId}`);
        } catch (error) {
            console.error('[KnowledgeIngestion] Failed to index form:', error);
        }
    }


    /**
     * Helper to resolve Organization context from a User ID
     */
    private async resolveContext(userIdStr: string | Types.ObjectId): Promise<{ createdById: Types.ObjectId }> {
        const fallbackCreatedBy = new Types.ObjectId(userIdStr);
        try {
            const user = await User.findById(userIdStr);
            if (!user) {
                console.warn('[KnowledgeIngestion] User not found:', userIdStr);
                return { createdById: fallbackCreatedBy };
            }
            const orgIdStr = user.id || user._id;

            if (!Types.ObjectId.isValid(orgIdStr)) {
                return { createdById: fallbackCreatedBy };
            }
            return {
                createdById: fallbackCreatedBy
            };
        } catch (_e) {
            return { createdById: fallbackCreatedBy };
        }
    }

    /**
     * Private text extraction parsing helpers 
     */
    private extractText(content: string): string {
        try {
            // Check if it's JSON from TipTap
            if (content.startsWith('{') && content.endsWith('}')) {
                const parsed = JSON.parse(content);
                return this.extractFromTipTap(parsed);
            }
            // Fallback to stripping HTML
            return content.replace(/<[^>]*>?/gm, ' ');
        } catch (_e) {
            // If parsing fails, just strip HTML tags as fallback
            return content.replace(/<[^>]*>?/gm, ' ');
        }
    }

    private extractFromTipTap(node: { type?: string; text?: string; content?: unknown[] }): string {
        if (node.type === 'text') {
            return node.text || '';
        }
        let text = '';
        if (node.content && Array.isArray(node.content)) {
            for (const child of node.content) {
                text += this.extractFromTipTap(child as { type?: string; text?: string; content?: unknown[] }) + ' ';
            }
        }
        return text;
    }
}

export const knowledgeIngestionService = new KnowledgeIngestionService();
