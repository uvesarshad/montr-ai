'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Megaphone, PauseCircle, Sparkles } from 'lucide-react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import {
    Banner,
    Button,
    Card,
    Chip,
    EmptyState,
    Field,
    Input,
    PageHeader,
    Select,
    Spinner,
    Stepper,
    Textarea,
} from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { PLATFORM_LABELS, fetchAdAccounts, fmtMoney, type AdAccountDto, type AdsPlatform } from './ads-data';
import { AdImagePickerDialog } from './ad-image-picker-dialog';

const STEPS = ['Account', 'Campaign', 'Targeting', 'Budget', 'Ad', 'Review'];

const META_OBJECTIVES = [
    { value: 'OUTCOME_TRAFFIC', label: 'Traffic — send people to a destination' },
    { value: 'OUTCOME_LEADS', label: 'Leads — collect leads for your business' },
    { value: 'OUTCOME_AWARENESS', label: 'Awareness — reach a broad audience' },
];

interface FacebookPage {
    _id: string;
    platform: string;
    platformAccountId: string;
    platformUsername: string;
    platformDisplayName?: string;
}

interface WizardState {
    accountId: string;
    campaignName: string;
    objective: string;          // meta
    countries: string;          // meta — comma-separated ISO codes
    ageMin: string;             // meta
    ageMax: string;             // meta
    keywords: string;           // google — one per line
    dailyBudget: string;
    // meta ad
    pageId: string;
    primaryText: string;
    headline: string;
    description: string;
    linkUrl: string;
    imageUrl: string;
    // google ad
    finalUrl: string;
    headlines: string;          // one per line
    descriptions: string;       // one per line
}

const INITIAL_STATE: WizardState = {
    accountId: '',
    campaignName: '',
    objective: 'OUTCOME_TRAFFIC',
    countries: 'US',
    ageMin: '18',
    ageMax: '65',
    keywords: '',
    dailyBudget: '20',
    pageId: '',
    primaryText: '',
    headline: '',
    description: '',
    linkUrl: '',
    imageUrl: '',
    finalUrl: '',
    headlines: '',
    descriptions: '',
};

interface CreationResult {
    status: 'created' | 'partial';
    platform: AdsPlatform;
    entities: Record<string, string>;
    failedStep?: string;
    error?: string;
}

function splitLines(value: string): string[] {
    return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function splitCountries(value: string): string[] {
    return value.split(/[,\s]+/).map((code) => code.trim().toUpperCase()).filter((code) => code.length === 2);
}

export function AdsCampaignWizard() {
    const { currentBrandId } = useCurrentBrand();
    const { toast } = useToast();

    const [accounts, setAccounts] = useState<AdAccountDto[]>([]);
    const [pages, setPages] = useState<FacebookPage[]>([]);
    const [loadingAccounts, setLoadingAccounts] = useState(true);
    const [step, setStep] = useState(0);
    const [form, setForm] = useState<WizardState>(INITIAL_STATE);
    const [creating, setCreating] = useState(false);
    const [result, setResult] = useState<CreationResult | null>(null);

    // AI copy assist
    const [aiProduct, setAiProduct] = useState('');
    const [aiBusy, setAiBusy] = useState(false);
    const [imageBusy, setImageBusy] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);

    const account = useMemo(
        () => accounts.find((candidate) => candidate._id === form.accountId),
        [accounts, form.accountId],
    );
    const platform: AdsPlatform | null = account?.platform ?? null;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingAccounts(true);
            try {
                const data = await fetchAdAccounts(currentBrandId);
                if (!cancelled) setAccounts(data?.accounts.filter((candidate) => candidate.isActive) || []);
            } finally {
                if (!cancelled) setLoadingAccounts(false);
            }
        })();
        return () => { cancelled = true; };
    }, [currentBrandId]);

    // Facebook pages for the Meta ad creative
    useEffect(() => {
        if (!currentBrandId) return;
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch(`/api/social/brands/${currentBrandId}/accounts`);
                if (!response.ok) return;
                const data = await response.json();
                if (!cancelled) {
                    setPages((data.accounts || []).filter((candidate: FacebookPage) => candidate.platform === 'facebook'));
                }
            } catch {
                /* page picker stays empty; user can paste an ID-less spec is rejected at review */
            }
        })();
        return () => { cancelled = true; };
    }, [currentBrandId]);

    const set = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
        setForm((previous) => ({ ...previous, [key]: value }));
    }, []);

    /* ── per-step validation (server-side Zod remains the authority) ──── */
    const stepError = useMemo<string | null>(() => {
        switch (step) {
            case 0:
                return form.accountId ? null : 'Pick the ad account to create the campaign in.';
            case 1:
                return form.campaignName.trim() ? null : 'Give the campaign a name.';
            case 2:
                if (platform === 'meta_ads') {
                    return splitCountries(form.countries).length > 0 ? null : 'Enter at least one 2-letter country code (e.g. US, GB).';
                }
                return splitLines(form.keywords).length > 0 ? null : 'Enter at least one keyword (one per line).';
            case 3: {
                const budget = parseFloat(form.dailyBudget);
                return Number.isFinite(budget) && budget > 0 ? null : 'Enter a positive daily budget.';
            }
            case 4:
                if (platform === 'meta_ads') {
                    if (!form.pageId) return 'Select the Facebook Page the ad runs under.';
                    if (!form.primaryText.trim()) return 'Write (or generate) the primary text.';
                    if (!/^https?:\/\//.test(form.linkUrl)) return 'Enter a valid destination URL (https://…).';
                    return null;
                }
                if (!/^https?:\/\//.test(form.finalUrl)) return 'Enter a valid final URL (https://…).';
                if (splitLines(form.headlines).length < 3) return 'Google needs at least 3 headlines (≤30 chars each).';
                if (splitLines(form.headlines).some((line) => line.length > 30)) return 'One of the headlines exceeds 30 characters.';
                if (splitLines(form.descriptions).length < 2) return 'Google needs at least 2 descriptions (≤90 chars each).';
                if (splitLines(form.descriptions).some((line) => line.length > 90)) return 'One of the descriptions exceeds 90 characters.';
                return null;
            default:
                return null;
        }
    }, [step, form, platform]);

    /* ── AI copy assist ────────────────────────────────────────────────── */
    const handleGenerateCopy = useCallback(async () => {
        if (!platform || !aiProduct.trim()) {
            toast({ variant: 'destructive', title: 'Describe what you are advertising first' });
            return;
        }
        setAiBusy(true);
        try {
            const response = await fetch('/api/v2/ads/generate-copy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform,
                    product: aiProduct,
                    brandId: currentBrandId || undefined,
                    variants: 1,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Generation failed');

            if (platform === 'meta_ads' && data.meta?.variants?.[0]) {
                const variant = data.meta.variants[0];
                setForm((previous) => ({
                    ...previous,
                    primaryText: variant.primaryText,
                    headline: variant.headline,
                    description: variant.description,
                }));
            } else if (platform === 'google_ads' && data.google) {
                setForm((previous) => ({
                    ...previous,
                    headlines: data.google.headlines.join('\n'),
                    descriptions: data.google.descriptions.join('\n'),
                }));
            }
            toast({ title: 'Copy generated', description: 'Review and edit before continuing.' });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Generation failed';
            toast({ variant: 'destructive', title: 'Could not generate copy', description: message });
        } finally {
            setAiBusy(false);
        }
    }, [platform, aiProduct, currentBrandId, toast]);

    const handleGenerateImage = useCallback(async () => {
        if (!aiProduct.trim()) {
            toast({ variant: 'destructive', title: 'Describe what you are advertising first', description: 'Fill the AI prompt box above — the image is generated from it.' });
            return;
        }
        setImageBusy(true);
        try {
            const response = await fetch('/api/v2/ads/generate-creative', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: aiProduct, preset: 'landscape', brandId: currentBrandId || undefined }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Generation failed');
            set('imageUrl', data.imageUrl);
            toast({
                title: 'Image generated',
                description: data.savedToLibrary
                    ? 'Saved to the brand media library — reusable from "Choose from library".'
                    : 'The URL stays valid long enough to create the campaign — the platform caches the image.',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Generation failed';
            toast({ variant: 'destructive', title: 'Could not generate image', description: message });
        } finally {
            setImageBusy(false);
        }
    }, [aiProduct, currentBrandId, set, toast]);

    /* ── create ────────────────────────────────────────────────────────── */
    const handleCreate = useCallback(async () => {
        if (!platform || !account) return;
        setCreating(true);
        try {
            const dailyBudget = parseFloat(form.dailyBudget);
            const spec = platform === 'meta_ads'
                ? {
                    platform,
                    adAccountId: account._id,
                    campaign: { name: form.campaignName.trim(), objective: form.objective },
                    adset: {
                        name: `${form.campaignName.trim()} — ad set`,
                        dailyBudget,
                        countries: splitCountries(form.countries),
                        ageMin: parseInt(form.ageMin, 10) || undefined,
                        ageMax: parseInt(form.ageMax, 10) || undefined,
                    },
                    ad: {
                        name: `${form.campaignName.trim()} — ad`,
                        pageId: form.pageId,
                        primaryText: form.primaryText.trim(),
                        headline: form.headline.trim() || undefined,
                        description: form.description.trim() || undefined,
                        linkUrl: form.linkUrl.trim(),
                        imageUrl: form.imageUrl.trim() || undefined,
                    },
                }
                : {
                    platform,
                    adAccountId: account._id,
                    campaign: { name: form.campaignName.trim(), dailyBudget },
                    adGroup: {
                        name: `${form.campaignName.trim()} — ad group`,
                        keywords: splitLines(form.keywords),
                    },
                    rsa: {
                        headlines: splitLines(form.headlines),
                        descriptions: splitLines(form.descriptions),
                        finalUrl: form.finalUrl.trim(),
                    },
                };

            const response = await fetch('/api/v2/ads/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(spec),
            });
            const data = await response.json();
            if (!response.ok && !data.status) throw new Error(data.error || 'Creation failed');
            setResult(data);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Creation failed';
            toast({ variant: 'destructive', title: 'Campaign creation failed', description: message });
        } finally {
            setCreating(false);
        }
    }, [platform, account, form, toast]);

    /* ── result screens ───────────────────────────────────────────────── */
    if (result) {
        return (
            <div className="mx-auto max-w-3xl space-y-6 p-6">
                {result.status === 'created' ? (
                    <Card bodyClassName="p-8 text-center">
                        <CheckCircle2 className="mx-auto size-12 text-success" />
                        <h2 className="mt-3 text-lg font-semibold">Campaign created — paused</h2>
                        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                            “{form.campaignName}” was created in {PLATFORM_LABELS[result.platform]} with everything
                            set to <strong>paused</strong>. Review it in {result.platform === 'meta_ads' ? 'Meta Ads Manager' : 'Google Ads'} and
                            activate it there when you&apos;re ready — MontrAI never activates or edits live campaigns.
                        </p>
                        <div className="mt-5 flex justify-center gap-2">
                            <Button variant="outline" asChild>
                                <Link href="/ads/campaigns">Back to campaigns</Link>
                            </Button>
                            <Button variant="brand" onClick={() => { setResult(null); setForm(INITIAL_STATE); setStep(0); }}>
                                Create another
                            </Button>
                        </div>
                    </Card>
                ) : (
                    <Card bodyClassName="p-6">
                        <Banner tone="danger" title={`Creation stopped at the ${result.failedStep} step`}>
                            {result.error}
                        </Banner>
                        {Object.keys(result.entities).length > 0 && (
                            <div className="mt-4 text-sm">
                                <p className="font-medium">Already created (all paused):</p>
                                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                                    {Object.entries(result.entities).map(([key, value]) => (
                                        <li key={key}>{key}: <code className="rounded bg-muted px-1">{value}</code></li>
                                    ))}
                                </ul>
                                <p className="mt-2 text-muted-foreground">
                                    You can finish or remove these in the native platform UI — MontrAI is create-only and never deletes.
                                </p>
                            </div>
                        )}
                        <div className="mt-5 flex gap-2">
                            <Button variant="outline" onClick={() => setResult(null)}>Back to wizard</Button>
                            <Button variant="brand" asChild>
                                <Link href="/ads/campaigns">Go to campaigns</Link>
                            </Button>
                        </div>
                    </Card>
                )}
            </div>
        );
    }

    /* ── wizard ───────────────────────────────────────────────────────── */
    const charCount = (value: string, max: number) => (
        <span className={value.length > max ? 'text-danger' : 'text-muted-foreground'}>
            {value.length}/{max}
        </span>
    );

    const wizardCancelAction = (
        <Button variant="ghost" size="sm" asChild>
            <Link href="/ads/campaigns">Cancel</Link>
        </Button>
    );

    const generateCopyAction = (
        <Button size="sm" variant="brand" icon={aiBusy ? undefined : Sparkles} disabled={aiBusy} onClick={handleGenerateCopy}>
            {aiBusy ? <Spinner size={14} /> : null}
            Generate
        </Button>
    );

    return (
        <div className="mx-auto max-w-3xl space-y-6 p-6">
            <PageHeader
                icon={Megaphone}
                title="New Campaign"
                sub="Guided setup — the campaign is created paused; you activate it in the platform when ready"
                actions={wizardCancelAction}
            />

            <Stepper steps={STEPS} current={step} />

            {/* Step 0 — account */}
            {step === 0 && (
                <Card title="Where should this campaign live?">
                    {loadingAccounts ? (
                        <div className="flex justify-center py-8"><Spinner size={24} /></div>
                    ) : accounts.length === 0 ? (
                        <EmptyState
                            icon={Megaphone}
                            title="No ad accounts connected"
                            note="Connect Google Ads or Meta Ads first."
                            cta={<Button variant="brand" asChild><Link href="/ads/accounts">Connect an account</Link></Button>}
                        />
                    ) : (
                        <div className="space-y-2">
                            {accounts.map((candidate) => (
                                <button
                                    key={candidate._id}
                                    type="button"
                                    onClick={() => set('accountId', candidate._id)}
                                    className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition
                                        ${form.accountId === candidate._id ? 'border-brand bg-brand-muted/30' : 'border-border hover:bg-muted/40'}`}
                                >
                                    <div className="min-w-0">
                                        <span className="block truncate text-sm font-medium">{candidate.accountName}</span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {candidate.externalAccountId}{candidate.currencyCode ? ` · ${candidate.currencyCode}` : ''}
                                        </span>
                                    </div>
                                    <Chip tone={candidate.platform === 'meta_ads' ? 'info' : 'purple'}>
                                        {PLATFORM_LABELS[candidate.platform]}
                                    </Chip>
                                </button>
                            ))}
                        </div>
                    )}
                </Card>
            )}

            {/* Step 1 — campaign */}
            {step === 1 && (
                <Card title="Campaign basics">
                    <div className="space-y-4">
                        <Field label="Campaign name">
                            <Input
                                value={form.campaignName}
                                onChange={(event) => set('campaignName', event.target.value)}
                                placeholder="e.g. Spring promo — website traffic"
                                maxLength={120}
                            />
                        </Field>
                        {platform === 'meta_ads' && (
                            <Field label="Objective">
                                <Select
                                    value={form.objective}
                                    onChange={(value) => set('objective', value)}
                                    options={META_OBJECTIVES}
                                />
                            </Field>
                        )}
                        {platform === 'google_ads' && (
                            <p className="text-sm text-muted-foreground">
                                Google campaigns are created as <strong>Search</strong> campaigns with Maximize-clicks bidding.
                            </p>
                        )}
                    </div>
                </Card>
            )}

            {/* Step 2 — targeting */}
            {step === 2 && platform === 'meta_ads' && (
                <Card title="Audience targeting">
                    <div className="space-y-4">
                        <Field label="Countries" hint="2-letter ISO codes, comma-separated (e.g. US, GB, DE)">
                            <Input value={form.countries} onChange={(event) => set('countries', event.target.value)} />
                        </Field>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Minimum age">
                                <Input type="number" min={18} max={65} value={form.ageMin} onChange={(event) => set('ageMin', event.target.value)} />
                            </Field>
                            <Field label="Maximum age">
                                <Input type="number" min={18} max={65} value={form.ageMax} onChange={(event) => set('ageMax', event.target.value)} />
                            </Field>
                        </div>
                    </div>
                </Card>
            )}
            {step === 2 && platform === 'google_ads' && (
                <Card title="Search keywords">
                    <Field label="Keywords" hint="One per line — added as broad match. Refine match types later in Google Ads.">
                        <Textarea
                            value={form.keywords}
                            onChange={(event) => set('keywords', event.target.value)}
                            rows={8}
                            placeholder={'project management software\nteam task tracker'}
                        />
                    </Field>
                </Card>
            )}

            {/* Step 3 — budget */}
            {step === 3 && (
                <Card title="Daily budget">
                    <div className="space-y-3">
                        <Field label={`Daily budget${account?.currencyCode ? ` (${account.currencyCode})` : ''}`}>
                            <Input
                                type="number"
                                min={1}
                                step="0.01"
                                value={form.dailyBudget}
                                onChange={(event) => set('dailyBudget', event.target.value)}
                            />
                        </Field>
                        <p className="text-sm text-muted-foreground">
                            Nothing spends until you activate the campaign — it is created paused.
                        </p>
                    </div>
                </Card>
            )}

            {/* Step 4 — ad content */}
            {step === 4 && (
                <div className="space-y-4">
                    <Card
                        title="Generate copy with AI"
                        icon={Sparkles}
                        action={generateCopyAction}
                    >
                        <Field label="What are you advertising?" hint="Product, offer, or landing page summary — brand voice is applied automatically.">
                            <Textarea
                                value={aiProduct}
                                onChange={(event) => setAiProduct(event.target.value)}
                                rows={2}
                                placeholder="e.g. MontrAI — an all-in-one AI marketing platform for small agencies"
                            />
                        </Field>
                    </Card>

                    {platform === 'meta_ads' ? (
                        <Card title="Ad creative">
                            <div className="space-y-4">
                                <Field label="Facebook Page" hint="The Page the ad is published under.">
                                    {pages.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                            No Facebook Page connected — connect one in <Link href="/settings?tab=connections" className="text-brand-strong hover:underline">Settings → Connections</Link>.
                                        </p>
                                    ) : (
                                        <Select
                                            value={form.pageId}
                                            onChange={(value) => set('pageId', value)}
                                            options={pages.map((page) => ({
                                                value: page.platformAccountId,
                                                label: page.platformDisplayName || page.platformUsername,
                                            }))}
                                            placeholder="Select a Page…"
                                        />
                                    )}
                                </Field>
                                <Field label={<span className="flex w-full justify-between">Primary text {charCount(form.primaryText, 300)}</span>}>
                                    <Textarea value={form.primaryText} onChange={(event) => set('primaryText', event.target.value)} rows={4} />
                                </Field>
                                <div className="grid grid-cols-2 gap-4">
                                    <Field label={<span className="flex w-full justify-between">Headline {charCount(form.headline, 40)}</span>}>
                                        <Input value={form.headline} onChange={(event) => set('headline', event.target.value)} />
                                    </Field>
                                    <Field label={<span className="flex w-full justify-between">Description {charCount(form.description, 30)}</span>}>
                                        <Input value={form.description} onChange={(event) => set('description', event.target.value)} />
                                    </Field>
                                </div>
                                <Field label="Destination URL">
                                    <Input value={form.linkUrl} onChange={(event) => set('linkUrl', event.target.value)} placeholder="https://…" />
                                </Field>
                                <Field label="Image URL (optional)" hint="Public image URL for the ad creative — generate one, or pick from the brand library.">
                                    <div className="flex gap-2">
                                        <Input
                                            value={form.imageUrl}
                                            onChange={(event) => set('imageUrl', event.target.value)}
                                            placeholder="https://…"
                                            wrapClassName="flex-1"
                                        />
                                        <Button
                                            variant="outline"
                                            icon={imageBusy ? undefined : Sparkles}
                                            disabled={imageBusy}
                                            onClick={handleGenerateImage}
                                        >
                                            {imageBusy ? <Spinner size={14} /> : null}
                                            Generate
                                        </Button>
                                        <Button variant="outline" onClick={() => setPickerOpen(true)}>
                                            Library
                                        </Button>
                                    </div>
                                </Field>
                                <AdImagePickerDialog
                                    open={pickerOpen}
                                    onOpenChange={setPickerOpen}
                                    brandId={currentBrandId}
                                    onSelect={(url) => set('imageUrl', url)}
                                />
                                {form.imageUrl && (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={form.imageUrl} alt="Ad creative preview" className="max-h-44 rounded-lg border border-border object-cover" />
                                )}
                            </div>
                        </Card>
                    ) : (
                        <Card title="Responsive Search Ad">
                            <div className="space-y-4">
                                <Field label="Final URL">
                                    <Input value={form.finalUrl} onChange={(event) => set('finalUrl', event.target.value)} placeholder="https://…" />
                                </Field>
                                <Field
                                    label={`Headlines (${splitLines(form.headlines).length}/15)`}
                                    hint="One per line, max 30 characters each, at least 3."
                                >
                                    <Textarea value={form.headlines} onChange={(event) => set('headlines', event.target.value)} rows={6} />
                                </Field>
                                <Field
                                    label={`Descriptions (${splitLines(form.descriptions).length}/4)`}
                                    hint="One per line, max 90 characters each, at least 2."
                                >
                                    <Textarea value={form.descriptions} onChange={(event) => set('descriptions', event.target.value)} rows={4} />
                                </Field>
                            </div>
                        </Card>
                    )}
                </div>
            )}

            {/* Step 5 — review */}
            {step === 5 && platform && account && (
                <div className="space-y-4">
                    <Banner tone="info" icon={PauseCircle} title="Created paused — you stay in control">
                        The campaign, ad set, and ad are all created in a <strong>paused</strong> state. MontrAI never
                        activates, edits, or deletes live campaigns — activate it yourself in
                        {platform === 'meta_ads' ? ' Meta Ads Manager' : ' Google Ads'} after a final review.
                    </Banner>
                    <Card title="Review">
                        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
                            <dt className="text-muted-foreground">Account</dt>
                            <dd>{account.accountName} ({PLATFORM_LABELS[platform]})</dd>
                            <dt className="text-muted-foreground">Campaign</dt>
                            <dd>{form.campaignName}</dd>
                            {platform === 'meta_ads' ? (
                                <>
                                    <dt className="text-muted-foreground">Objective</dt>
                                    <dd>{META_OBJECTIVES.find((objective) => objective.value === form.objective)?.label}</dd>
                                    <dt className="text-muted-foreground">Audience</dt>
                                    <dd>{splitCountries(form.countries).join(', ')} · ages {form.ageMin}–{form.ageMax}</dd>
                                    <dt className="text-muted-foreground">Destination</dt>
                                    <dd className="truncate">{form.linkUrl}</dd>
                                </>
                            ) : (
                                <>
                                    <dt className="text-muted-foreground">Keywords</dt>
                                    <dd>{splitLines(form.keywords).length} broad-match keywords</dd>
                                    <dt className="text-muted-foreground">RSA assets</dt>
                                    <dd>{splitLines(form.headlines).length} headlines · {splitLines(form.descriptions).length} descriptions</dd>
                                    <dt className="text-muted-foreground">Final URL</dt>
                                    <dd className="truncate">{form.finalUrl}</dd>
                                </>
                            )}
                            <dt className="text-muted-foreground">Daily budget</dt>
                            <dd>{fmtMoney(parseFloat(form.dailyBudget) || 0, account.currencyCode)}</dd>
                        </dl>
                    </Card>
                </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between">
                <Button
                    variant="outline"
                    icon={ArrowLeft}
                    disabled={step === 0 || creating}
                    onClick={() => setStep((previous) => Math.max(0, previous - 1))}
                >
                    Back
                </Button>
                <div className="flex items-center gap-3">
                    {stepError && step < 5 && <span className="text-xs text-muted-foreground">{stepError}</span>}
                    {step < 5 ? (
                        <Button
                            variant="brand"
                            iconRight={ArrowRight}
                            disabled={!!stepError}
                            onClick={() => setStep((previous) => Math.min(5, previous + 1))}
                        >
                            Continue
                        </Button>
                    ) : (
                        <Button variant="brand" icon={creating ? undefined : PauseCircle} disabled={creating} onClick={handleCreate}>
                            {creating ? <Spinner size={14} /> : null}
                            Create paused campaign
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
