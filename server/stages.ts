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
            { docType: "email_sequence_14day", filename: "01_email_sequence_14day.md", title: "14-Day Community Sequence", description: "The 14-day email sequence sent to every FREE Skool community joiner, driving them to book an onboarding call (CTA is the VSL/booking page). One email per day, each with subject line, preview text, full body, and sign-off" },
            { docType: "email_postbooking", filename: "02_postbooking_sequence.md", title: "Post-Booking Show-Up Sequence", description: "Booking to show-up sequence per the pre-call-email-writer skill and the emails-and-booking framework: instant confirmation email (what happens next, calendar add, the call-confirmed video at [CALL CONFIRMED VIDEO]), then value-loaded emails between booking and the call (a client proof story, the mechanism in 60 seconds, what-to-bring homework that invests them, who-this-is-for qualification), plus 24h and 3h reminders. Every email carries standalone value, never a bare 'don't forget'. Each with subject line, preview text, full body, send timing relative to booking or call time" },
            { docType: "email_noshow_followup", filename: "03_noshow_and_followup.md", title: "No-Show + Post-Call Follow-Up", description: "Two labeled tracks: (1) no-show recovery, 3 emails that rebook without shaming (missed-you + easy rebook, cost-of-the-unsolved-problem with a proof story, last-touch takeaway), and (2) post-call follow-up for prospects who didn't close on the call, 3 emails (recap of THEIR situation and the offer, objection reframe with proof, honest final follow-up). Each with subject line, preview text, full body, send timing" },
            { docType: "sms_set", filename: "04_sms_set.md", title: "SMS Set", description: "The companion GHL SMS set mirroring the email sequences: booking confirmation, pre-call value nudge, 24h / 3h / 15min reminders, no-show rebook, post-call follow-up. Under 320 characters each, one link max, one CTA" },
          ],
    extraInstructions: (ft) =>
      `This client runs a ${ft === "webinar" ? "WEBINAR funnel: the sequence set is community nurture, pre-webinar show-up, post-webinar replay and close, SMS" : "CALL funnel (VSL into booked call): the sequence set is community nurture, post-booking show-up, no-show and post-call recovery, SMS"}. THE STYLE CONTRACT IS THE cc-email-swipe-style FRAMEWORK: every email follows its skeleton exactly. Emails ship in ConvertKit: first name is ALWAYS the merge tag {{ subscriber.first_name }}, verbatim. Every email ends "To your success," then the sender name with a topic-matched nickname in quotes that CHANGES per email (e.g. Trent "0%" Kus on the funding email), then a mandatory P.S. that opens tomorrow's loop, restates the CTA with real scarcity, or drops one proof point. ONE CTA per email around ONE core idea; the same destination may repeat up to 3 times, never a second action. Formatting is part of the copy: markdown bold on pains, numbers, mechanism names, and commands; italics on reframes and quoted speech; <u>underline</u> on the one must-hear sentence per email; a formatting touch every 2 to 3 lines, 1 to 2 line paragraphs, never a wall. MODEL THE REFERENCE EMAILS in the pre-call-email-writer and email-campaign-writer skills beat for beat. Quality bar: suby-email-machine and emails-and-booking frameworks (subjects earn the open with curiosity or specificity, never 'Reminder:'), reminder emails ALWAYS deliver standalone value alongside logistics, the arc follows the frameworks INDEX email routing, and P.S. loops must actually connect across the sequence. Use [BOOKING LINK], [VSL LINK], [COMMUNITY LINK], [CALL CONFIRMED VIDEO], and [PROOF: ...] placeholders, never invented URLs or fabricated results. Emails reference the community's actual name and pinned content from the approved Skool docs and carry the core promise from the approved funnel docs word for word. SMS ships in GHL with {{contact.first_name}}, in the client's texting voice: contractions, no corporate tone, no emoji unless the client's voice material uses them.`,
  },
};

/** Stage order for gating and UI. */
export const STAGE_ORDER = ["foundation", "skool", "funnel", "emails"] as const;

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
