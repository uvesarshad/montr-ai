/**
 * Integration Import Service
 *
 * Pulls audience/contact data from a connected Mailchimp or HubSpot account
 * into the provider-agnostic IntegrationImportRecord staging store. IMPORT-ONLY:
 * the underlying provider services expose reads exclusively, and imported data
 * deliberately does NOT land in the CRM module.
 *
 * Runs are bounded by hard per-type caps so a single call stays inline-safe.
 */
import { integrationConnectionRepository } from '@/lib/db/repository/integration-connection.repository';
import {
    integrationImportRecordRepository,
    type UpsertImportRecordInput,
} from '@/lib/db/repository/integration-import-record.repository';
import { MailchimpService } from '@/lib/services/mailchimp.service';
import { HubspotService } from '@/lib/services/hubspot.service';
import type {
    IntegrationImportProvider,
    IntegrationImportRecordType,
} from '@/lib/db/models/integration-import-record.model';

export interface RunImportParams {
    connectionId: string;
}

export interface RunImportResult {
    provider: IntegrationImportProvider;
    imported: number;
    byType: Record<string, number>;
}

// Hard bounds so an inline run stays cheap.
const MAILCHIMP_MEMBER_CAP = 5000;
const HUBSPOT_CONTACT_CAP = 5000;
const HUBSPOT_COMPANY_CAP = 2000;
const PAGE_SIZE = 100;
const BATCH_SIZE = 500;

/** True when a thrown provider error carries an HTTP 401 (invalid credentials). */
function isUnauthorizedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /\b401\b/.test(message);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Flush a batch of staged records, then clear it in place. */
async function flush(batch: UpsertImportRecordInput[]): Promise<number> {
    if (batch.length === 0) return 0;
    const written = await integrationImportRecordRepository.upsertMany(batch);
    batch.length = 0;
    return written;
}

/**
 * Run a full import for one connection. Loads credentials, dispatches by
 * provider, upserts in batches, and marks the connection used. On HTTP 401 the
 * connection is flagged `expired`; any other failure is rethrown unchanged (an
 * import failure is not a connection failure).
 */
export async function runImport(params: RunImportParams): Promise<RunImportResult> {
    const { connectionId } = params;

    const decrypted = await integrationConnectionRepository.findByIdWithCredentials(
        connectionId
    );
    if (!decrypted) {
        throw new Error('Import: connection not found.');
    }

    const { connection, credentials } = decrypted;
    const provider = connection.provider;
    const brandId = connection.brandId ?? null;

    if (provider !== 'mailchimp' && provider !== 'hubspot') {
        throw new Error(`Import: provider "${provider}" does not support import.`);
    }

    try {
        let result: RunImportResult;
        if (provider === 'mailchimp') {
            result = await importMailchimp(connectionId, brandId, credentials, connection.metadata || {});
        } else {
            result = await importHubspot(connectionId, brandId, credentials);
        }

        await integrationConnectionRepository.markUsed(connectionId);
        return result;
    } catch (error) {
        if (isUnauthorizedError(error)) {
            await integrationConnectionRepository.setStatus(
                connectionId,
                'expired',
                errorMessage(error)
            );
        }
        throw error;
    }
}

/** Merge FNAME/LNAME (Mailchimp) or firstname/lastname into a display name. */
function joinName(first?: unknown, last?: unknown): string | null {
    const parts = [first, last]
        .map((p) => (typeof p === 'string' ? p.trim() : ''))
        .filter(Boolean);
    return parts.length ? parts.join(' ') : null;
}

async function importMailchimp(
    connectionId: string,
    brandId: string | null,
    credentials: { accessToken?: string; apiKey?: string; [key: string]: string | undefined },
    metadata: Record<string, unknown>
): Promise<RunImportResult> {
    const service = new MailchimpService({
        accessToken: credentials.accessToken,
        apiKey: credentials.apiKey,
        apiEndpoint: (metadata.apiEndpoint as string | undefined) || credentials.baseUrl,
        dc: (metadata.dc as string | undefined) || undefined,
    });

    const byType: Record<string, number> = {};
    let imported = 0;
    const batch: UpsertImportRecordInput[] = [];

    // Collect every audience id (paged).
    const audienceIds: string[] = [];
    let listOffset = 0;
    while (true) {
        const page = await service.listAudiences({ count: PAGE_SIZE, offset: listOffset });
        const lists = Array.isArray(page.lists) ? (page.lists as Array<Record<string, unknown>>) : [];
        for (const list of lists) {
            const id = list.id;
            if (typeof id === 'string') audienceIds.push(id);
        }
        if (lists.length < PAGE_SIZE) break;
        listOffset += PAGE_SIZE;
    }

    const recordType: IntegrationImportRecordType = 'audience_member';

    outer: for (const audienceId of audienceIds) {
        let offset = 0;
        while (imported < MAILCHIMP_MEMBER_CAP) {
            const page = await service.listMembers(audienceId, { count: PAGE_SIZE, offset });
            const members = Array.isArray(page.members)
                ? (page.members as Array<Record<string, unknown>>)
                : [];
            if (members.length === 0) break;

            for (const member of members) {
                const externalId = member.id;
                if (typeof externalId !== 'string') continue;

                const mergeFields = (member.merge_fields as Record<string, unknown> | undefined) || {};
                batch.push({
                    brandId,
                    connectionId,
                    provider: 'mailchimp',
                    recordType,
                    externalId,
                    externalListId: audienceId,
                    email: typeof member.email_address === 'string' ? member.email_address : null,
                    name: joinName(mergeFields.FNAME, mergeFields.LNAME),
                    data: member,
                });

                byType[recordType] = (byType[recordType] || 0) + 1;
                imported += 1;

                if (batch.length >= BATCH_SIZE) await flush(batch);
                if (imported >= MAILCHIMP_MEMBER_CAP) {
                    await flush(batch);
                    break outer;
                }
            }

            if (members.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
        }
    }

    await flush(batch);
    return { provider: 'mailchimp', imported, byType };
}

const HUBSPOT_CONTACT_PROPS = ['email', 'firstname', 'lastname'];
const HUBSPOT_COMPANY_PROPS = ['name', 'domain'];

async function importHubspot(
    connectionId: string,
    brandId: string | null,
    credentials: { accessToken?: string; [key: string]: string | undefined }
): Promise<RunImportResult> {
    if (!credentials.accessToken) {
        throw new Error('HubSpot: an accessToken is required.');
    }
    const service = new HubspotService(credentials.accessToken);

    const byType: Record<string, number> = {};
    let imported = 0;
    const batch: UpsertImportRecordInput[] = [];

    // --- Contacts -----------------------------------------------------------
    {
        const recordType: IntegrationImportRecordType = 'contact';
        let after: string | undefined;
        let count = 0;
        while (count < HUBSPOT_CONTACT_CAP) {
            const page = await service.searchContacts({
                limit: PAGE_SIZE,
                after,
                properties: HUBSPOT_CONTACT_PROPS,
            });
            const results = Array.isArray(page.results)
                ? (page.results as Array<Record<string, unknown>>)
                : [];
            if (results.length === 0) break;

            for (const obj of results) {
                const externalId = obj.id;
                if (typeof externalId !== 'string') continue;
                const props = (obj.properties as Record<string, unknown> | undefined) || {};

                batch.push({
                    brandId,
                    connectionId,
                    provider: 'hubspot',
                    recordType,
                    externalId,
                    email: typeof props.email === 'string' ? props.email : null,
                    name: joinName(props.firstname, props.lastname),
                    data: obj,
                });

                byType[recordType] = (byType[recordType] || 0) + 1;
                imported += 1;
                count += 1;

                if (batch.length >= BATCH_SIZE) await flush(batch);
                if (count >= HUBSPOT_CONTACT_CAP) break;
            }

            after = extractAfter(page);
            if (!after) break;
        }
        await flush(batch);
    }

    // --- Companies ----------------------------------------------------------
    {
        const recordType: IntegrationImportRecordType = 'company';
        let after: string | undefined;
        let count = 0;
        while (count < HUBSPOT_COMPANY_CAP) {
            const page = await service.searchCompanies({
                limit: PAGE_SIZE,
                after,
                properties: HUBSPOT_COMPANY_PROPS,
            });
            const results = Array.isArray(page.results)
                ? (page.results as Array<Record<string, unknown>>)
                : [];
            if (results.length === 0) break;

            for (const obj of results) {
                const externalId = obj.id;
                if (typeof externalId !== 'string') continue;
                const props = (obj.properties as Record<string, unknown> | undefined) || {};

                batch.push({
                    brandId,
                    connectionId,
                    provider: 'hubspot',
                    recordType,
                    externalId,
                    email: null,
                    name: typeof props.name === 'string' ? props.name : null,
                    data: obj,
                });

                byType[recordType] = (byType[recordType] || 0) + 1;
                imported += 1;
                count += 1;

                if (batch.length >= BATCH_SIZE) await flush(batch);
                if (count >= HUBSPOT_COMPANY_CAP) break;
            }

            after = extractAfter(page);
            if (!after) break;
        }
        await flush(batch);
    }

    return { provider: 'hubspot', imported, byType };
}

/** Pull the `paging.next.after` cursor from a HubSpot list/search response. */
function extractAfter(page: Record<string, unknown>): string | undefined {
    const paging = page.paging as { next?: { after?: unknown } } | undefined;
    const after = paging?.next?.after;
    return typeof after === 'string' && after ? after : undefined;
}
