
/**
 * Base Marketing Email Provider Interface
 */
export interface SendEmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
    fromEmail: string;
    fromName: string;
    replyTo?: string;
    trackingId?: string; // Internal tracking ID
    metadata?: Record<string, unknown>;
    tags?: string[];
}

export interface ProviderVerificationResult {
    success: boolean;
    message?: string;
    details?: unknown;
}

export abstract class BaseMarketingProvider {
    constructor(protected credentials: Record<string, unknown>) { }

    /**
     * Send a single email
     */
    abstract send(options: SendEmailOptions): Promise<{ messageId: string }>;

    /**
     * Verify credentials and connection
     */
    abstract verify(): Promise<ProviderVerificationResult>;

    /**
     * Get quota information (if supported)
     */
    abstract getQuota(): Promise<{
        limit?: number;
        used?: number;
        remaining?: number;
        resetAt?: Date;
    }>;
}
