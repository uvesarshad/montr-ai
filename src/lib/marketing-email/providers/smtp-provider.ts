
import { BaseMarketingProvider, SendEmailOptions, ProviderVerificationResult } from './base-provider';
import nodemailer from 'nodemailer';

export class SMTPProvider extends BaseMarketingProvider {
    private transporter: nodemailer.Transporter;

    constructor(credentials: { host: string; port: number; username: string; password: string; secure: boolean }) {
        super(credentials);
        this.transporter = nodemailer.createTransport({
            host: credentials.host,
            port: credentials.port,
            secure: credentials.secure,
            auth: {
                user: credentials.username,
                pass: credentials.password,
            },
        });
    }

    async send(options: SendEmailOptions): Promise<{ messageId: string }> {
        try {
            const info = await this.transporter.sendMail({
                from: `"${options.fromName}" <${options.fromEmail}>` as string,
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text,
                replyTo: options.replyTo,
                headers: options.trackingId ? { 'X-Tracking-Id': options.trackingId } : undefined,
            });

            return { messageId: info.messageId };
        } catch (error: unknown) {
            const err = error as Error;
            throw new Error(`SMTP Send Error: ${err.message}`);
        }
    }

    async verify(): Promise<ProviderVerificationResult> {
        try {
            await this.transporter.verify();
            return { success: true, message: 'Connected to SMTP server successfully' };
        } catch (error: unknown) {
            const err = error as Error;
            return { success: false, message: err.message };
        }
    }

    async getQuota(): Promise<{ limit?: number; used?: number; remaining?: number; resetAt?: Date; }> {
        // SMTP doesn't support quota check natively
        return {};
    }
}
