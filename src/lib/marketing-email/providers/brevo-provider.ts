
import { BaseMarketingProvider, SendEmailOptions, ProviderVerificationResult } from './base-provider';

/**
 * Brevo (formerly Sendinblue) Provider
 * Uses v3 API via fetch to reduce dependency size
 */
export class BrevoProvider extends BaseMarketingProvider {
    private apiUrl = 'https://api.brevo.com/v3';

    constructor(credentials: { apiKey: string }) {
        super(credentials);
    }

    private async request(endpoint: string, method: string = 'GET', body?: unknown) {
        const headers = {
            'api-key': this.credentials.apiKey as string,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };

        const response = await fetch(`${this.apiUrl}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(`Brevo API Error: ${error.message || response.statusText}`);
        }

        return response.json();
    }

    async send(options: SendEmailOptions): Promise<{ messageId: string }> {
        const payload = {
            sender: {
                name: options.fromName,
                email: options.fromEmail,
            },
            to: [{ email: options.to }],
            subject: options.subject,
            htmlContent: options.html,
            textContent: options.text,
            replyTo: options.replyTo ? { email: options.replyTo } : undefined,
            tags: options.tags,
            // Metadata in Brevo headers for webhook tracking matching
            headers: options.trackingId ? { 'X-Tracking-Id': options.trackingId } : undefined,
        };

        const result = await this.request('/smtp/email', 'POST', payload);
        return { messageId: result.messageId };
    }

    async verify(): Promise<ProviderVerificationResult> {
        try {
            await this.request('/account', 'GET');
            return { success: true, message: 'Connected to Brevo successfully' };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    }

    async getQuota(): Promise<{ limit?: number; used?: number; remaining?: number; resetAt?: Date; }> {
        try {
            const account = await this.request('/account', 'GET');
            // Brevo plan info structure varies, basic implementation
            const credits = account.plan?.credits?.find((c: { type: string; total: number; used: number }) => c.type === 'sendLimit');

            if (credits) {
                return {
                    limit: credits.total,
                    used: credits.used,
                    remaining: credits.total - credits.used,
                };
            }
            return {};
        } catch (error) {
            console.error('Failed to get Brevo quota', error);
            return {};
        }
    }
}
