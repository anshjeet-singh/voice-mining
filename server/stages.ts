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
        ? ["pre-call-email-writer (adapted to the community joiner sequence)", "email-campaign-writer", "pre-webinar-email-writer", "post-webinar-email-writer"]
        : ["pre-call-email-writer", "email-campaign-writer"],
    docs: () => [
      { docType: "email_sequence_14day", filename: "01_email_sequence_14day.md", title: "14-Day Community Sequence", description: "The 14-day email sequence sent to every FREE Skool community joiner, driving them to book an onboarding call. One email per day, each with subject line, preview text, full body, and sign-off" },
      { docType: "sms_set", filename: "02_sms_set.md", title: "SMS Set", description: "The companion GHL SMS set: booking confirmation, pre-call nudge, 24h / 3h / 15min reminders, post-no-show rebook. Under 320 characters each, one link max, one CTA" },
    ],
    extraInstructions: () =>
      "The 14-day sequence is the agency's core play: someone joins the FREE community, then over 14 days the emails move them to book an onboarding call (the CTA is the VSL/booking page). Use [BOOKING LINK], [VSL LINK], and [COMMUNITY LINK] placeholders, never invented URLs. Emails must reference the community's actual name and pinned content from the approved Skool docs, and carry the core promise from the approved funnel docs word for word. SMS in the client's texting voice: contractions, first name, no corporate tone, no emoji unless the client's voice material uses them.",
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
