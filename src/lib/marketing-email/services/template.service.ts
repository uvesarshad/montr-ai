
import { IMarketingTemplate } from '@/lib/db/models/marketing-email/template.model';
import { generateText } from '@/ai/flows/generate-text-flow';

export class TemplateService {

    /**
     * Render template with variables
     */
    render(template: IMarketingTemplate, variables: Record<string, unknown>): { subject: string; html: string; text?: string } {
        let subject = template.subject || '';
        let html = template.htmlContent || '';
        let text = template.textContent || '';

        // Simple variable replacement {{variable}}
        // In production, might use Handlebars or Liquid
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            const valStr = String(value ?? '');

            subject = subject.replace(regex, valStr);
            html = html.replace(regex, valStr);
            text = text.replace(regex, valStr);
        }

        // Handle nested object variables like contact.firstName
        // Very basic implementation
        if (variables.contact && typeof variables.contact === 'object') {
            for (const [key, value] of Object.entries(variables.contact as Record<string, unknown>)) {
                const regex = new RegExp(`{{contact.${key}}}`, 'g');
                const valStr = String(value ?? '');
                subject = subject.replace(regex, valStr);
                html = html.replace(regex, valStr);
                text = text.replace(regex, valStr);
            }
        }

        return { subject, html, text };
    }

    /**
     * Generate email template using AI
     * Uses internal AI flow which handles credits and providers
     */
    async generateWithAI(
        prompt: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _organizationId: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _userId: string
    ): Promise<{ subject: string; html: string }> {

        const systemPrompt = `
      You are an expert email marketing copywriter and designer.
      Generate a professional HTML email template based on the user's request.
      
      Return a JSON object with:
      1. "subject": Catchy subject line
      2. "html": Complete, responsive HTML email body with inline CSS. Use specific placeholders like {{contact.firstName}} where appropriate.
      
      Do not include markdown formatting, just the raw JSON.
      `;

        try {
            const { text } = await generateText({
                model: 'gpt-4o', // Default model, or could be passed in
                prompt: prompt,
                systemPrompt: systemPrompt
            });

            // Parse JSON from response (handling potential markdown wrapping)
            const cleanText = text.replace(/```json\n?|\n?```/g, '');
            const result = JSON.parse(cleanText) as { subject: string; html: string };

            return {
                subject: result.subject,
                html: result.html
            };

        } catch (error) {
            console.error('AI Template Generation failed:', error);
            throw new Error('Failed to generate template with AI');
        }
    }

    /**
     * Helper to extract variables from content
     */
    extractVariables(content: string): string[] {
        const regex = /{{([\w.]+)}}/g;
        const matches = new Set<string>();
        let match;
        while ((match = regex.exec(content)) !== null) {
            matches.add(match[1]);
        }
        return Array.from(matches);
    }
}

export const templateService = new TemplateService();
