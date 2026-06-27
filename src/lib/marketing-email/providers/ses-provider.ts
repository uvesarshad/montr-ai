
import { BaseMarketingProvider, SendEmailOptions, ProviderVerificationResult } from './base-provider';
import { SESClient, SendEmailCommand, GetSendQuotaCommand } from '@aws-sdk/client-ses';

export class SESProvider extends BaseMarketingProvider {
    private client: SESClient;

    constructor(credentials: { accessKeyId: string; secretAccessKey: string; region: string }) {
        super(credentials);
        this.client = new SESClient({
            region: credentials.region,
            credentials: {
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
            },
        });
    }

    async send(options: SendEmailOptions): Promise<{ messageId: string }> {
        const command = new SendEmailCommand({
            Source: `"${options.fromName}" <${options.fromEmail}>`,
            Destination: {
                ToAddresses: [options.to],
            },
            Message: {
                Subject: { Data: options.subject },
                Body: {
                    Html: { Data: options.html },
                    Text: options.text ? { Data: options.text } : undefined,
                },
            },
            ReplyToAddresses: options.replyTo ? [options.replyTo] : undefined,
            Tags: options.tags?.map(tag => ({ Name: 'Tag', Value: tag })),
            ConfigurationSetName: options.metadata?.configurationSet as string | undefined, // Optional SES config set
        });

        try {
            const result = await this.client.send(command);
            return { messageId: result.MessageId || '' };
        } catch (error) {
            throw new Error(`SES Send Error: ${(error as Error).message}`);
        }
    }

    async verify(): Promise<ProviderVerificationResult> {
        try {
            await this.client.send(new GetSendQuotaCommand({}));
            return { success: true, message: 'Connected to AWS SES successfully' };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    }

    async getQuota(): Promise<{ limit?: number; used?: number; remaining?: number; resetAt?: Date; }> {
        try {
            const result = await this.client.send(new GetSendQuotaCommand({}));
            return {
                limit: result.Max24HourSend,
                used: result.SentLast24Hours,
                remaining: (result.Max24HourSend || 0) - (result.SentLast24Hours || 0),
            };
        } catch (error) {
            console.error('Failed to get SES quota', error);
            return {};
        }
    }
}
