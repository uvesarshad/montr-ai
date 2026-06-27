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

/* -------------------------------------------------------------------------- *
 * Universal tactical playbooks (D10).
 *
 * Business-type-agnostic, ready-to-run plays the agent loads into every brand
 * workspace regardless of industry. Each is a concrete, runnable template —
 * a goal, the trigger that should start it, sequenced steps referencing REAL
 * agent tools (see src/lib/agent/tools/*), and the metrics to watch. These are
 * the "genuinely-useful static starter playbooks" the OSS build ships with so a
 * fresh self-host agent is immediately capable instead of blank. All carry an
 * empty industryMatch (they apply everywhere) and are appended to every seed.
 * -------------------------------------------------------------------------- */

const SPEED_TO_LEAD: StarterPlaybook = {
    industryMatch: [],
    title: 'Play — Speed-to-lead follow-up',
    content: `<h1>Speed-to-lead follow-up</h1>
<p><strong>Goal:</strong> contact every new lead within 5 minutes; a fast, decent reply beats a slow, perfect one.</p>
<p><strong>Trigger:</strong> a new form submission, ad lead, or inbound message (create_mission_trigger on form/lead events).</p>
<h2>Steps</h2>
<ol>
<li><strong>Ground first</strong> — resolve_contact / getContact on the new lead; read their CRM timeline before writing anything. If they don't exist, createContact.</li>
<li><strong>First touch within 5 min</strong> — pick the channel they came in on: send_inbox_email for email leads, send_whatsapp_text for phone leads. Reference what they asked about, not a generic greeting.</li>
<li><strong>Offer the next step</strong> — propose a concrete action (book a call via check_availability + create_calendar_event, or a reply with the specific info requested).</li>
<li><strong>Log it</strong> — createActivity on the contact so the thread is visible to humans and future missions.</li>
<li><strong>Cadence if no reply</strong> — sleep_until +1 day, follow up once; +3 days, follow up once more with a softer ask, then stop.</li>
</ol>
<h2>Rules</h2>
<ul>
<li>All sends go through request_approval per the brand's settings.</li>
<li>Never burst-message; use sleep_until between touches and respect business hours.</li>
</ul>
<h2>Metrics</h2>
<p>Median time-to-first-touch, lead→reply rate, lead→meeting rate.</p>`,
};

const CONTENT_CALENDAR: StarterPlaybook = {
    industryMatch: [],
    title: 'Play — Weekly content calendar',
    content: `<h1>Weekly content calendar</h1>
<p><strong>Goal:</strong> publish 3-5 on-brand posts per channel per week, planned a week ahead, never scrambling day-of.</p>
<p><strong>Trigger:</strong> recurring weekly (create_scheduled_task, e.g. every Monday 9am).</p>
<h2>Steps</h2>
<ol>
<li><strong>Review what worked</strong> — get_post_performance for the last 2 weeks; note the top-performing format and topic.</li>
<li><strong>Plan the week</strong> — draft 3-5 posts per active channel (list_social_accounts) mixing education, proof, and one call-to-action. Lead with the format that performed best.</li>
<li><strong>Generate assets</strong> — generate_text for copy, generate_image for visuals, grounded in Brand Memory (read_memory) so voice stays consistent.</li>
<li><strong>Schedule</strong> — schedule_campaign / list_scheduled_posts to spread posts across the week at the channel's best times.</li>
<li><strong>Save the plan</strong> — write_workspace_doc with the week's calendar so the owner can review and edit.</li>
</ol>
<h2>Metrics</h2>
<p>Posts shipped vs planned, engagement rate by format, follower/list growth.</p>`,
};

const SOCIAL_REPURPOSING: StarterPlaybook = {
    industryMatch: [],
    title: 'Play — Social repurposing',
    content: `<h1>Social repurposing</h1>
<p><strong>Goal:</strong> turn one strong asset into a week of multi-channel content — create once, distribute many.</p>
<p><strong>Trigger:</strong> a new long-form asset (blog post, video, case study, webinar) lands, or run weekly on the top performer.</p>
<h2>Steps</h2>
<ol>
<li><strong>Find the source</strong> — get_post_performance / import_social_content to identify the single best-performing recent piece, or read_doc the new asset.</li>
<li><strong>Derive pieces</strong> — generate_text to spin the source into: a short thread, 2-3 standalone posts, a carousel outline, and one email. Keep the core idea, adapt tone per channel.</li>
<li><strong>Add visuals</strong> — generate_image for each derivative that needs one.</li>
<li><strong>Distribute</strong> — schedule_campaign across list_social_accounts, staggered over several days so it doesn't all land at once.</li>
<li><strong>Close the loop</strong> — note in the workspace which derivative performed best for next time.</li>
</ol>
<h2>Metrics</h2>
<p>Reach per source asset, derivatives shipped per source, best-performing format.</p>`,
};

const REVIEW_RESPONSE: StarterPlaybook = {
    industryMatch: [],
    title: 'Play — Review & reputation response',
    content: `<h1>Review &amp; reputation response</h1>
<p><strong>Goal:</strong> respond to every review fast and on-brand — positives reinforce, negatives recover.</p>
<p><strong>Trigger:</strong> a new review or public mention arrives (inbox / integration event), or sweep daily.</p>
<h2>Steps</h2>
<ol>
<li><strong>Read the full context</strong> — read_conversation / get_inbox_thread; resolve_contact to pull the customer's history before replying.</li>
<li><strong>Positive review</strong> — draft a warm, specific thank-you (generate_text); where appropriate, invite them into a referral or testimonial ask.</li>
<li><strong>Negative review</strong> — acknowledge, apologize without excuses, move it to a private channel. Draft the public reply AND a private follow-up (send_inbox_email / send_whatsapp_text). escalate_conversation to a human if it involves refunds, legal, or safety.</li>
<li><strong>Log & learn</strong> — createActivity on the contact; write_memory any recurring complaint theme so the brand can fix the root cause.</li>
</ol>
<h2>Rules</h2>
<ul>
<li>All public responses go through request_approval.</li>
<li>Never argue publicly; never share private customer details in a public reply.</li>
</ul>
<h2>Metrics</h2>
<p>Response rate, median response time, sentiment trend, negatives recovered.</p>`,
};

const ABANDONED_INTENT: StarterPlaybook = {
    industryMatch: [],
    title: 'Play — Abandoned-intent recovery',
    content: `<h1>Abandoned-intent recovery</h1>
<p><strong>Goal:</strong> recover people who showed buying intent then dropped off (abandoned cart, started checkout, requested a quote, half-finished a form).</p>
<p><strong>Trigger:</strong> an abandonment event (create_mission_trigger on cart/checkout/quote-abandon or partial form submission).</p>
<h2>Steps</h2>
<ol>
<li><strong>Identify intent</strong> — resolve_contact; confirm what they were about to do and how warm they are.</li>
<li><strong>Reminder at 1h</strong> — gentle nudge with the exact item/quote they left (send_whatsapp_text or send_inbox_email). No discount yet.</li>
<li><strong>Reminder at 24h</strong> — add social proof or answer the likely objection (generate_text grounded in Brand Memory).</li>
<li><strong>Incentive at 72h</strong> — only now offer an incentive if margins allow; request_approval before sending any discount.</li>
<li><strong>Stop & log</strong> — after 3 touches, stop. createActivity on every touch.</li>
</ol>
<h2>Metrics</h2>
<p>Recovery rate, revenue recovered, incentive cost per recovery.</p>`,
};

const ONBOARDING: StarterPlaybook = {
    industryMatch: [],
    title: 'Play — New customer onboarding',
    content: `<h1>New customer onboarding</h1>
<p><strong>Goal:</strong> get every new customer to their first win fast; early activation predicts retention.</p>
<p><strong>Trigger:</strong> a new customer/sale (create_mission_trigger on deal-won or new-customer event).</p>
<h2>Steps</h2>
<ol>
<li><strong>Welcome immediately</strong> — warm welcome on their preferred channel (send_inbox_email / send_whatsapp_text); set expectations for what happens next.</li>
<li><strong>First-value step</strong> — point them to the single most important first action and offer help doing it.</li>
<li><strong>Day 2-3 check-in</strong> — sleep_until +2 days, then ask if they hit the first win; answer questions or escalate_conversation if stuck.</li>
<li><strong>Day 7 deepen</strong> — share a tip/feature that increases stickiness; invite a call (check_availability + create_calendar_event) for high-value accounts.</li>
<li><strong>Hand-off</strong> — createActivity logging onboarding status; flag accounts not activated for human follow-up.</li>
</ol>
<h2>Metrics</h2>
<p>Activation rate within 7 days, time-to-first-value, early churn.</p>`,
};

const NURTURE_DRIP: StarterPlaybook = {
    industryMatch: [],
    title: 'Play — Lead nurture drip',
    content: `<h1>Lead nurture drip</h1>
<p><strong>Goal:</strong> keep not-yet-ready leads warm with helpful, low-pressure value until they're ready to buy.</p>
<p><strong>Trigger:</strong> a lead that engaged but didn't convert (tag in CRM), or run weekly over the un-converted segment.</p>
<h2>Steps</h2>
<ol>
<li><strong>Segment</strong> — listContacts filtered to engaged-but-not-converted; group by interest/source.</li>
<li><strong>Sequence value</strong> — plan 4-6 touches spaced over weeks: each gives something useful (tip, case study, answer to a common objection) and asks for nothing most of the time.</li>
<li><strong>Personalize</strong> — generate_text per segment, grounded in read_memory brand voice; one soft CTA every 3rd touch only.</li>
<li><strong>Pace</strong> — sleep_until between touches; respect business hours; stop the moment they reply or convert and move them to the active pipeline.</li>
<li><strong>Log</strong> — createActivity each touch; updateContact stage when they warm up.</li>
</ol>
<h2>Metrics</h2>
<p>Nurture→engaged rate, unsubscribe rate, time-to-conversion.</p>`,
};

const WIN_BACK: StarterPlaybook = {
    industryMatch: [],
    title: 'Play — Win-back dormant customers',
    content: `<h1>Win-back dormant customers</h1>
<p><strong>Goal:</strong> re-engage lapsed or churned customers — far cheaper than acquiring new ones.</p>
<p><strong>Trigger:</strong> run monthly (create_scheduled_task) over customers with no activity in N days.</p>
<h2>Steps</h2>
<ol>
<li><strong>Identify the dormant set</strong> — listContacts / getDealsPipeline filtered by last-active date and past value; prioritize high-value lapses.</li>
<li><strong>Pick a real hook</strong> — a specific new offer, product, or improvement — never a generic "just checking in".</li>
<li><strong>Reach out</strong> — personalized message referencing their past relationship (generate_text + send_inbox_email / send_whatsapp_text).</li>
<li><strong>One follow-up</strong> — sleep_until +5 days, one reminder, then stop and mark them cold.</li>
<li><strong>Log & route</strong> — createActivity; move responders into the active pipeline.</li>
</ol>
<h2>Rules</h2>
<p>All sends go through request_approval; cap incentives to protect margin.</p>
<h2>Metrics</h2>
<p>Reactivation rate, revenue from win-backs, cost per reactivation.</p>`,
};

const INBOX_TRIAGE: StarterPlaybook = {
    industryMatch: [],
    title: 'Play — Inbox triage',
    content: `<h1>Inbox triage</h1>
<p><strong>Goal:</strong> keep the omnichannel inbox at zero-backlog — routine queries answered, hard ones escalated, nothing dropped.</p>
<p><strong>Trigger:</strong> run on a short interval (create_scheduled_task) or on new-message events.</p>
<h2>Steps</h2>
<ol>
<li><strong>List open threads</strong> — list_conversations across WhatsApp, email, and chat; sort by age and priority.</li>
<li><strong>Read before replying</strong> — get_inbox_thread + resolve_contact for context on each.</li>
<li><strong>Answer routine queries</strong> — draft grounded replies (generate_text from read_memory / read_doc) and send via send_reply / send_inbox_email after request_approval.</li>
<li><strong>Escalate the hard ones</strong> — escalate_conversation / assign_to_user for anything involving complaints, refunds, legal, or a real sales opportunity.</li>
<li><strong>Log & close</strong> — createActivity; leave the inbox clean.</li>
</ol>
<h2>Rules</h2>
<p>If a human or an AI bot already owns a live thread, do NOT double-reply — coordinate or act only outside that thread.</p>
<h2>Metrics</h2>
<p>Median first-response time, % auto-resolved, backlog size, escalation accuracy.</p>`,
};

const APPOINTMENT_REMINDERS: StarterPlaybook = {
    industryMatch: [],
    title: 'Play — Appointment booking & reminders',
    content: `<h1>Appointment booking &amp; reminders</h1>
<p><strong>Goal:</strong> fill the calendar and cut no-shows with timely confirmations and reminders.</p>
<p><strong>Trigger:</strong> a lead ready to meet, or a recurring sweep of upcoming appointments.</p>
<h2>Steps</h2>
<ol>
<li><strong>Book</strong> — check_availability, propose 2-3 slots, then create_calendar_event once they pick.</li>
<li><strong>Confirm immediately</strong> — send the details on their channel (send_whatsapp_text / send_inbox_email) and createActivity.</li>
<li><strong>Reminder 24h before</strong> — sleep_until the day prior; send a reminder with date, time, and location/link.</li>
<li><strong>Reminder ~2h before</strong> — short nudge; for high-value meetings, schedule_call a reminder call.</li>
<li><strong>No-show recovery</strong> — if they miss it, follow up same day to rebook rather than letting it lapse.</li>
</ol>
<h2>Metrics</h2>
<p>Bookings/week, no-show rate, reschedule rate.</p>`,
};

const REFERRAL_TESTIMONIAL: StarterPlaybook = {
    industryMatch: [],
    title: 'Play — Referral & testimonial requests',
    content: `<h1>Referral &amp; testimonial requests</h1>
<p><strong>Goal:</strong> systematically turn happy customers into referrals and proof — the cheapest growth channel.</p>
<p><strong>Trigger:</strong> a positive moment — a 5-star review, a won deal, a successful project, or a milestone.</p>
<h2>Steps</h2>
<ol>
<li><strong>Spot the happy moment</strong> — surfaced from review-response, a closed deal (getDealsPipeline), or onboarding success.</li>
<li><strong>Ask at the peak</strong> — while satisfaction is high, send a short, specific ask (generate_text + send_inbox_email / send_whatsapp_text): a testimonial OR a referral, not both at once.</li>
<li><strong>Make it effortless</strong> — provide a template, a link, or 2-3 prompt questions so they can reply in one line.</li>
<li><strong>Capture & reuse</strong> — when a testimonial comes in, write_workspace_doc it for marketing reuse; route referrals into the speed-to-lead play.</li>
<li><strong>Thank them</strong> — always acknowledge; createActivity to log.</li>
</ol>
<h2>Metrics</h2>
<p>Testimonials collected, referrals generated, referral→customer rate.</p>`,
};

const WEEKLY_REPORTING: StarterPlaybook = {
    industryMatch: [],
    title: 'Play — Weekly performance report',
    content: `<h1>Weekly performance report</h1>
<p><strong>Goal:</strong> a short, honest weekly readout — what moved, why, and the 1-3 actions for next week.</p>
<p><strong>Trigger:</strong> recurring weekly (create_scheduled_task, e.g. Monday 8am).</p>
<h2>Steps</h2>
<ol>
<li><strong>Pull the numbers</strong> — get_marketing_analytics, get_post_performance, get_campaign_metrics, getDealsPipeline for the past 7 days.</li>
<li><strong>Compare</strong> — week-over-week; flag the biggest mover up and down and name the likely cause.</li>
<li><strong>Decide actions</strong> — convert findings into 1-3 concrete next steps; where a strategy exists, iterate_strategy with the real data.</li>
<li><strong>Write the report</strong> — write_workspace_doc a tight summary (numbers, narrative, actions) the owner can read in 2 minutes.</li>
<li><strong>Optionally send</strong> — email the summary to the owner (request_approval first).</li>
</ol>
<h2>Rules</h2>
<p>Report the bad news too; a report that's all green is a report nobody trusts.</p>
<h2>Metrics</h2>
<p>Report shipped on time, actions completed vs proposed, trend of the core KPI.</p>`,
};

/**
 * Universal, business-type-agnostic tactical plays seeded into every workspace.
 * Ordered roughly by funnel stage (acquire → convert → retain → measure).
 */
export const UNIVERSAL_PLAYBOOKS: StarterPlaybook[] = [
    SPEED_TO_LEAD,
    CONTENT_CALENDAR,
    SOCIAL_REPURPOSING,
    NURTURE_DRIP,
    ABANDONED_INTENT,
    APPOINTMENT_REMINDERS,
    ONBOARDING,
    INBOX_TRIAGE,
    REVIEW_RESPONSE,
    WIN_BACK,
    REFERRAL_TESTIMONIAL,
    WEEKLY_REPORTING,
];

/**
 * Pick the starter playbook(s) for an industry string. Always seeds the universal
 * growth loop, the matched vertical playbook (if any), and the full set of
 * business-type-agnostic tactical plays (UNIVERSAL_PLAYBOOKS).
 */
export function getStarterPlaybooksForIndustry(industry: string | undefined): StarterPlaybook[] {
    const needle = (industry ?? '').toLowerCase();
    const vertical = needle
        ? STARTER_PLAYBOOKS.find(
            (p) => p.industryMatch.length > 0 && p.industryMatch.some((k) => needle.includes(k)),
        )
        : undefined;
    const base = vertical && vertical !== GENERAL ? [vertical, GENERAL] : [GENERAL];
    return [...base, ...UNIVERSAL_PLAYBOOKS];
}
