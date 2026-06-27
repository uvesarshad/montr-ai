import { IWorkflowNode } from '../db/models/whatsapp-workflow.model';
import { IWorkflowExecution } from '../db/models/workflow-execution.model';
import { IContactChannel } from '../db/models/crm/contact.model';
import { whatsappService } from './whatsapp.service';
import { whatsappAccountRepository } from '../db/repository/whatsapp-account.repository';
import { contactRepository } from '../db/repository/crm/contact.repository';
import { knowledgeBaseService } from '../inbox/knowledge-base.service';
import User from '../db/models/user.model';
import mongoose from 'mongoose';

/**
 * Helper to send WhatsApp message
 */
async function sendWhatsAppMessage(
    execution: IWorkflowExecution,
    payload: Record<string, unknown>
): Promise<void> {
    // 1. Get Account
    // ideally execution should store accountId or organizationId
    const accounts = await whatsappAccountRepository.findByUserId(execution.userId.toString());
    if (!accounts || accounts.length === 0) {
        throw new Error(`No WhatsApp account found for user ${execution.userId}`);
    }
    const account = accounts[0];

    // 2. Get Contact to find phone number
    const contact = await contactRepository.findById(execution.contactId.toString());
    if (!contact) {
        throw new Error(`Contact not found: ${execution.contactId}`);
    }

    const whatsappChannel = contact.channels?.find((c: IContactChannel) => c.type === 'whatsapp');
    if (!whatsappChannel) {
        throw new Error(`Contact ${execution.contactId} has no WhatsApp channel`);
    }

    // 3. Send Message
    await whatsappService.sendMessage(account, {
        messaging_product: 'whatsapp',
        to: whatsappChannel.identifier,
        ...payload
    });
}

/**
 * Send WhatsApp template message
 */
export async function executeSendTemplate(
    node: IWorkflowNode,
    execution: IWorkflowExecution
): Promise<Record<string, unknown>> {
    const config = node.data.config ?? {};
    const templateId = (config.templateId as string) || '';
    const parameters = (config.parameters as unknown[]) || [];

    // Replace variables in parameters
    const processedParams = (parameters as unknown[]).map((param) => {
        if (typeof param === 'string') {
            return replaceVariables(param, execution.variables);
        }
        return param;
    });

    await sendWhatsAppMessage(execution, {
        type: 'template',
        template: {
            name: templateId,
            language: { code: 'en_US' }, // TODO: Make dynamic
            components: [
                {
                    type: 'body',
                    parameters: processedParams.map((p) => ({
                        type: 'text',
                        text: String(p)
                    }))
                }
            ]
        }
    });

    return { sent: true, templateId, parameters: processedParams };
}

/**
 * Execute Send Text node
 */
export async function executeSendText(
    node: IWorkflowNode,
    execution: IWorkflowExecution
): Promise<Record<string, unknown>> {
    const config = node.data.config ?? {};
    const rawMessage = config.message;
    let messageContent: string;

    // Handle multilingual content
    if (typeof rawMessage === 'object' && rawMessage !== null) {
        const multilingual = rawMessage as Record<string, unknown>;
        const userLanguage = (execution.variables?.language as string) || 'en';
        const translations = multilingual.translations as Record<string, string> | undefined;
        if (translations && translations[userLanguage]) {
            messageContent = translations[userLanguage];
        } else {
            messageContent = (multilingual.default as string) || '';
        }
    } else {
        messageContent = (rawMessage as string) || '';
    }

    // Replace variables
    const message = replaceVariables(messageContent, execution.variables);

    await sendWhatsAppMessage(execution, {
        type: 'text',
        text: { body: message }
    });

    return { sent: true, message };
}

/**
 * Execute AI Agent node with OpenAI/Claude integration
 */
export async function executeAIAgent(
    node: IWorkflowNode,
    execution: IWorkflowExecution
): Promise<Record<string, unknown>> {
    const config = node.data.config ?? {};
    const systemPrompt = (config.systemPrompt as string) || 'You are a helpful assistant.';
    const model = (config.model as string) || 'gpt-4';
    const temperature = (config.temperature as number) || 0.7;

    // Get conversation context from variables
    const triggerData = execution.triggerData as Record<string, unknown> | undefined;
    const userMessage = (execution.variables.message as string) || (triggerData?.['message'] as string) || '';
    const contextVariables = (config.contextVariables as string[]) || [];

    // Build context from variables
    let context = '';
    for (const varName of contextVariables) {
        if (execution.variables[varName]) {
            context += `${varName}: ${execution.variables[varName]}\n`;
        }
    }

    // Fetch Knowledge Base Context if enabled
    if (config.useKnowledgeBase && userMessage) {
        try {
            const user = await User.findById(execution.userId);
            let organizationId = execution.userId;
            if (user && user.id && mongoose.Types.ObjectId.isValid(user.id!)) {
                organizationId = new mongoose.Types.ObjectId(user.id!);
            }

            const kbContext = await knowledgeBaseService.getContext({
                query: userMessage,
            });
            if (kbContext) {
                context = context ? `${context}\n\nOrganization Knowledge Base:\n${kbContext}` : `Organization Knowledge Base:\n${kbContext}`;
            }
        } catch (e) {
            console.error("Failed to fetch Knowledge Base context for executeAIAgent:", e);
        }
    }

    // Call AI service (placeholder - implement based on your AI service)
    const aiResponse = await callAIService({
        model,
        systemPrompt,
        userMessage,
        context,
        temperature,
    });

    // Store AI response in variables
    execution.variables.ai_response = aiResponse;

    // Send AI response to user
    await sendWhatsAppMessage(execution, {
        type: 'text',
        text: { body: aiResponse }
    });

    return { sent: true, response: aiResponse, model };
}

/**
 * Execute Knowledge Base query
 */
export async function executeKnowledgeBase(
    node: IWorkflowNode,
    execution: IWorkflowExecution
): Promise<Record<string, unknown>> {
    const config = node.data.config ?? {};
    const query = replaceVariables((config.query as string) || '', execution.variables);
    const knowledgeBaseId = (config.knowledgeBaseId as string) || '';
    const maxResults = (config.maxResults as number) || 5;

    // Query knowledge base (placeholder - implement based on your KB service)
    const results = await queryKnowledgeBase({
        knowledgeBaseId,
        query,
        maxResults,
    });

    // Store results in variables
    execution.variables.kb_results = results;
    execution.variables.kb_top_result = results[0]?.content || '';

    return { results, count: results.length };
}

/**
 * Execute Bot Config node
 */
export async function executeBotConfig(
    node: IWorkflowNode,
    execution: IWorkflowExecution
): Promise<Record<string, unknown>> {
    const config = node.data.config ?? {};

    // Update bot configuration in variables
    execution.variables.bot_personality = (config.personality as string) || 'friendly';
    execution.variables.bot_language = (config.language as string) || 'en';
    execution.variables.bot_tone = (config.tone as string) || 'professional';

    return { configured: true, config };
}

/**
 * Execute Assign to Group node
 */
export async function executeAssignGroup(
    node: IWorkflowNode,
    execution: IWorkflowExecution
): Promise<Record<string, unknown>> {
    const config = node.data.config ?? {};
    const groupId = (config.groupId as string) || '';
    const routingStrategy = (config.routingStrategy as string) || 'round-robin';

    // Assign to group (placeholder - implement based on your assignment service)
    await assignToGroup({
        contactId: execution.contactId.toString(),
        groupId,
        routingStrategy,
    });

    return { assigned: true, groupId, routingStrategy };
}

// Helper functions

function replaceVariables(text: string, variables: Record<string, unknown>): string {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{${key}\\}`, 'g');
        result = result.replace(regex, String(value));
    }
    return result;
}

async function callAIService(params: {
    model: string;
    systemPrompt: string;
    userMessage: string;
    context: string;
    temperature: number;
}): Promise<string> {
    // TODO: Implement actual AI service integration
    // This is a placeholder that returns a mock response
    return `AI Response to: ${params.userMessage}`;
}

async function queryKnowledgeBase(_params: {
    knowledgeBaseId: string;
    query: string;
    maxResults: number;
}): Promise<Array<{ content: string; score: number; metadata: Record<string, unknown> }>> {
    // TODO: Implement actual knowledge base integration
    return [
        {
            content: 'Sample knowledge base result',
            score: 0.95,
            metadata: {},
        },
    ];
}

async function assignToGroup(params: {
    contactId: string;
    groupId: string;
    routingStrategy: string;
}): Promise<void> {
    // TODO: Implement actual group assignment logic
    console.log('Assigning to group:', params);
}


/**
 * Execute Send Image node
 */
export async function executeSendImage(
    node: IWorkflowNode,
    execution: IWorkflowExecution
): Promise<Record<string, unknown>> {
    const config = node.data.config ?? {};
    const imageUrl = (config.imageUrl as string) || '';
    let caption = (config.caption as string) || '';

    caption = replaceVariables(caption, execution.variables);

    await sendWhatsAppMessage(execution, {
        type: 'image',
        image: {
            link: imageUrl,
            caption: caption
        }
    });

    return { sent: true, imageUrl, caption };
}

/**
 * Execute Send PDF node
 */
export async function executeSendPDF(
    node: IWorkflowNode,
    execution: IWorkflowExecution
): Promise<Record<string, unknown>> {
    const config = node.data.config ?? {};
    const pdfUrl = (config.pdfUrl as string) || '';
    const filename = (config.filename as string) || 'document.pdf';

    await sendWhatsAppMessage(execution, {
        type: 'document',
        document: {
            link: pdfUrl,
            filename: filename
        }
    });

    return { sent: true, pdfUrl, filename };
}

/**
 * Execute Send Video node
 */
export async function executeSendVideo(
    node: IWorkflowNode,
    execution: IWorkflowExecution
): Promise<Record<string, unknown>> {
    const config = node.data.config ?? {};
    const videoUrl = (config.videoUrl as string) || '';
    let caption = (config.caption as string) || '';

    caption = replaceVariables(caption, execution.variables);

    await sendWhatsAppMessage(execution, {
        type: 'video',
        video: {
            link: videoUrl,
            caption: caption
        }
    });

    return { sent: true, videoUrl, caption };
}

export const nodeProcessors = {
    executeSendText,
    executeSendImage,
    executeSendPDF,
    executeSendVideo,
    executeSendTemplate,
    executeAIAgent,
    executeKnowledgeBase,
    executeBotConfig,
    executeAssignGroup,
};
