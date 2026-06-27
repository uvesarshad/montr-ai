/**
 * Integration Provider Registry
 *
 * Declarative, client-safe catalog of third-party integration providers.
 * The Connections UI renders cards from this list; the server-side OAuth /
 * API-key plumbing (src/lib/integrations/server/*) keys off the same ids.
 *
 * No secrets and no server-only code here — this file is imported by client
 * components.
 */

export type IntegrationProviderId =
    | 'mailchimp'
    | 'hubspot'
    | 'airtable'
    | 'zoho'
    | 'webflow'
    | 'blogger'
    | 'apollo'
    | 'semrush'
    | 'revenuecat'
    | 'n8n'
    | 'shopify'
    | 'wordpress'
    | 'calendly'
    | 'stripe';

export type IntegrationAuthType = 'oauth2' | 'oauth2_pkce' | 'api_key';

export type IntegrationCategory =
    | 'marketing'
    | 'sales'
    | 'data'
    | 'cms'
    | 'analytics'
    | 'automation'
    | 'ecommerce';

/** Default ownership scope for new connections (user can override at connect time). */
export type IntegrationScope = 'brand' | 'org';

/** Which way data is allowed to flow for this provider (product decision, enforced in services). */
export type IntegrationDataDirection = 'import' | 'export' | 'two_way';

export interface ApiKeyFieldDef {
    /** Key under which the value is stored in the encrypted credentials blob. */
    key: string;
    label: string;
    type: 'text' | 'password' | 'url';
    placeholder?: string;
    required: boolean;
    help?: string;
}

export interface IntegrationRegionDef {
    id: string;
    label: string;
}

/**
 * Free-text per-connection OAuth parameter (e.g. the Shopify shop name).
 * Carried through the OAuth flow in the same slot as a region.
 */
export interface IntegrationTextParamDef {
    label: string;
    placeholder?: string;
    /** Static suffix rendered after the input (e.g. ".myshopify.com"). */
    suffix?: string;
    help?: string;
}

export interface IntegrationProviderDef {
    id: IntegrationProviderId;
    name: string;
    description: string;
    category: IntegrationCategory;
    authType: IntegrationAuthType;
    defaultScope: IntegrationScope;
    dataDirection: IntegrationDataDirection;
    status: 'available' | 'coming_soon';
    /** Provider developer-portal URL where the MontrAI app is registered. */
    appRegistrationUrl?: string;
    docsUrl?: string;
    /** For api_key providers: the fields the connect dialog collects. */
    apiKeyFields?: ApiKeyFieldDef[];
    /** For multi-datacenter providers (Zoho): user must pick a region at connect time. */
    regions?: IntegrationRegionDef[];
    /** For providers needing a free-text connect parameter (Shopify shop name). */
    textParam?: IntegrationTextParamDef;
    /** Informational scope list shown in the UI; the server config owns the real value. */
    oauthScopes?: string[];
}

export const INTEGRATION_CATEGORIES: { id: IntegrationCategory; label: string }[] = [
    { id: 'marketing', label: 'Marketing' },
    { id: 'sales', label: 'Sales' },
    { id: 'ecommerce', label: 'E-commerce' },
    { id: 'data', label: 'Data & Databases' },
    { id: 'cms', label: 'CMS & Publishing' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'automation', label: 'Automation' },
];

export const INTEGRATION_PROVIDERS: IntegrationProviderDef[] = [
    {
        id: 'mailchimp',
        name: 'Mailchimp',
        description: 'Import audiences, members and campaign stats from your Mailchimp account.',
        category: 'marketing',
        authType: 'oauth2',
        defaultScope: 'brand',
        dataDirection: 'import',
        status: 'available',
        appRegistrationUrl: 'https://admin.mailchimp.com/account/oauth2/',
        docsUrl: 'https://mailchimp.com/developer/marketing/',
    },
    {
        id: 'hubspot',
        name: 'HubSpot',
        description: 'Import contacts, companies, deals and lists from your HubSpot portal.',
        category: 'marketing',
        authType: 'oauth2',
        defaultScope: 'org',
        dataDirection: 'import',
        status: 'available',
        appRegistrationUrl: 'https://developers.hubspot.com/',
        docsUrl: 'https://developers.hubspot.com/docs/api/overview',
        oauthScopes: [
            'crm.objects.contacts.read',
            'crm.objects.companies.read',
            'crm.objects.deals.read',
        ],
    },
    {
        id: 'airtable',
        name: 'Airtable',
        description: 'Read and write records in your Airtable bases from workflows.',
        category: 'data',
        authType: 'oauth2_pkce',
        defaultScope: 'org',
        dataDirection: 'two_way',
        status: 'available',
        appRegistrationUrl: 'https://airtable.com/create/oauth',
        docsUrl: 'https://airtable.com/developers/web/api/introduction',
        oauthScopes: ['data.records:read', 'data.records:write', 'schema.bases:read'],
    },
    {
        id: 'zoho',
        name: 'Zoho',
        description: 'Read CRM records and campaign data from Zoho CRM and Zoho Campaigns.',
        category: 'sales',
        authType: 'oauth2',
        defaultScope: 'org',
        dataDirection: 'import',
        status: 'available',
        appRegistrationUrl: 'https://api-console.zoho.com/',
        docsUrl: 'https://www.zoho.com/crm/developer/docs/api/v2/',
        regions: [
            { id: 'com', label: 'United States (.com)' },
            { id: 'eu', label: 'Europe (.eu)' },
            { id: 'in', label: 'India (.in)' },
            { id: 'com.au', label: 'Australia (.com.au)' },
            { id: 'jp', label: 'Japan (.jp)' },
        ],
    },
    {
        id: 'webflow',
        name: 'Webflow',
        description: 'Create and publish CMS items on your Webflow sites.',
        category: 'cms',
        authType: 'oauth2',
        defaultScope: 'brand',
        dataDirection: 'two_way',
        status: 'available',
        appRegistrationUrl: 'https://developers.webflow.com/',
        docsUrl: 'https://developers.webflow.com/data/reference',
        oauthScopes: ['sites:read', 'cms:read', 'cms:write'],
    },
    {
        id: 'blogger',
        name: 'Blogger',
        description: 'Publish and update posts on your Blogger blogs.',
        category: 'cms',
        authType: 'oauth2',
        defaultScope: 'brand',
        dataDirection: 'two_way',
        status: 'available',
        appRegistrationUrl: 'https://console.cloud.google.com/apis/credentials',
        docsUrl: 'https://developers.google.com/blogger/docs/3.0/getting_started',
        oauthScopes: ['https://www.googleapis.com/auth/blogger'],
    },
    {
        id: 'apollo',
        name: 'Apollo.io',
        description: 'Enrich people and companies and search prospects with Apollo.',
        category: 'sales',
        authType: 'api_key',
        defaultScope: 'org',
        dataDirection: 'import',
        status: 'available',
        appRegistrationUrl: 'https://app.apollo.io/#/settings/integrations/api',
        docsUrl: 'https://docs.apollo.io/reference',
        apiKeyFields: [
            {
                key: 'apiKey',
                label: 'API key',
                type: 'password',
                required: true,
                help: 'Apollo → Settings → Integrations → API.',
            },
        ],
    },
    {
        id: 'semrush',
        name: 'Semrush',
        description: 'Pull domain, keyword and backlink reports into SEO workflows.',
        category: 'analytics',
        authType: 'api_key',
        defaultScope: 'org',
        dataDirection: 'import',
        status: 'available',
        appRegistrationUrl: 'https://www.semrush.com/api-analytics/',
        docsUrl: 'https://developer.semrush.com/api/',
        apiKeyFields: [
            {
                key: 'apiKey',
                label: 'API key',
                type: 'password',
                required: true,
                help: 'Requires a Semrush subscription with API units.',
            },
        ],
    },
    {
        id: 'revenuecat',
        name: 'RevenueCat',
        description: 'Receive subscription events and query customer purchase state.',
        category: 'analytics',
        authType: 'api_key',
        defaultScope: 'org',
        dataDirection: 'import',
        status: 'available',
        appRegistrationUrl: 'https://app.revenuecat.com/settings/api-keys',
        docsUrl: 'https://www.revenuecat.com/docs/api-v2',
        apiKeyFields: [
            {
                key: 'apiKey',
                label: 'Secret API key (v2)',
                type: 'password',
                placeholder: 'sk_...',
                required: true,
                help: 'RevenueCat → Project settings → API keys → Secret keys.',
            },
        ],
    },
    {
        id: 'shopify',
        name: 'Shopify',
        description: 'Read products, orders and customers from your Shopify store.',
        category: 'ecommerce',
        authType: 'oauth2',
        defaultScope: 'brand',
        dataDirection: 'import',
        status: 'available',
        appRegistrationUrl: 'https://partners.shopify.com/',
        docsUrl: 'https://shopify.dev/docs/api/admin-graphql',
        textParam: {
            label: 'Store name',
            placeholder: 'my-store',
            suffix: '.myshopify.com',
            help: 'The subdomain of your Shopify admin URL.',
        },
        oauthScopes: ['read_products', 'read_orders', 'read_customers'],
    },
    {
        id: 'wordpress',
        name: 'WordPress (self-hosted)',
        description: 'Publish and update posts on your own WordPress site.',
        category: 'cms',
        authType: 'api_key',
        defaultScope: 'brand',
        dataDirection: 'two_way',
        status: 'available',
        docsUrl: 'https://developer.wordpress.org/rest-api/',
        apiKeyFields: [
            {
                key: 'baseUrl',
                label: 'Site URL',
                type: 'url',
                placeholder: 'https://www.example.com',
                required: true,
                help: 'Your WordPress site address (WP ≥ 5.6).',
            },
            {
                key: 'username',
                label: 'Username',
                type: 'text',
                required: true,
            },
            {
                key: 'appPassword',
                label: 'Application password',
                type: 'password',
                placeholder: 'xxxx xxxx xxxx xxxx xxxx xxxx',
                required: true,
                help: 'WordPress → Users → Profile → Application Passwords.',
            },
        ],
    },
    {
        id: 'n8n',
        name: 'n8n',
        description: 'Trigger and monitor workflows on your own n8n instance.',
        category: 'automation',
        authType: 'api_key',
        defaultScope: 'org',
        dataDirection: 'two_way',
        status: 'available',
        docsUrl: 'https://docs.n8n.io/api/',
        apiKeyFields: [
            {
                key: 'baseUrl',
                label: 'Instance URL',
                type: 'url',
                placeholder: 'https://n8n.example.com',
                required: true,
                help: 'The public base URL of your n8n instance.',
            },
            {
                key: 'apiKey',
                label: 'API key',
                type: 'password',
                required: true,
                help: 'n8n → Settings → n8n API → Create API key.',
            },
        ],
    },
    {
        id: 'calendly',
        name: 'Calendly',
        description: 'Trigger workflows when meetings are booked or canceled (meeting-booked, invitee.canceled).',
        category: 'sales',
        authType: 'api_key',
        defaultScope: 'org',
        dataDirection: 'import',
        status: 'available',
        appRegistrationUrl: 'https://calendly.com/integrations/api_webhooks',
        docsUrl: 'https://developer.calendly.com/api-docs',
        apiKeyFields: [
            {
                key: 'apiKey',
                label: 'Personal access token',
                type: 'password',
                placeholder: 'eyJ...',
                required: true,
                help: 'Calendly → Integrations → API & Webhooks → Generate a personal access token.',
            },
        ],
    },
    {
        id: 'stripe',
        name: 'Stripe',
        description: 'Receive revenue events (payments, invoices, subscriptions) and query customers/payments read-only.',
        category: 'analytics',
        authType: 'api_key',
        defaultScope: 'org',
        dataDirection: 'import',
        status: 'available',
        appRegistrationUrl: 'https://dashboard.stripe.com/apikeys',
        docsUrl: 'https://stripe.com/docs/api',
        apiKeyFields: [
            {
                key: 'apiKey',
                label: 'Secret key',
                type: 'password',
                placeholder: 'sk_live_... or rk_live_...',
                required: true,
                help: 'Stripe → Developers → API keys. A restricted (read-only) key is recommended.',
            },
            {
                key: 'webhookSecret',
                label: 'Webhook signing secret',
                type: 'password',
                placeholder: 'whsec_...',
                required: false,
                help: 'Stripe → Developers → Webhooks → your endpoint → Signing secret. Required to verify inbound events.',
            },
        ],
    },
];

const PROVIDER_MAP = new Map(INTEGRATION_PROVIDERS.map((p) => [p.id, p]));

export function getIntegrationProvider(id: string): IntegrationProviderDef | undefined {
    return PROVIDER_MAP.get(id as IntegrationProviderId);
}

export function isIntegrationProviderId(id: string): id is IntegrationProviderId {
    return PROVIDER_MAP.has(id as IntegrationProviderId);
}
