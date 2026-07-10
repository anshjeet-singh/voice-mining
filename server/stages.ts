/**
 * Pipeline stage registry for the Client OS. Mirrors the mother skill
 * (client-onboarding-orchestrator) step order: foundation -> skool ->
 * funnel -> emails. Each stage defines its gating, its output contract
 * (docType -> filename -> title), and the instructions the local worker
 * gets. The funnel stage branches on the client's funnelType, exactly
 * like the mother skill's Step 3 branch.
 */

export type FunnelType = "webinar" | "call";

export interface StageDoc {
  docType: string;
  filename: string;
  title: string;
  /** One line telling the worker what this file is. Structure comes from the skills. */
  description: string;
}

export interface StageDef {
  type: string;
  label: string;
  /** Job type that must be approved before this stage can run. null = gated on onboarding docs. */
  requires: string | null;
  motherStep: string;
  childSkills: (funnelType: FunnelType) => string[];
  docs: (funnelType: FunnelType) => StageDoc[];
  extraInstructions: (funnelType: FunnelType) => string;
}

export const STAGES: Record<string, StageDef> = {
  foundation: {
    type: "foundation",
    label: "Foundation Documents",
    requires: null,
    motherStep: "Step 1 (Foundation docs)",
    childSkills: () => [
      "avatar-extraction",
      "schwartz-awareness-mapper",
      "offer-extraction",
      "offer-architecture",
      "offer-math-pricing",
      "mechanism-builder",
      "vsl-and-sales-page-writer (FOUNDATIONS mode)",
      "course-builder (MENU mode)",
    ],
    docs: () => [
      { docType: "icp_snapshot", filename: "01_icp_snapshot.md", title: "ICP Snapshot", description: "Avatar, awareness stage, pains and desires in the market's language" },
      { docType: "offers", filename: "02_offers.md", title: "Offers", description: "Offer structure, pricing, mechanism, offer math" },
      { docType: "brand_positioning", filename: "03_brand_positioning.md", title: "Brand & Positioning", description: "One-of-one mechanism, positioning, brand voice" },
      { docType: "course_outline", filename: "04_course_outline.md", title: "Course Outline", description: "Module and lesson structure per the course-builder MENU" },
    ],
    extraInstructions: () =>
      "Ground every document in the client's actual language from the onboarding transcript and the research verbatims. No generic filler.",
  },

  skool: {
    type: "skool",
    label: "Skool Setup",
    requires: "foundation",
    motherStep: "Step 2 (Skool community build)",
    childSkills: () => [
      "skool-community-builder",
      "free-community-pipeline",
      "vsl-and-sales-page-writer (for the About-page VSL scripts)",
      "hidden-vssl-framework",
      "generic-language-killer (polish pass)",
    ],
    docs: () => [
      { docType: "skool_free_community", filename: "01_free_community.md", title: "Free Community", description: "The free Skool community: name options, tagline, About page copy, a ~3-minute word-for-word About-page VSL script, categories, gamification level names, plugins config, three pinned posts, Start Here module key" },
      { docType: "skool_paid_community", filename: "02_paid_community.md", title: "Paid Community", description: "The paid Skool community: same full asset set including its own ~3-minute About-page VSL (with value stack, price anchor, named guarantee), selling the exact offer from the approved Offers document" },
    ],
    extraInstructions: () =>
      "Build BOTH communities: the free community (top of funnel, feeds the booking pipeline) and the paid community (the delivery vehicle for the offer in the Offers doc). The paid community's copy must sell the exact offer, price, and mechanism from the approved Offers document, never a variant. Both About-page VSL scripts are word-for-word, ~3 minutes spoken (420-480 words), following the skool-about-vsl framework's beat sequence. GAMIFICATION LEVEL NAMES MUST BE IDENTICAL across the free and paid communities: one ladder, derived from the client's brand language.",
  },

  funnel: {
    type: "funnel",
    label: "Funnel Copy",
    requires: "skool",
    motherStep: "Steps 3 and 4 (Funnel core + pages & videos)",
    childSkills: (ft) =>
      ft === "webinar"
        ? ["webinar-deck-builder (BUILD mode)", "funnel-page-builder (LEAD_MAGNET + relevant modes)", "funnel-video-scripts (THANK_YOU)", "breakout-video-writer", "confirmation-page-that-converts", "generic-language-killer (polish pass)"]
        : ["vsl-and-sales-page-writer (BIG_IDEA then VSL)", "vsl-that-converts", "hidden-vssl-framework", "funnel-page-builder (POST_CALL_PAGE, PRE_CALL_HUB, CALENDLY)", "confirmation-page-that-converts", "funnel-video-scripts (CALL_CONFIRMED + OFFER_BREAKDOWN)", "breakout-video-writer", "generic-language-killer (polish pass)"],
    docs: (ft) =>
      ft === "webinar"
        ? [
            { docType: "funnel_core", filename: "01_webinar_deck.md", title: "Webinar Deck", description: "The full live workshop deck, slide by slide, with the big idea and core promise flagged at the top" },
            { docType: "funnel_structure", filename: "02_funnel_structure.md", title: "Funnel Structure", description: "COMPLETE page-by-page copy per the funnel-structure framework: registration page (eyebrow, headline, subheadline, secrets bullets, proof strip, CTA), thank-you page, and replay page. Every section's actual copy plus a one-line layout note. Every page echoes the deck's core promise exactly" },
            { docType: "video_scripts", filename: "03_video_scripts.md", title: "Video Scripts", description: "EXACTLY 10 full scripts, numbered: 1 thank-you page video, 1 offer-breakdown video, and 8 breakout objection/FAQ videos (60-90s each). Every script written word for word" },
          ]
        : [
            { docType: "funnel_structure", filename: "01_funnel_structure.md", title: "Funnel Structure", description: "COMPLETE FINAL page-by-page copy per the funnel-structure framework: Page 1 the VSL page (eyebrow ATTENTION line, headline, subheadline, CTA button text, proof strip, pain block, mechanism reveal, offer stack, testimonial specs, FAQ, all three CTA blocks) and Page 2 the booking page (header, calendar rules, what-happens bullets, proof). The HEADLINE section alone gives 5-7 ranked options with the chosen one first; every other section is single, final, shipped copy" },
            { docType: "video_scripts", filename: "02_video_scripts.md", title: "Video Scripts", description: "EXACTLY 10 full scripts, numbered: script 1 the VSL (big idea and core promise flagged at the top), script 2 the call-confirmed video, scripts 3-10 the eight breakout objection/FAQ videos (60-90s each). YOU choose the 8 breakout topics from the market's top objections; never present topic options. Every script written word for word" },
          ],
    extraInstructions: (ft) =>
      `This client runs a ${ft === "webinar" ? "WEBINAR funnel (Branch A)" : "CALL funnel (Branch B, VSL into booked call)"}. Every page and script must pass the copy-quality-bar framework and model the 2-3 closest funnels in the vsl-swipe-file. Non-negotiable formulas: the eyebrow line is ONLY a pure callout, "ATTENTION [EXACT ICP]:" with nothing bolted onto it. The headline promises the dream outcome with a specific number/timeframe/named mechanism (NEVER a diagnosis-of-their-failure line, NEVER a rambling multi-clause sentence; if it cannot be said out loud in one breath, cut it). The subheadline follows "[Dream outcome] in [timeframe], without [top 2-3 objections from the research]", grammatical and punchy, never "watch the video below and I will show you..." filler. Proof next to every claim, one repeated CTA. Pages echo the ${ft === "webinar" ? "deck's" : "VSL's"} language exactly. Use [BOOKING LINK], [COMMUNITY LINK], [VSL LINK], and [PROOF: ...] placeholders wherever a real URL or client asset goes.`,
  },

  emails: {
    type: "emails",
    label: "Email Sequences",
    requires: "funnel",
    motherStep: "Step 5 (Email + SMS sequences)",
    childSkills: (ft) =>
      ft === "webinar"
        ? ["pre-call-email-writer (adapted to the community joiner sequence)", "email-campaign-writer", "pre-webinar-email-writer", "post-webinar-email-writer", "generic-language-killer (polish pass)"]
        : ["pre-call-email-writer", "email-campaign-writer", "generic-language-killer (polish pass)"],
    docs: (ft) =>
      ft === "webinar"
        ? [
            { docType: "email_sequence_14day", filename: "01_email_sequence_14day.md", title: "14-Day Community Sequence", description: "The 14-day email sequence sent to every FREE Skool community joiner, driving them to register for the webinar. One email per day, each with subject line, preview text, full body, and sign-off" },
            { docType: "email_prewebinar", filename: "02_prewebinar_sequence.md", title: "Pre-Webinar Show-Up Sequence", description: "Registration to live-attendance sequence: instant confirmation email, then show-up emails from registration day through webinar day (calendar add, what-you'll-discover open loops, a proof story, speaker credibility, day-of and 1-hour reminders). Every email carries standalone value (a proof story, a mechanism insight, or a quick win), never a bare reminder. Each with subject line, preview text, full body, send timing" },
            { docType: "email_postwebinar", filename: "03_postwebinar_sequence.md", title: "Post-Webinar Replay + Close Sequence", description: "The after-webinar close: separate tracks labeled for attendees who didn't act, no-shows (replay with expiry), and the final cart-close arc (recap of the offer, objection emails built from the breakout topics, proof stack, honest deadline). Each email with subject line, preview text, full body, send timing" },
            { docType: "sms_set", filename: "04_sms_set.md", title: "SMS Set", description: "The companion GHL SMS set mirroring the email sequences: registration confirmation, 24h / 3h / 15min webinar reminders, replay link, deadline last-call. Under 320 characters each, one link max, one CTA" },
          ]
        : [
            { docType: "email_sequence_14day", filename: "01_email_sequence_14day.md", title: "14-Day Community Sequence", description: "The 14-day email sequence sent to every FREE Skool community joiner, driving them to book an onboarding call (CTA is the VSL page). One email per day. Every value email points INTO the free community to consume a SPECIFIC named asset from the approved Skool docs (toolkit, pinned lead magnet, named classroom video): value delivery, belief breaking, pain articulation, urgency, in the swipe-file arc. Each email in the framework's block layout: Send / Subject / Preview text each on its own line, then the body" },
            { docType: "email_postbooking", filename: "02_postbooking_sequence.md", title: "Post-Booking Show-Up Sequence", description: "Booking to show-up sequence per the pre-call-email-writer skill and the emails-and-booking framework: instant confirmation email (what happens next, calendar add, the call-confirmed video at [CALL CONFIRMED VIDEO]), then value-INTENSIVE emails between booking and the call, each sending them BACK into the free community to consume a named lead magnet or training, each breaking ONE limiting belief, plus one straight FAQ email answering the real pre-call questions, what-to-bring homework, and 24h and 3h reminders. Every email carries standalone value, never a bare 'don't forget'. Block layout per the framework, send timing relative to booking or call time" },
            { docType: "email_noshow_followup", filename: "03_noshow_and_followup.md", title: "No-Show + Post-Call Follow-Up", description: "Two labeled tracks: (1) no-show recovery, 3 emails that rebook without shaming (missed-you + easy rebook, cost-of-the-unsolved-problem with a proof story, last-touch takeaway pointing back into the community), and (2) post-call follow-up for prospects who didn't close on the call, 3 emails (recap of THEIR situation and the offer, objection reframe with proof, honest final follow-up). Block layout per the framework, send timing on each" },
            { docType: "sms_set", filename: "04_sms_set.md", title: "SMS Set", description: "The companion GHL SMS set in TWO labeled tracks: (1) the 14-day community track, short nudges mirroring the key emails of the 14-day sequence (join-day welcome, toolkit pointer, case-study teaser, book-the-call pushes), and (2) the booking track: booking confirmation, pre-call value nudge, 24h / 3h / 15min reminders, no-show rebook, post-call follow-up. Under 320 characters each, one link max, one CTA, {{contact.first_name}}" },
          ],
    extraInstructions: (ft) =>
      `This client runs a ${ft === "webinar" ? "WEBINAR funnel: the sequence set is community nurture, pre-webinar show-up, post-webinar replay and close, SMS" : "CALL funnel (VSL into booked call): the sequence set is community nurture, post-booking show-up, no-show and post-call recovery, SMS"}. THE STYLE CONTRACT IS THE cc-email-swipe-style FRAMEWORK: every email follows its skeleton exactly. Emails ship in ConvertKit: first name is ALWAYS the merge tag {{ subscriber.first_name }}, verbatim. Every email ends "To your success," then the sender name with a topic-matched nickname in quotes that CHANGES per email (e.g. Trent "0%" Kus on the funding email), then a mandatory P.S. that opens tomorrow's loop, restates the CTA with real scarcity, or drops one proof point. ONE CTA per email around ONE core idea; the same destination may repeat up to 3 times, never a second action. Formatting is part of the copy: markdown bold on pains, numbers, mechanism names, and commands; italics on reframes and quoted speech; <u>underline</u> on the one must-hear sentence per email; a formatting touch every 2 to 3 lines, 1 to 2 line paragraphs, never a wall. MODEL THE REFERENCE EMAILS in the pre-call-email-writer and email-campaign-writer skills beat for beat. Quality bar: suby-email-machine and emails-and-booking frameworks (subjects earn the open with curiosity or specificity, never 'Reminder:'), reminder emails ALWAYS deliver standalone value alongside logistics, the arc follows the frameworks INDEX email routing, and P.S. loops must actually connect across the sequence. THE CTA DESTINATION IS ALWAYS [VSL LINK]: in our call funnels the VSL page IS the booking page, one URL, so never emit a separate [BOOKING LINK]. Other placeholders: [ZOOM LINK] and [CALENDAR LINK] for post-booking logistics, [COMMUNITY LINK], [CALL CONFIRMED VIDEO], and [PROOF: ...], never invented URLs or fabricated results. Emails reference the community's actual name and pinned content from the approved Skool docs and carry the core promise from the approved funnel docs word for word. SMS ships in GHL with {{contact.first_name}}, in the client's texting voice: contractions, no corporate tone, no emoji unless the client's voice material uses them.`,
  },
  ads: {
    type: "ads",
    label: "Ad Creatives",
    requires: "emails",
    motherStep: "Step 6 (Ad creatives)",
    childSkills: () => [
      "ad-script-writer",
      "static-and-broll-ad-writer",
      "static-ad-builder",
      "carousel-and-story-ad-writer",
      "meta-ad-restrictions-prep",
      "venus-fly-trap-ad-strategy (context for the campaign plan)",
      "generic-language-killer (polish pass)",
    ],
    docs: () => [
      { docType: "ad_angles", filename: "01_ad_angles.md", title: "Ad Angle Matrix", description: "The diversification engine output per the ad-script-system framework: 2-4 sub-avatars from the approved ICP Snapshot, 30+ buying reasons worked across all ten categories (functional, emotional, social, financial, time, risk, status, identity, situational, comparative), then the 12 selected batch angles ranked, each tagged with sub-avatar, buying-reason category, hook category, production format, and awareness level. The market's verbatims from the research attached to each angle" },
      { docType: "ad_scripts", filename: "02_video_ad_scripts.md", title: "Video Ad Scripts", description: "EXACTLY 12 full-length video ad scripts (30-90s spoken, ~60s ideal), numbered, one per angle from the Ad Angle Matrix, written word for word: hook, body, CTA. Each script headed by sub-avatar, angle, script format (Pain/Desire/Proof/Curiosity/Controversial), hook archetype, awareness level, and destination. The batch MUST pass the ad-script-system verification checklist: 3+ sub-avatars, 5+ hook categories, 5+ production formats, no hook flows onto another ad's body" },
      { docType: "ad_statics", filename: "03_static_and_broll_ads.md", title: "Static Ads (RENDERED) + B-Roll", description: "10 native static ads, FULLY RENDERED as 1080x1350 PNGs, not just briefs. Process: (1) READ the Ad Creative System specs first: '/Users/anshjeetsingh/Library/CloudStorage/GoogleDrive-anshjeets@gmail.com/My Drive/Cashflow Coaches/Ad Creative System/native-formats.md' and 'notes-format-spec.md' in the same folder; every static uses a format from that 33-format library, matched to sub-avatar and platform. (2) Spec each ad: format number and name, all on-image text verbatim, sub-avatar, angle from the matrix, awareness level, destination. (3) RENDER each ad: UI-native formats (iMessage, Notes, lock screen, comparison tables, checklists, win-posts) are built as HTML design elements (class 's', 360x450 at 1/3 scale) and rendered via 'node /Users/anshjeetsingh/ad-factory/render.js <file.html> <outputDir>'; photo-real and lifestyle formats via 'node /Users/anshjeetsingh/ad-factory/genimage.js \"<prompt>\" <out.png> nano-banana-pro-preview 4:5'. Prefer the HTML route wherever text fidelity matters. (4) Save everything to '/Users/anshjeetsingh/Library/CloudStorage/GoogleDrive-anshjeets@gmail.com/My Drive/Cashflow Coaches/<Client Name>/Ads/AdsBatch_<YYYY-MM-DD>/' with the HTML sources and an output/ subfolder of PNGs, and write a brief.md there in the house batch format. (5) This deliverable doc contains the full per-ad specs plus a table mapping each ad to its rendered PNG path. Then 5 b-roll caption ads (on-screen text lines with a footage brief, specs only). Statics reuse the strongest angles from the matrix, never new unvalidated ones. Real screenshots only for proof formats: where a real client screenshot is required and unavailable, spec it with [PROOF: ...] and DO NOT fabricate the screenshot" },
      { docType: "ad_campaign_plan", filename: "04_campaign_plan.md", title: "Campaign Plan", description: "The Forester content-ad architecture from the haynes-scaling-systems framework sized to THIS client: content inventory audit into Cycle Bin 1 (pure views) and Cycle Bin 2 (strategic, no CTAs), 3-second exclusion setup, retention window from the client's sales cycle, budget split table, naming conventions, plus the DR campaign structure the 12 scripts feed into, and a compliance pre-flight per meta-ad-restrictions-prep for this niche" },
    ],
    extraInstructions: (ft) =>
      `ONE AD, ONE ANGLE: hook, body, and CTA all serve a single angle for a single sub-avatar; if a hook could sit on another ad's body, the batch fails. Every destination is ${ft === "webinar" ? "[REGISTRATION LINK] (the webinar registration page)" : "[VSL LINK] (the VSL page, which IS the booking page)"}. REAL PROOF ONLY: named people, real numbers, real timeframes from the approved docs and research, [PROOF: ...] placeholders where proof is pending, never fabricated results, students, or scarcity. COMPLIANCE GATE: for regulated niches (funding, credit, finance, health), strip quantified approval-adjacent claims and provider-performance ratios from ad copy even when the client says them; replace with capability statements and 'run your own numbers' invitations, and flag every risky line in the campaign plan's compliance section. Hooks follow the ad-script-system hook bank: statements over questions, the market's exact self-descriptions from the research, specificity over adjectives, never 'if you're an agency owner' style category call-outs. Name the mechanism, never tutorial it: the funnel does the teach. Write in the client's voice from the approved brand doc. Read every script aloud: contractions throughout, no AI cadence, no em dashes anywhere. STATIC ADS ARE RENDERED DELIVERABLES: the native test for every static is 'would this pass as something a mate screenshotted and sent you?': one broken element (brand header, designed gradient, ad-speak headline) fails the ad. A FOREPLAY WINNING ADS section may appear in the research: treat those as proven pattern models for angles, proof types, and formats in this exact niche, never as words to copy.`,
  },
};

/** Stage order for gating and UI. */
export const STAGE_ORDER = ["foundation", "skool", "funnel", "emails", "ads"] as const;

/** The docType -> title contract used to validate a worker's completion. */
export function stageContract(stageType: string, funnelType: FunnelType): Record<string, string> {
  const stage = STAGES[stageType];
  if (!stage) return {};
  return Object.fromEntries(stage.docs(funnelType).map((d) => [d.docType, d.title]));
}

/**
 * Every docType this stage can produce across ALL branches. Used to clean up
 * stale documents when a contract changes or a client switches funnel type.
 */
export function stageAllDocTypes(stageType: string): string[] {
  const stage = STAGES[stageType];
  if (!stage) return [];
  return Array.from(new Set([...stage.docs("call"), ...stage.docs("webinar")].map((d) => d.docType)));
}

/** Everything the worker needs to run a stage, shipped in the claim payload. */
export function stagePromptSpec(stageType: string, funnelType: FunnelType) {
  const stage = STAGES[stageType];
  if (!stage) return null;
  return {
    label: stage.label,
    motherStep: stage.motherStep,
    childSkills: stage.childSkills(funnelType),
    outputs: stage.docs(funnelType).map(({ docType, filename, title, description }) => ({ docType, filename, title, description })),
    extraInstructions: stage.extraInstructions(funnelType),
  };
}

export type StagePromptSpec = NonNullable<ReturnType<typeof stagePromptSpec>>;
