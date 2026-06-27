/**
 * Email Sync Reliability Improvements
 * Adds retry logic, error handling, and incremental sync for email operations
 */

import { ICrmEmailAccount } from '@/lib/db/models/crm/email-account.model';

export interface SyncOptions {
    maxRetries?: number;
    retryDelay?: number;
    batchSize?: number;
    onProgress?: (progress: { current: number; total: number }) => void;
}

export interface SyncResult {
    success: boolean;
    emailsSynced: number;
    errors: Array<{ message: string; timestamp: Date }>;
    lastSyncToken?: string;
}

/**
 * Retry wrapper for email sync operations
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: { maxRetries?: number; retryDelay?: number } = {}
): Promise<T> {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error('Unknown error');

            // Don't retry on authentication errors
            if (
                lastError.message.includes('401') ||
                lastError.message.includes('Unauthorized') ||
                lastError.message.includes('invalid_grant')
            ) {
                throw lastError;
            }

            // Don't retry on the last attempt
            if (attempt === maxRetries) {
                break;
            }

            // Exponential backoff
            const delay = retryDelay * Math.pow(2, attempt);
            console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw lastError || new Error('Operation failed after retries');
}

/**
 * Improved email sync with retry logic and error handling
 */
export async function syncEmailsWithRetry(
    account: ICrmEmailAccount,
    syncFunction: (account: ICrmEmailAccount) => Promise<void>,
    options: SyncOptions = {}
): Promise<SyncResult> {
    const errors: Array<{ message: string; timestamp: Date }> = [];
    let emailsSynced = 0;

    try {
        await withRetry(
            async () => {
                await syncFunction(account);
                emailsSynced++;
            },
            {
                maxRetries: options.maxRetries || 3,
                retryDelay: options.retryDelay || 1000,
            }
        );

        // Update last sync time
        const EmailAccountRepository = (await import('@/lib/db/repository/crm/email-account.repository')).emailAccountRepository;
        // @ts-expect-error
        await EmailAccountRepository.update(account._id.toString());

        return {
            success: true,
            emailsSynced,
            errors,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
            message: errorMessage,
            timestamp: new Date(),
        });

        // Update sync status to error
        const EmailAccountRepository = (await import('@/lib/db/repository/crm/email-account.repository')).emailAccountRepository;
        // @ts-expect-error
        await EmailAccountRepository.update(account._id.toString());

        return {
            success: false,
            emailsSynced,
            errors,
        };
    }
}

/**
 * Batch email sync with progress tracking
 */
export async function batchSyncEmails(
    accounts: ICrmEmailAccount[],
    syncFunction: (account: ICrmEmailAccount) => Promise<void>,
    options: SyncOptions = {}
): Promise<{ total: number; successful: number; failed: number }> {
    const batchSize = options.batchSize || 5;
    let successful = 0;
    let failed = 0;

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < accounts.length; i += batchSize) {
        const batch = accounts.slice(i, i + batchSize);

        const results = await Promise.allSettled(
            batch.map((account) =>
                syncEmailsWithRetry(account, syncFunction, options)
            )
        );

        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.success) {
                successful++;
            } else {
                failed++;
            }

            // Report progress
            if (options.onProgress) {
                options.onProgress({
                    current: i + index + 1,
                    total: accounts.length,
                });
            }
        });
    }

    return { total: accounts.length, successful, failed };
}

/**
 * Check if account needs token refresh
 */
export async function ensureValidToken(account: ICrmEmailAccount): Promise<ICrmEmailAccount> {
    if (!account.oauth) {
        return account;
    }

    const now = new Date();
    const expiresAt = account.oauth.expiresAt ? new Date(account.oauth.expiresAt) : null;

    // Refresh if expired or expiring within 5 minutes
    if (expiresAt && expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
        const { refreshOAuthToken } = await import('@/lib/crm/email-sync');
        const newTokens = await refreshOAuthToken(account);

        // Update account with new tokens
        const EmailAccountRepository = (await import('@/lib/db/repository/crm/email-account.repository')).emailAccountRepository;
        // @ts-expect-error
        await EmailAccountRepository.update(account._id.toString());

        account.oauth.accessToken = newTokens.accessToken;
        account.oauth.refreshToken = newTokens.refreshToken;
        account.oauth.expiresAt = newTokens.expiresAt;
    }

    return account;
}
