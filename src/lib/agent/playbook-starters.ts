/**
 * Vertical starter playbooks (Phase 3, 2026-06-05 — G9).
 *
 * Seeded into a brand's Agent Workspace `Playbooks/` folder on first
 * provisioning, matched against BrandContext.industry. This is the
 * universality mechanism: one agent serves any business type by consuming
 * vertical know-how as data, not hardcoded logic. The agent distills its own
 * playbooks into the same folder as it completes missions; the strategy
 * generator reads them all.
 *
 * Pure content module — no imports, safe for any layer to use.
 */

export interface StarterPlaybook {
    /** Keywords matched (case-insensitive, substring) against BrandContext.industry. */
    industryMatch: string[];
    title: string;
    /** HTML body (Docs editor format). */
    content: string;
}

const ECOMMERCE: StarterPlaybook = {
    industryMatch: ['ecommerce', 'e-commerce', 'retail', 'shop', 'store', 'fashion', 'd2c', 'dtc'],
    title: 'Starter playbook — E-commerce growth',
    content: `<h1>E-commerce growth playbook</h1>
<h2>Principles</h2>
<ul>
<li>Never just scale ad spend — diversify: email flows and organic content compound, paid does not.</li>
<li>Revenue = traffic × conversion × AOV × repeat rate. Diagnose which factor is weakest before acting.</li>
<li>Retention beats acquisition: a win-back email to past buyers outperforms cold ads on ROAS almost always.</li>
</ul>
<h2>Proven sequences</h2>
<ul>
<li><strong>Abandoned-intent cadence:</strong> captured lead → WhatsApp/email within 1h → reminder at 24h → incentive at 72h.</li>
<li><strong>Content engine:</strong> 3-5 organic posts/week per channel; product-in-use content outperforms studio shots; repurpose top performer into ad creative.</li>
<li><strong>Ads:</strong> start narrow (best-selling SKU, warm audiences), prove CPA, then broaden. Always PAUSED until the owner reviews.</li>
</ul>
<h2>Metrics that matter</h2>
<p>CPA vs AOV margin, repeat-purchase rate, email list growth, top-of-funnel CTR by creative.</p>`,
};

const B2B_SAAS: StarterPlaybook = {
    industryMatch: ['saas', 'software', 'b2b', 'tech', 'platform', 'api', 'developer'],
    title: 'Starter playbook — B2B SaaS GTM',
    content: `<h1>B2B SaaS GTM playbook</h1>
<h2>Principles</h2>
<ul>
<li>0→1: founders sell; the agent's job is filling the calendar — content builds trust, outreach books meetings.</li>
<li>1→10k users: double down on the ONE channel that already converts before adding new ones.</li>
<li>Every prospect is a thread, not a blast: email for detail, call for qualification, WhatsApp for momentum.</li>
</ul>
<h2>Proven sequences</h2>
<ul>
<li><strong>Inbound lead:</strong> respond within 5 minutes (form/ad lead → trigger) → qualify by email → book a demo → call reminder + WhatsApp confirmation before the meeting.</li>
<li><strong>Content engine:</strong> founder-voice posts on the problem space (not the product) 2-3×/week on LinkedIn/X; one deep-dive doc per week reused as a nurture email.</li>
<li><strong>Outbound:</strong> tight ICP list in CRM → personalized first touch referencing real context → 3-touch cadence with sleep_until pacing, never burst.</li>
</ul>
<h2>Metrics that matter</h2>
<p>Demos booked/week, lead→demo rate, demo→signup rate, activation within 7 days, channel-sourced signups.</p>`,
};

const AGENCY: StarterPlaybook = {
    industryMatch: ['agency', 'consult', 'services', 'studio', 'freelance', 'marketing services'],
    title: 'Starter playbook — Agency / services pipeline',
    content: `<h1>Agency & services pipeline playbook</h1>
<h2>Principles</h2>
<ul>
<li>Case studies and proof beat promises — every completed client engagement becomes content.</li>
<li>Referrals are the cheapest channel: systematic post-project check-ins generate them; schedule these.</li>
<li>Authority content (teardowns, before/after, process breakdowns) attracts inbound better than service lists.</li>
</ul>
<h2>Proven sequences</h2>
<ul>
<li><strong>Inbound inquiry:</strong> reply same hour → discovery call within 48h (calendar tool) → proposal follow-up cadence at day 2 / day 5 / day 10.</li>
<li><strong>Dormant clients:</strong> quarterly win-back with a specific new-service hook, never a generic "checking in".</li>
<li><strong>Content engine:</strong> 1 case study/month, weekly process insights, monthly portfolio refresh across socials.</li>
</ul>
<h2>Metrics that matter</h2>
<p>Discovery calls/week, proposal win rate, client LTV, referral share of new business.</p>`,
};

const GENERAL: StarterPlaybook = {
    industryMatch: [],
    title: 'Starter playbook — Universal growth loop',
    content: `<h1>Universal growth loop playbook</h1>
<h2>The loop</h2>
<ol>
<li><strong>Goal</strong> — one measurable target with a deadline (generate_strategy).</li>
<li><strong>Create</strong> — content grounded in the brand's knowledge base and what already performed (get_post_performance, import_social_content).</li>
<li><strong>Distribute</strong> — owned channels first (social, email, WhatsApp), paid only after organic signal (create_ad_campaign, always reviewed).</li>
<li><strong>Engage</strong> — every inbound lead handled as one cross-channel thread within minutes, not days (triggers + prospect-engagement missions).</li>
<li><strong>Measure & iterate</strong> — weekly performance review; iterate_strategy with real data; distill what worked into a new playbook here.</li>
</ol>
<h2>Rules of thumb</h2>
<ul>
<li>Speed-to-lead beats message quality: a fast mediocre reply outperforms a slow perfect one.</li>
<li>Compound channels (SEO, email list, repeat customers) deserve daily investment even when paid looks faster.</li>
<li>When a tactic works twice, write it down in Playbooks/ — that's how this agent gets smarter for this brand.</li>
</ul>`,
};

export const STARTER_PLAYBOOKS: StarterPlaybook[] = [ECOMMERCE, B2B_SAAS, AGENCY, GENERAL];

/** Pick the starter playbook(s) for an industry string. Always includes the universal loop. */
export function getStarterPlaybooksForIndustry(industry: string | undefined): StarterPlaybook[] {
    const needle = (industry ?? '').toLowerCase();
    const vertical = needle
        ? STARTER_PLAYBOOKS.find(
            (p) => p.industryMatch.some((k) => needle.includes(k)),
        )
        : undefined;
    return vertical && vertical !== GENERAL ? [vertical, GENERAL] : [GENERAL];
}
