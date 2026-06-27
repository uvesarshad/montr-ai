import { knowledgeBaseService } from '@/lib/inbox/knowledge-base.service';
import { Types } from 'mongoose';
import User from '@/lib/db/models/user.model';
import { IDocument } from '@/lib/db/models/document.model';
import KnowledgeBase from '@/lib/db/models/knowledge-base.model';

export class DocIndexer {
    /**
     * Extracts text from TipTap JSON or HTML and indexes it
     */
    async indexDocument(doc: IDocument): Promise<void> {
        try {
            if (!doc.content) return;

            // Fetch user to get organizationId
            const user = await User.findById(doc.userId);
            if (!user) {
                console.warn('User not found when indexing doc:', doc.userId);
                return;
            }

            const orgIdStr = user.id || doc.userId;

            // Validating ObjectId
            if (!Types.ObjectId.isValid(orgIdStr) || !Types.ObjectId.isValid(doc.userId)) {
                console.warn('Invalid ObjectId for orgIdStr or userId:', orgIdStr, doc.userId);
                return;
            }
            const createdById = new Types.ObjectId(doc.userId);

            // Extract plain text from the content. It might be HTML or TipTap JSON
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
            console.log(`Successfully indexed doc ${doc._id} in KB`);
        } catch (error) {
            console.error('Failed to index document in KB:', error);
        }
    }

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

export const docIndexer = new DocIndexer();
