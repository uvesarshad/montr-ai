/**
 * Server-side allowlist of ads write operations (guardrail §3.4).
 * Anything not exported from here MUST NOT call a platform write API.
 */
export type { WriteContext } from './types';
export {
    createMetaCampaign,
    createMetaAdSet,
    createMetaAd,
    type MetaCampaignSpec,
    type MetaAdSetSpec,
    type MetaAdSpec,
} from './meta';
export {
    createGoogleCampaign,
    createGoogleAdGroup,
    createGoogleRsa,
    type GoogleCampaignSpec,
    type GoogleAdGroupSpec,
    type GoogleRsaSpec,
} from './google';
