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
      { docType: "icp_snapshot", filename: "01_icp_snapshot.md", title: "ICP Snapshot", description: "Avatar, awareness stage, pains and desires in the market's language. MUST include a '## Sub-Avatars' section with one '### <short name>' heading per sub-avatar (3-5 of them: the distinct buyer types inside the ICP, each with their specific pains, desires, objections, and awareness level). The app parses those headings into audience selectors, so keep the names short and evocative" },
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
      { docType: "ad_scripts", filename: "01_ad_creatives.md", title: "Ad Creatives: 15 Statics + 5 B-Roll + 5 Video Scripts", description: "IF THE GENERATION REQUEST SAYS 'REBUILD ONLY': skip the batch contract entirely; rebuild exactly the listed rejected ads with their EXACT filenames, fixing what each note names, re-render nothing else, and the doc covers only those ads. Otherwise: The full creative batch in ONE document, three labeled parts. PART 1, 15 NATIVE STATIC ADS, FULLY RENDERED as 1080x1350 PNGs per the static-render-rules framework (a HARD contract: read it first and follow every numbered rule). Before building anything: read the static-ad-builder skill IN FULL including its references/ specs, then open '/Users/anshjeetsingh/Library/CloudStorage/GoogleDrive-anshjeets@gmail.com/My Drive/Cashflow Coaches/Ad Creative System/reference-ads/catalog.md' (the cataloged winning-ad library) and VIEW with the Read tool every reference image relevant to the formats you plan, plus the skill's assets/reference-screenshots and any previously APPROVED batch outputs in the client's Drive Ads folder. EVERY STATIC IS A CLONE: each ad declares 'Reference: <filename>' from that library and replicates that exact image's layout, composition, colors, spacing, and CTA treatment, swapping ONLY the copy and brand tokens (static-render-rules rule 5). The QA check is side by side against the declared reference. Build with the skill's own pipeline (its scripts/, chrome crops, fonts) for covered formats; ad-factory ('node /Users/anshjeetsingh/ad-factory/render.js <file.html> <outputDir>' HTML at class 's' 360x450, genimage.js for object/environment imagery only, NEVER people) as fallback. Run the VISUAL QA LOOP on every ad (view the PNG, grade against the reference-ads library + spec + native test, fix, re-render) and log one QA line per ad. COPY EVERY FINAL PNG INTO ./assets/ IN YOUR WORKING DIRECTORY (this is how they reach the app for per-ad review) AND save sources + output/ + brief.md to the client's Drive 'Ads/AdsBatch_<YYYY-MM-DD>/'. Per-ad spec in the doc: format number and name, all on-image text verbatim, sub-avatar, angle, awareness, destination, QA line. PART 2, 5 B-ROLL CAPTION ADS: the on-screen text lines word for word plus a one-line footage brief each. PART 3, 5 full-length video ad scripts (30-90s spoken, ~60s ideal), word for word: hook, body, CTA, each headed by sub-avatar, angle, format, hook archetype, awareness, destination. The whole batch spans 3+ sub-avatars and 5+ hook categories, statics span 8+ distinct native formats, and no hook flows onto another ad's body. On-image CTAs ONLY in the format's designated CTA slot, never designed CTA text floating on a native. NEVER AI-generate a human. Where a real client screenshot is required and unavailable, spec it with [PROOF: ...] and DO NOT fabricate it" },
      { docType: "ad_campaign_plan", filename: "02_campaign_plan.md", title: "Campaign Plan", description: "Strategy and targeting in ONE document: (1) the ANGLE MATRIX that drives the batch (2-4 sub-avatars from the approved ICP Snapshot, buying reasons worked across the ten categories, the selected angles as a ranked table with tags and market verbatims); (2) the Forester content-ad architecture from the haynes-scaling-systems framework sized to THIS client (content inventory into Cycle Bin 1 pure views and Cycle Bin 2 strategic no-CTAs, 3-second exclusions, retention window from the sales cycle); (3) the DR campaign structure the creatives feed into (campaign/ad-set naming, audience targeting, placement notes, which creatives launch first and why); (4) budget allocation table across bins and DR by daily spend tier; (5) a compliance pre-flight per meta-ad-restrictions-prep for this niche, flagging every risky line in the batch" },
    ],
    extraInstructions: (ft) =>
      `ONE AD, ONE ANGLE: hook, body, and CTA all serve a single angle for a single sub-avatar; if a hook could sit on another ad's body, the batch fails. Every destination is ${ft === "webinar" ? "[REGISTRATION LINK] (the webinar registration page)" : "[VSL LINK] (the VSL page, which IS the booking page)"}. REAL PROOF ONLY: named people, real numbers, real timeframes from the approved docs and research, [PROOF: ...] placeholders where proof is pending, never fabricated results, students, or scarcity. COMPLIANCE GATE: for regulated niches (funding, credit, finance, health), strip quantified approval-adjacent claims and provider-performance ratios from ad copy even when the client says them; replace with capability statements and 'run your own numbers' invitations, and flag every risky line in the campaign plan's compliance section. Hooks follow the ad-script-system hook bank: statements over questions, the market's exact self-descriptions from the research, specificity over adjectives, never 'if you're an agency owner' style category call-outs. Name the mechanism, never tutorial it: the funnel does the teach. Write in the client's voice from the approved brand doc. Read every script aloud: contractions throughout, no AI cadence, no em dashes anywhere. STATIC ADS ARE RENDERED DELIVERABLES: the native test for every static is 'would this pass as something a mate screenshotted and sent you?': one broken element (brand header, designed gradient, ad-speak headline) fails the ad. A FOREPLAY WINNING ADS section may appear in the research: treat those as proven pattern models for angles, proof types, and formats in this exact niche, never as words to copy.`,
  },
  // ─── Ad Engine: on-demand jobs, outside the stage chain ─────────────────────
  more_statics: {
    type: "more_statics",
    label: "More Static Ads",
    requires: "ads",
    motherStep: "Ad Engine (on-demand static batch)",
    childSkills: () => [
      "static-ad-builder",
      "static-and-broll-ad-writer",
      "meta-ad-restrictions-prep",
      "generic-language-killer (polish pass)",
    ],
    docs: () => [
      { docType: "ad_statics_extra", filename: "01_more_statics.md", title: "More Static Ads (RENDERED)", description: "An ON-DEMAND batch of NEW native static ads. THE GENERATION REQUEST (how many ads and which styles/categories from the reference library) is in the REVISION FEEDBACK section: follow it exactly. IF THE REQUEST SAYS 'REBUILD ONLY': do not generate new ads; rebuild exactly the listed rejected ads, keeping each one's EXACT filename, fixing precisely what each rejection note names, and touching nothing else. The request may also carry AWARENESS LEVEL (unaware / problem aware / solution aware / product aware: pick formats and hooks that meet that stage), AUDIENCE (sub-avatar(s) from the approved ICP doc: aim the copy at their named pains), and OFFER (from the approved Offers doc): obey all of them. Same hard contract as the main batch: static-render-rules framework, clone doctrine (each ad declares 'Reference: <filename>' from '/Users/anshjeetsingh/Library/CloudStorage/GoogleDrive-anshjeets@gmail.com/My Drive/Cashflow Coaches/Ad Creative System/reference-ads/catalog.md' and replicates that exact image, copy swapped only), the skill's own build pipeline, the visual QA loop with a QA line per ad, COPY FINAL PNGs INTO ./assets/, and save sources + output/ + brief.md to the client's Drive 'Ads/AdsBatch_<YYYY-MM-DD>/'. Angles come from the approved Campaign Plan's angle matrix. NEVER duplicate an ad that already exists in the OPERATOR AD VERDICTS list: new copy, new angle-format pairings. Never AI-generate a human; [PROOF: ...] where real screenshots are pending" },
    ],
    extraInstructions: (ft) =>
      `ONE AD, ONE ANGLE. Every destination is ${ft === "webinar" ? "[REGISTRATION LINK]" : "[VSL LINK] (the VSL page, which IS the booking page)"}. REAL PROOF ONLY with [PROOF: ...] placeholders. COMPLIANCE GATE for regulated niches: no quantified approval-adjacent claims or provider-performance ratios. The approved ads in OPERATOR AD VERDICTS are the quality bar: view them, clone their standard, never their content. The native test: would this pass as something a mate screenshotted and sent you?`,
  },
  more_scripts: {
    type: "more_scripts",
    label: "More Video Scripts",
    requires: "ads",
    motherStep: "Ad Engine (on-demand video ad scripts)",
    childSkills: () => ["ad-script-writer", "meta-ad-restrictions-prep", "generic-language-killer (polish pass)"],
    docs: () => [
      { docType: "ad_scripts_extra", filename: "01_more_scripts.md", title: "More Video Ad Scripts", description: "An ON-DEMAND batch of NEW full-length video ad scripts (30-90s spoken, ~60s ideal), written word for word: hook, body, CTA, each headed by sub-avatar, angle, format, hook archetype, awareness level, and destination. THE GENERATION REQUEST (how many, and any angle or format focus) is in the REVISION FEEDBACK section: follow it exactly. The request may carry AWARENESS LEVEL, AUDIENCE (sub-avatar(s) from the approved ICP doc), and OFFER: obey all three, choosing the hook archetype and format that fit that avatar at that awareness stage. Angles come from the approved Campaign Plan's angle matrix, extended with fresh buying reasons where needed. Never duplicate an existing script's angle-hook pairing: the batch must pass the hook-swap test against the approved scripts too OUTPUT FORMAT: each piece is its OWN unit: start each with a # title line and separate every piece from the next with a line containing exactly <!-- SPLIT --> (the app files each piece as its own card on the content board). No batch-level intro or summary sections: the pieces ARE the deliverable." },
    ],
    extraInstructions: (ft) =>
      `ONE AD, ONE ANGLE. Every destination is ${ft === "webinar" ? "[REGISTRATION LINK]" : "[VSL LINK]"}. REAL PROOF ONLY with [PROOF: ...] placeholders. COMPLIANCE GATE for regulated niches. Hooks follow the ad-script-system hook bank: statements over questions, the market's exact self-descriptions, specificity over adjectives. Read every script aloud: contractions, no AI cadence, no em dashes anywhere.`,
  },

  more_content_ig: {
    type: "more_content_ig",
    label: "Instagram Content",
    requires: "ads",
    motherStep: "Content Engine (Instagram reels)",
    childSkills: () => ["reel-scripter", "content-repurposer", "organic-carousel", "generic-language-killer (polish pass)"],
    docs: () => [
      { docType: "content_ig_extra", filename: "01_ig_content.md", title: "Instagram Reel Scripts", description: "An ON-DEMAND batch of Instagram reel scripts for the client's organic content. THE GENERATION REQUEST (how many, plus any topic or angle direction) is in the REVISION FEEDBACK section: follow it exactly. The request may carry a FUNNEL STAGE (top of funnel = broad reach and identity hooks; middle = value and mechanism; bottom = proof, offer, and objection-killers) and an AUDIENCE (a sub-avatar from the approved ICP doc) and an OFFER (from the approved Offers doc): obey all three, aiming every hook at that avatar's named pains, desires, and limiting beliefs from the research. If the research is thin on a named sub-avatar, RESEARCH THEM FIRST with web search (day-to-day, hobbies, fears, desires, how they talk) before writing a word. EVERY REEL FOLLOWS THE HOUSE TALKING-HEAD STRUCTURE from the PROVEN CONTENT ASSETS section of the research (pattern interrupt, hook, mind-read, twist tease, CTA before payoff, payoff, closing CTA with comment keyword), written word for word per beat with on-screen text notes. OUTPUT TAGGING: each piece's # title line is IMMEDIATELY followed by a line 'Stage: TOF' or 'Stage: MOF' or 'Stage: BOF' classifying that piece (the app renders it as a tag on the card); classify honestly even in a mixed batch. Hooks come from or extend the VIRAL HOOK BANK in that section: never invent cold when proven hooks exist. If a Competitor Content Intel document exists in the approved docs, model its winning hook styles and fill the gaps its angle suggestions name. CTA fits the funnel (comment keyword or link in bio to [VSL LINK] / [COMMUNITY LINK]) plus caption with hashtag set. The talking-head scripts in the research are the FLOOR: your reels must beat them, and if your output would read the same without having read them you have failed OUTPUT FORMAT: each piece is its OWN unit: start each with a # title line and separate every piece from the next with a line containing exactly <!-- SPLIT --> (the app files each piece as its own card on the content board). No batch-level intro or summary sections: the pieces ARE the deliverable." },
    ],
    extraInstructions: () =>
      "Organic content, not ads: the job is watch time and saves, then the soft CTA. Hooks in the market's own words from the research verbatims. The client's voice from the approved brand doc, contractions, no AI cadence, no em dashes anywhere. COMPLIANCE GATE applies to organic too for regulated niches.",
  },
  more_content_yt: {
    type: "more_content_yt",
    label: "YouTube Content",
    requires: "ads",
    motherStep: "Content Engine (YouTube long-form)",
    childSkills: () => ["youtube-script", "content-repurposer", "generic-language-killer (polish pass)"],
    docs: () => [
      { docType: "content_yt_extra", filename: "01_yt_content.md", title: "YouTube Scripts", description: "An ON-DEMAND batch of long-form YouTube scripts per the youtube-script skill. THE GENERATION REQUEST (how many, plus topic direction or a chosen outlier) is in the REVISION FEEDBACK section. The request may carry a FUNNEL STAGE (top of funnel = broad-pull lifestyle/mistakes/journey formats; middle = value-dense mechanism breakdowns; bottom = case studies and proof) and an AUDIENCE (a sub-avatar from the approved ICP doc) and an OFFER: obey all three, and if the research is thin on a named sub-avatar, research them with web search before scripting. START from the YOUTUBE PACKAGING list in the PROVEN CONTENT ASSETS section of the research and any Competitor Content Intel document: pick or extend those packages before inventing new ones. EACH VIDEO IS ITS OWN DOCUMENT and follows THIS EXACT STRUCTURE, nothing more: the # title IS the video title; then a line 'Stage: TOF' or 'Stage: MOF' or 'Stage: BOF' classifying the video (the app renders it as a tag); then SUMMARY (2-3 lines, what the video is and why it will pull); then PACKAGING (5 title variations ranked, chosen first + a one-or-two-line thumbnail brief); then RECORDING STANDARDS (short bullets: assets needed, filming style, pace); then STRUCTURE (the beat list, one line per beat); then SCRIPT (the 4-beat hook word for word, the body written out story-arc by story-arc, the CTA). THE CTA IS ALWAYS a click-the-link-below line (join the free community / learn more at the link): NEVER a comment-keyword CTA on YouTube. OUTPUT FORMAT: separate every video from the next with a line containing exactly <!-- SPLIT -->. No audits, no meta sections" },
    ],
    extraInstructions: () =>
      "The authority is always the CLIENT's, never the agency's. Real proof only with [PROOF: ...] placeholders. Voice from the approved brand doc. No generic openers: delete 'hey guys welcome back' shapes on sight. COMPLIANCE GATE applies for regulated niches. No em dashes anywhere.",
  },
  more_emails: {
    type: "more_emails",
    label: "Email Copy",
    requires: "ads",
    motherStep: "Email Engine (on-demand email copy)",
    childSkills: () => ["email-campaign-writer", "pre-call-email-writer", "generic-language-killer (polish pass)"],
    docs: () => [
      { docType: "emails_extra", filename: "01_email_copy.md", title: "Email Copy", description: "ON-DEMAND email copy: a broadcast, a promo push, a re-engagement blast, or a mini-sequence. THE GENERATION REQUEST (what kind, how many, what occasion or offer) is in the REVISION FEEDBACK section: follow it exactly. The request may name an AUDIENCE (a sub-avatar from the approved ICP doc) and an OFFER (from the approved Offers doc: the paid community, the high ticket program): pull that offer's real pricing, promise, and guarantee from the approved docs and aim every pain, desire, and limiting-belief line at that avatar specifically. Every email follows the cc-email-swipe-style framework skeleton and block layout TO THE LETTER: Send / Subject / Preview text each on its own line, {{ subscriber.first_name }} verbatim, ONE CTA per email (always [VSL LINK] unless the request says otherwise), 'To your success,' sign-off with a fresh topic-matched nickname in quotes, mandatory P.S., bold/italic/<u>underline</u> formatting density, community asset pointers where value beats live IF THE REQUEST ASKS FOR SMS VERSIONS: after each email, add an 'SMS:' block with the matching GHL text message ({{contact.first_name}} verbatim, under 320 characters, one link max) OUTPUT FORMAT: the whole request is ONE document (a sequence stays together). The document's # title names the campaign, not the mechanics: 'Cash Injection Campaign', 'Webinar Post-Booking Sequence', 'March Re-Engagement Blast'." },
    ],
    extraInstructions: () =>
      "ConvertKit format, swipe-file style contract, one core idea per email. Proof anchors from the approved docs or [PROOF: ...]. Casing per the ICP age range. No em dashes anywhere.",
  },
  more_skool: {
    type: "more_skool",
    label: "Skool Posts",
    requires: "ads",
    motherStep: "Skool Engine (community posts)",
    childSkills: () => ["skool-community-builder", "free-community-pipeline", "generic-language-killer (polish pass)"],
    docs: () => [
      { docType: "skool_extra", filename: "01_skool_posts.md", title: "Skool Posts", description: "An ON-DEMAND batch of Skool community posts for the client's FREE community. THE GENERATION REQUEST (how many, plus any focus) is in the REVISION FEEDBACK section. MODEL THE SKOOL POSTS in the PROVEN CONTENT ASSETS section of the research (proven post copy + DM workflows for this exact market): extend those patterns, never start cold. Mix per batch unless directed otherwise: value posts (one insight from the course outline taught in plain language), engagement posts (a question the avatar cannot scroll past), win/proof posts (framed from real results or [PROOF: ...]), and DM-trigger posts ('comment X and I'll send you Y' with the exact DM workflow that follows: keyword, first message, qualification exchange, booking push to [VSL LINK]). Each post: title, full body, and its purpose labeled OUTPUT FORMAT: each piece is its OWN unit: start each with a # title line and separate every piece from the next with a line containing exactly <!-- SPLIT --> (the app files each piece as its own card on the content board). No batch-level intro or summary sections: the pieces ARE the deliverable." },
    ],
    extraInstructions: () =>
      "Posts reference the community's real pinned content and level names from the approved Skool docs. The client's voice, casual and native to Skool. Every DM workflow ends at the VSL page. No em dashes anywhere.",
  },

  content_intel: {
    type: "content_intel",
    label: "Competitor Intel",
    requires: "ads",
    motherStep: "Intel Engine (competitor reel analysis)",
    childSkills: () => ["reel-scripter (for hook vocabulary)", "generic-language-killer"],
    docs: () => [
      { docType: "content_intel_extra", filename: "01_competitor_intel.md", title: "Competitor Content Intel", description: "A competitor content intelligence report covering BOTH Instagram and YouTube. PROCESS: (1) Determine the sources: THE GENERATION REQUEST in the REVISION FEEDBACK section lists INSTAGRAM accounts and/or YOUTUBE channels to mine; if it lists neither, extract competitor handles from the client's onboarding competitors document. (2) SCRAPE + TRANSCRIBE. Instagram: run 'python3 /Users/anshjeetsingh/voice-mining/scripts/ig-scrape.py --accounts <handle1> <handle2> ... --limit <N> --out ./staging' (APIFY_TOKEN and ELEVENLABS_API_KEY load from the repo .env automatically). YouTube: run 'python3 /Users/anshjeetsingh/voice-mining/scripts/yt-scrape.py --channels <@handle1> <@handle2> ... --limit <N> --out ./staging' (YOUTUBE_API_KEY loads from the repo .env; it pulls each channel's latest long-form videos with stats and captions when available). If the requests package is missing run pip3 install requests. Run BOTH scrapers when both platforms have sources. Default depth is 10 per source unless the request says otherwise: for Instagram that blends the account's TOP performers with its NEWEST posts (the scraper's ledger dedupes reels already mined, so re-runs naturally pull fresh content); for YouTube pull the latest long-form videos and go wider freely (the Data API is effectively free). (2b) ALWAYS AIM FOR AT LEAST 10 SOURCES ACROSS PLATFORMS. If the request plus onboarding yield fewer, DISCOVER more: pull competitor names and channels from the research report's competitor intel section, then use web search to find the niche's biggest Instagram reel accounts and YouTube channels; verify each handle resolves before scraping it, and note discovered sources in the report with where you found them. The same account does not need to exist on both platforms. (3) Read the staged batch JSON files they write. (4) ANALYZE every piece: score relevance to THIS client's niche 1-10 (10 = exact topics, 7-9 adjacent same-audience, below 7 = discard from the report but list in a one-line rejects table); for every keeper with a transcript, split it VERBATIM into Hook / Beat 1..N / CTA with a one-phrase note per section on what the beat is doing ('names the pain', 'FOMO close'); for YouTube videos WITHOUT captions, analyze the packaging instead: sections become Title / Description hooks, and the note explains the packaging play; tag each piece with a hookStyle from [problem-promise, contrarian-claim, list-tease, demo-first, story-frame, data-shock, identity-call, other]. (5) The report: a summary dashboard section first (reach by source table, hook-style leaderboard by combined views, the 3 biggest patterns worth copying, split observations by platform where they differ), then one section per keeper (source, platform, views/likes/comments, sectioned transcript or packaging analysis, and an ANGLE SUGGESTION: an honest content angle for THIS client that exploits a gap the competitor left open, mapped to the client's offer and mechanism, never a copy of the piece). (6) END the document with a fenced json code block (```json) containing the structured data for the app's Competitor Desk: an array of piece objects, each {\"platform\": \"instagram\"|\"youtube\", \"account\", \"url\", \"views\", \"likes\", \"comments\", \"score\", \"date\", \"topic\", \"hookStyle\", \"caption\", \"sections\": [{\"label\", \"text\", \"note\"}], \"angle\"}. For YouTube pieces \"account\" is the channel handle and \"topic\" is the video title. Include ALL keepers, valid JSON, real numbers. This report is research: the transcripts are signal, never content to republish" },
    ],
    extraInstructions: () =>
      "Research discipline: verbatim transcript splits, real numbers, no invented views or engagement. The angle suggestions must connect to THIS client's approved offer and mechanism, not generic advice. Depth beats thrift: the operator wants maximum competitive data, so mine every source to the requested depth; just never loop the Instagram scraper beyond the per-account limit in a single run. No em dashes anywhere.",
  },
};

/** Stage order for gating and UI. */
export const STAGE_ORDER = ["foundation", "skool", "funnel", "emails", "ads"] as const;

/** On-demand engine job types: gated on ads approval, outside the chain. */
export const ON_DEMAND_TYPES = [
  "more_statics",
  "more_scripts",
  "more_content_ig",
  "more_content_yt",
  "more_emails",
  "more_skool",
  "content_intel",
] as const;

/** The docType -> title contract used to validate a worker's completion. */
export function stageContract(stageType: string, funnelType: FunnelType): Record<string, string> {
  const stage = STAGES[stageType];
  if (!stage) return {};
  return Object.fromEntries(stage.docs(funnelType).map((d) => [d.docType, d.title]));
}

/** docTypes that once existed in a stage's contract; swept like current ones. */
const RETIRED_DOC_TYPES: Record<string, string[]> = {
  ads: ["ad_angles", "ad_statics"],
};

/**
 * Every docType this stage can produce across ALL branches, plus retired
 * ones. Used to clean up stale documents when a contract changes or a
 * client switches funnel type.
 */
export function stageAllDocTypes(stageType: string): string[] {
  const stage = STAGES[stageType];
  if (!stage) return [];
  return Array.from(
    new Set([
      ...[...stage.docs("call"), ...stage.docs("webinar")].map((d) => d.docType),
      ...(RETIRED_DOC_TYPES[stageType] ?? []),
    ])
  );
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
