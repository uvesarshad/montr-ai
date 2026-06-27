'use client';

/**
 * Generic canvas node for the integrations-hub providers (2026-06 expansion).
 *
 * One component serves all 12 providers — the ReactFlow node `type`
 * (e.g. 'mailchimpNode') selects a config block below. Fields persist
 * straight into node.data; execution resolves the connected account
 * server-side via IntegrationConnection (brand → org chain), so no
 * credentials live in the canvas.
 *
 * Canvas node internals intentionally use the shadcn primitives (editor
 * internals are excluded from the ui-kit migration — see CLAUDE.md).
 */

import React, { memo, useEffect, useState } from 'react';
import { Position, NodeProps } from 'reactflow';
import {
    Mail,
    Magnet,
    Table2,
    Briefcase,
    Globe,
    BookOpen,
    Target,
    BarChart3,
    CreditCard,
    Workflow,
    ShoppingBag,
    PenSquare,
    type LucideIcon,
} from 'lucide-react';
import NodeShell from './node-shell';
import NodeHandle from './node-handle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useNodeUtils } from '@/hooks/use-node-utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface FieldDef {
    key: string;
    label: string;
    placeholder?: string;
    textarea?: boolean;
    /** Actions this field applies to; 'all' = always visible. */
    showFor: readonly string[] | 'all';
}

interface ProviderNodeDef {
    title: string;
    icon: LucideIcon;
    defaultAction: string;
    actions: { value: string; label: string }[];
    fields: FieldDef[];
}

const PROVIDER_NODES: Record<string, ProviderNodeDef> = {
    mailchimpNode: {
        title: 'Mailchimp',
        icon: Mail,
        defaultAction: 'list_audiences',
        actions: [
            { value: 'list_audiences', label: 'List audiences' },
            { value: 'get_audience', label: 'Get audience' },
            { value: 'list_members', label: 'List members' },
            { value: 'get_member', label: 'Get member' },
            { value: 'search_members', label: 'Search members' },
            { value: 'list_campaigns', label: 'List campaigns' },
            { value: 'get_campaign_report', label: 'Campaign report' },
        ],
        fields: [
            { key: 'listId', label: 'Audience ID', showFor: ['get_audience', 'list_members', 'get_member'] },
            { key: 'email', label: 'Member email', showFor: ['get_member'] },
            { key: 'query', label: 'Search query', showFor: ['search_members'] },
            { key: 'campaignId', label: 'Campaign ID', showFor: ['get_campaign_report'] },
        ],
    },
    hubspotNode: {
        title: 'HubSpot',
        icon: Magnet,
        defaultAction: 'list_contacts',
        actions: [
            { value: 'list_contacts', label: 'List contacts' },
            { value: 'get_contact', label: 'Get contact' },
            { value: 'search_contacts', label: 'Search contacts' },
            { value: 'get_company', label: 'Get company' },
            { value: 'search_companies', label: 'Search companies' },
            { value: 'get_deal', label: 'Get deal' },
            { value: 'search_deals', label: 'Search deals' },
            { value: 'get_list_members', label: 'List members' },
        ],
        fields: [
            { key: 'objectId', label: 'Record ID', showFor: ['get_contact', 'get_company', 'get_deal'] },
            { key: 'query', label: 'Search query', showFor: ['search_contacts', 'search_companies', 'search_deals'] },
            { key: 'listId', label: 'List ID', showFor: ['get_list_members'] },
        ],
    },
    airtableNode: {
        title: 'Airtable',
        icon: Table2,
        defaultAction: 'list_records',
        actions: [
            { value: 'list_bases', label: 'List bases' },
            { value: 'list_tables', label: 'List tables' },
            { value: 'list_records', label: 'List records' },
            { value: 'get_record', label: 'Get record' },
            { value: 'create_record', label: 'Create record' },
            { value: 'update_record', label: 'Update record' },
            { value: 'delete_record', label: 'Delete record' },
        ],
        fields: [
            { key: 'baseId', label: 'Base ID', placeholder: 'app…', showFor: ['list_tables', 'list_records', 'get_record', 'create_record', 'update_record', 'delete_record'] },
            { key: 'table', label: 'Table', showFor: ['list_records', 'get_record', 'create_record', 'update_record', 'delete_record'] },
            { key: 'recordId', label: 'Record ID', placeholder: 'rec…', showFor: ['get_record', 'update_record', 'delete_record'] },
            { key: 'filterByFormula', label: 'Filter formula', placeholder: "{Status}='Active'", showFor: ['list_records'] },
            { key: 'fields', label: 'Fields (JSON)', textarea: true, placeholder: '{"Name": "…"}', showFor: ['create_record', 'update_record'] },
        ],
    },
    zohoNode: {
        title: 'Zoho',
        icon: Briefcase,
        defaultAction: 'get_records',
        actions: [
            { value: 'get_records', label: 'Get CRM records' },
            { value: 'get_record', label: 'Get CRM record' },
            { value: 'search_records', label: 'Search CRM records' },
            { value: 'list_mailing_lists', label: 'List mailing lists' },
            { value: 'list_campaigns', label: 'List campaigns' },
        ],
        fields: [
            { key: 'module', label: 'Module', placeholder: 'Leads | Contacts | Deals | Accounts', showFor: ['get_records', 'get_record', 'search_records'] },
            { key: 'recordId', label: 'Record ID', showFor: ['get_record'] },
            { key: 'word', label: 'Search term', showFor: ['search_records'] },
        ],
    },
    webflowNode: {
        title: 'Webflow',
        icon: Globe,
        defaultAction: 'list_sites',
        actions: [
            { value: 'list_sites', label: 'List sites' },
            { value: 'list_collections', label: 'List collections' },
            { value: 'list_items', label: 'List items' },
            { value: 'get_item', label: 'Get item' },
            { value: 'create_item', label: 'Create item' },
            { value: 'update_item', label: 'Update item' },
            { value: 'publish_items', label: 'Publish items' },
        ],
        fields: [
            { key: 'siteId', label: 'Site ID', showFor: ['list_collections'] },
            { key: 'collectionId', label: 'Collection ID', showFor: ['list_items', 'get_item', 'create_item', 'update_item', 'publish_items'] },
            { key: 'itemId', label: 'Item ID', showFor: ['get_item', 'update_item', 'publish_items'] },
            { key: 'fieldData', label: 'Field data (JSON)', textarea: true, placeholder: '{"name": "…", "slug": "…"}', showFor: ['create_item', 'update_item'] },
        ],
    },
    bloggerNode: {
        title: 'Blogger',
        icon: BookOpen,
        defaultAction: 'list_blogs',
        actions: [
            { value: 'list_blogs', label: 'List blogs' },
            { value: 'list_posts', label: 'List posts' },
            { value: 'get_post', label: 'Get post' },
            { value: 'create_post', label: 'Create post' },
            { value: 'update_post', label: 'Update post' },
            { value: 'publish_post', label: 'Publish post' },
        ],
        fields: [
            { key: 'blogId', label: 'Blog ID', showFor: ['list_posts', 'get_post', 'create_post', 'update_post', 'publish_post'] },
            { key: 'postId', label: 'Post ID', showFor: ['get_post', 'update_post', 'publish_post'] },
            { key: 'title', label: 'Title', showFor: ['create_post', 'update_post'] },
            { key: 'content', label: 'Content (HTML)', textarea: true, showFor: ['create_post', 'update_post'] },
        ],
    },
    wordpressNode: {
        title: 'WordPress',
        icon: PenSquare,
        defaultAction: 'list_posts',
        actions: [
            { value: 'list_posts', label: 'List posts' },
            { value: 'get_post', label: 'Get post' },
            { value: 'create_post', label: 'Create post' },
            { value: 'update_post', label: 'Update post' },
            { value: 'list_categories', label: 'List categories' },
            { value: 'list_tags', label: 'List tags' },
        ],
        fields: [
            { key: 'postId', label: 'Post ID', showFor: ['get_post', 'update_post'] },
            { key: 'title', label: 'Title', showFor: ['create_post', 'update_post'] },
            { key: 'content', label: 'Content (HTML)', textarea: true, showFor: ['create_post', 'update_post'] },
            { key: 'status', label: 'Status', placeholder: 'draft | publish', showFor: ['create_post', 'update_post'] },
        ],
    },
    apolloNode: {
        title: 'Apollo.io',
        icon: Target,
        defaultAction: 'enrich_person',
        actions: [
            { value: 'enrich_person', label: 'Enrich person' },
            { value: 'search_people', label: 'Search people' },
            { value: 'enrich_organization', label: 'Enrich organization' },
        ],
        fields: [
            { key: 'email', label: 'Email', showFor: ['enrich_person'] },
            { key: 'domain', label: 'Company domain', showFor: ['enrich_person', 'enrich_organization'] },
            { key: 'q_keywords', label: 'Keywords', showFor: ['search_people'] },
        ],
    },
    semrushNode: {
        title: 'Semrush',
        icon: BarChart3,
        defaultAction: 'domain_overview',
        actions: [
            { value: 'domain_overview', label: 'Domain overview' },
            { value: 'keyword_overview', label: 'Keyword overview' },
            { value: 'backlinks_summary', label: 'Backlinks summary' },
        ],
        fields: [
            { key: 'domain', label: 'Domain', placeholder: 'example.com', showFor: ['domain_overview'] },
            { key: 'phrase', label: 'Keyword', showFor: ['keyword_overview'] },
            { key: 'target', label: 'Target domain', placeholder: 'example.com', showFor: ['backlinks_summary'] },
            { key: 'database', label: 'Database', placeholder: 'us', showFor: ['domain_overview', 'keyword_overview'] },
        ],
    },
    revenuecatNode: {
        title: 'RevenueCat',
        icon: CreditCard,
        defaultAction: 'list_projects',
        actions: [
            { value: 'list_projects', label: 'List projects' },
            { value: 'get_customer', label: 'Get customer' },
            { value: 'get_customer_subscriptions', label: 'Customer subscriptions' },
            { value: 'get_customer_purchases', label: 'Customer purchases' },
            { value: 'list_entitlements', label: 'List entitlements' },
        ],
        fields: [
            { key: 'projectId', label: 'Project ID', showFor: ['get_customer', 'get_customer_subscriptions', 'get_customer_purchases', 'list_entitlements'] },
            { key: 'customerId', label: 'Customer ID', showFor: ['get_customer', 'get_customer_subscriptions', 'get_customer_purchases'] },
        ],
    },
    n8nNode: {
        title: 'n8n',
        icon: Workflow,
        defaultAction: 'list_workflows',
        actions: [
            { value: 'list_workflows', label: 'List workflows' },
            { value: 'get_workflow', label: 'Get workflow' },
            { value: 'activate_workflow', label: 'Activate workflow' },
            { value: 'deactivate_workflow', label: 'Deactivate workflow' },
            { value: 'list_executions', label: 'List executions' },
            { value: 'get_execution', label: 'Get execution' },
            { value: 'trigger_webhook', label: 'Trigger webhook' },
        ],
        fields: [
            { key: 'workflowId', label: 'Workflow ID', showFor: ['get_workflow', 'activate_workflow', 'deactivate_workflow', 'list_executions'] },
            { key: 'executionId', label: 'Execution ID', showFor: ['get_execution'] },
            { key: 'webhookPath', label: 'Webhook path', placeholder: 'my-webhook', showFor: ['trigger_webhook'] },
            { key: 'payload', label: 'Payload (JSON)', textarea: true, showFor: ['trigger_webhook'] },
        ],
    },
    shopifyNode: {
        title: 'Shopify',
        icon: ShoppingBag,
        defaultAction: 'list_products',
        actions: [
            { value: 'get_shop', label: 'Get shop' },
            { value: 'list_products', label: 'List products' },
            { value: 'get_product', label: 'Get product' },
            { value: 'search_products', label: 'Search products' },
            { value: 'list_orders', label: 'List orders' },
            { value: 'get_order', label: 'Get order' },
            { value: 'list_customers', label: 'List customers' },
            { value: 'search_customers', label: 'Search customers' },
        ],
        fields: [
            { key: 'id', label: 'Resource ID', showFor: ['get_product', 'get_order', 'get_customer'] },
            { key: 'query', label: 'Search query', showFor: ['search_products', 'search_customers'] },
        ],
    },
    stripeNode: {
        title: 'Stripe',
        icon: CreditCard,
        defaultAction: 'get_customer',
        actions: [
            { value: 'get_customer', label: 'Get customer (by email)' },
            { value: 'list_recent_payments', label: 'List recent payments' },
            { value: 'get_subscription_status', label: 'Subscription status (by email)' },
        ],
        fields: [
            { key: 'email', label: 'Customer email', showFor: ['get_customer', 'get_subscription_status'] },
            { key: 'limit', label: 'Limit', placeholder: '10', showFor: ['list_recent_payments'] },
        ],
    },
};

type NodeData = Record<string, unknown>;

/** Node type → provider id (the registry/server key). */
const NODE_TYPE_TO_PROVIDER: Record<string, string> = Object.fromEntries(
    Object.keys(PROVIDER_NODES).map((nodeType) => [nodeType, nodeType.replace(/Node$/, '')])
);

interface ConnectionOption {
    _id: string;
    provider: string;
    externalAccountName?: string;
    brandId?: string | null;
}

// Fetched once per canvas session and shared across all integration nodes.
let connectionsCache: ConnectionOption[] | null = null;
let connectionsPromise: Promise<ConnectionOption[]> | null = null;

async function fetchConnections(): Promise<ConnectionOption[]> {
    if (connectionsCache) return connectionsCache;
    if (!connectionsPromise) {
        connectionsPromise = fetch('/api/v2/integrations')
            .then(async (response) => {
                if (!response.ok) return [];
                const data = await response.json();
                connectionsCache = (data.connections || []) as ConnectionOption[];
                return connectionsCache;
            })
            .catch(() => [] as ConnectionOption[]);
    }
    return connectionsPromise;
}

function IntegrationHubNode({ id, type, data, isConnectable, selected }: NodeProps<NodeData>) {
    const { updateNodeData, deleteNode } = useNodeUtils(id);
    const [connections, setConnections] = useState<ConnectionOption[]>([]);

    const providerId = NODE_TYPE_TO_PROVIDER[type];
    useEffect(() => {
        let cancelled = false;
        fetchConnections().then((all) => {
            if (cancelled) return;
            setConnections(all.filter((c) => c.provider === providerId));
        });
        return () => {
            cancelled = true;
        };
    }, [providerId]);

    const def = PROVIDER_NODES[type];
    if (!def) return null;

    const action = (typeof data.action === 'string' && data.action) || def.defaultAction;
    const visibleFields = def.fields.filter(
        (f) => f.showFor === 'all' || f.showFor.includes(action)
    );
    const Icon = def.icon;

    return (
        <NodeShell
            id={id}
            nodeType={type}
            selected={selected}
            onDelete={deleteNode}
            hasAdvanced={true}
            minWidth={300}
            contentClassName="p-4 relative"
            title={def.title}
            icon={<Icon className="h-full w-full p-0.5" />}
        >
            <NodeHandle type="target" position={Position.Left} nodeType={type} isConnectable={isConnectable} />

            <div className="nodrag space-y-4">
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Action</Label>
                    <Select value={action} onValueChange={(v) => updateNodeData({ action: v })}>
                        <SelectTrigger className="h-8 text-xs rounded-xl">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {def.actions.map((a) => (
                                <SelectItem key={a.value} value={a.value}>
                                    {a.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {visibleFields.map((field) =>
                    field.textarea ? (
                        <div key={field.key} className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">{field.label}</Label>
                            <Textarea
                                value={(data[field.key] as string) || ''}
                                onChange={(e) => updateNodeData({ [field.key]: e.target.value })}
                                placeholder={field.placeholder}
                                className="min-h-[50px] text-xs resize-none rounded-xl"
                                rows={3}
                            />
                        </div>
                    ) : (
                        <div key={field.key} className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">{field.label}</Label>
                            <Input
                                value={(data[field.key] as string) || ''}
                                onChange={(e) => updateNodeData({ [field.key]: e.target.value })}
                                placeholder={field.placeholder}
                                className="h-8 text-xs rounded-xl"
                            />
                        </div>
                    )
                )}

                {connections.length > 1 ? (
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Account</Label>
                        <Select
                            value={(data.connectionId as string) || 'auto'}
                            onValueChange={(v) =>
                                updateNodeData({ connectionId: v === 'auto' ? undefined : v })
                            }
                        >
                            <SelectTrigger className="h-8 text-xs rounded-xl">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto">Auto (brand → organization)</SelectItem>
                                {connections.map((c) => (
                                    <SelectItem key={c._id} value={c._id}>
                                        {c.externalAccountName || c._id}
                                        {c.brandId ? ' · brand-pinned' : ' · all brands'}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ) : null}

                <p className="text-[10px] leading-snug text-muted-foreground">
                    {connections.length === 0
                        ? `Connect ${def.title} in Settings → Connections → Apps first.`
                        : `Uses the ${def.title} account connected in Settings → Connections → Apps.`}
                </p>
            </div>

            <NodeHandle type="source" position={Position.Right} nodeType={type} isConnectable={isConnectable} />
        </NodeShell>
    );
}

export default memo(IntegrationHubNode);
export const INTEGRATION_HUB_NODE_TYPES = Object.keys(PROVIDER_NODES);
