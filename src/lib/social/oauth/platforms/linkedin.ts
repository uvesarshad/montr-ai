/**
 * LinkedIn — OAuth2 (OpenID Connect), body-auth token exchange. Two flows
 * selected by the `type` initiate param (carried through ctx.extra.type):
 *   profile (default) → single SocialAccount from /v2/userinfo
 *   company           → one SocialAccount per administered organization
 *                       (organizationAcls → organizations batch fetch loop)
 * Storage: SocialAccount keyed by user `sub` (profile) or org URN (company).
 * Migrated verbatim from the legacy /api/social/oauth/linkedin routes.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { expiresInToDate } from '../exchange';
import type { SocialOAuthPlatformConfig } from '../types';

const PROFILE_SCOPES = ['openid', 'profile', 'w_member_social'];
const COMPANY_SCOPES = [
    'openid',
    'profile',
    'w_organization_social',
    'r_organization_admin',
    'rw_organization_admin',
];

export const linkedinPlatform: SocialOAuthPlatformConfig = {
    platform: 'linkedin',
    clientIdEnv: 'NEXT_PUBLIC_LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
    scopes: ({ extra }) => (extra.type === 'company' ? COMPANY_SCOPES : PROFILE_SCOPES),
    scopeSeparator: ' ',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    tokenAuthMethod: 'body',
    tokenBodyFormat: 'form',
    passthroughParams: ['type'],

    async persist(tokens, ctx) {
        const authType = ctx.extra.type || 'profile';
        const tokenExpiresAt = expiresInToDate(tokens.expiresIn);
        type CreateInput = Parameters<typeof socialAccountRepository.create>[0];

        if (authType === 'profile') {
            const userResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
                headers: { Authorization: `Bearer ${tokens.accessToken}` },
            });
            if (!userResponse.ok) {
                console.error('LinkedIn user fetch error:', await userResponse.text());
                throw new Error('Failed to fetch user information');
            }

            const userData = (await userResponse.json()) as {
                sub: string;
                name?: string;
                picture?: string;
            };
            const userId = userData.sub;
            const displayName = userData.name;
            const avatarUrl = userData.picture;

            const existingAccount = await socialAccountRepository.findByPlatformAccountId('linkedin', userId);
            if (existingAccount && existingAccount.brandId !== ctx.brandId) {
                throw new Error('This LinkedIn account is already connected to another brand');
            }

            if (existingAccount) {
                await socialAccountRepository.updateTokens(
                    existingAccount._id.toString(),
                    tokens.accessToken,
                    tokens.refreshToken,
                    tokenExpiresAt
                );
            } else {
                await socialAccountRepository.create({
                    brandId: ctx.brandId,
                    platform: 'linkedin',
                    platformAccountId: userId,
                    platformUsername: displayName?.replace(/\s+/g, '').toLowerCase() || userId,
                    platformDisplayName: displayName,
                    avatarUrl,
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    tokenExpiresAt,
                    scopes: ['openid', 'profile', 'w_member_social'],
                } as CreateInput);
            }
        } else if (authType === 'company') {
            const aclResponse = await fetch(
                'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED',
                {
                    headers: {
                        Authorization: `Bearer ${tokens.accessToken}`,
                        'X-RestLi-Protocol-Version': '2.0.0',
                    },
                }
            );

            if (!aclResponse.ok) {
                console.error('LinkedIn ACL fetch error:', await aclResponse.text());
                throw new Error(
                    'Failed to fetch administered organizations. Ensure you have the Community Management API product enabled.'
                );
            }

            const aclData = (await aclResponse.json()) as { elements?: Array<{ organization: string }> };
            const organizations = aclData.elements || [];

            if (organizations.length === 0) {
                throw new Error('You do not administer any LinkedIn Company Pages.');
            }

            const orgUrns = organizations.map((org) => org.organization);
            const orgIds = orgUrns.map((urn: string) => urn.split(':').pop()).join(',');

            const orgDetailsResponse = await fetch(
                `https://api.linkedin.com/v2/organizations?ids=List(${orgIds})`,
                {
                    headers: {
                        Authorization: `Bearer ${tokens.accessToken}`,
                        'X-RestLi-Protocol-Version': '2.0.0',
                    },
                }
            );

            let orgDetails: Record<string, unknown> = {};
            if (orgDetailsResponse.ok) {
                const detailsData = (await orgDetailsResponse.json()) as { results?: Record<string, unknown> };
                orgDetails = detailsData.results || {};
            } else {
                console.error('LinkedIn Org Details fetch error:', await orgDetailsResponse.text());
            }

            for (const orgUrn of orgUrns) {
                const orgId = orgUrn.split(':').pop() as string;
                const details = (orgDetails[orgId] || {}) as Record<string, unknown>;

                const displayName = (details.localizedName as string | undefined) || `Company Page (${orgId})`;
                let avatarUrl: string | undefined = undefined;
                const logoV2 = details.logoV2 as Record<string, unknown> | undefined;
                if (logoV2 && logoV2.original) {
                    avatarUrl = logoV2.original as string;
                }

                const existingAccount = await socialAccountRepository.findByPlatformAccountId('linkedin', orgUrn);

                if (existingAccount && existingAccount.brandId !== ctx.brandId) {
                    console.warn(`Org ${orgUrn} is managed by a different brand.`);
                    continue;
                }

                if (existingAccount) {
                    await socialAccountRepository.updateTokens(
                        existingAccount._id.toString(),
                        tokens.accessToken,
                        tokens.refreshToken,
                        tokenExpiresAt
                    );
                } else {
                    await socialAccountRepository.create({
                        brandId: ctx.brandId,
                        platform: 'linkedin',
                        platformAccountId: orgUrn,
                        platformUsername: displayName.replace(/\s+/g, '').toLowerCase() || orgId,
                        platformDisplayName: displayName,
                        avatarUrl,
                        accessToken: tokens.accessToken,
                        refreshToken: tokens.refreshToken,
                        tokenExpiresAt,
                        scopes: [
                            'openid',
                            'profile',
                            'w_organization_social',
                            'r_organization_admin',
                            'rw_organization_admin',
                        ],
                    } as CreateInput);
                }
            }
        }

        return '/social/oauth-callback?connected=linkedin';
    },
};
