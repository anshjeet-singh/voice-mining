import { describe, expect, it } from "vitest";
import { ON_DEMAND_TYPES, STAGE_ORDER, STAGES, stageAllDocTypes, stageContract, stagePromptSpec } from "./stages";

describe("stage registry", () => {
  it("keeps the lean onboarding order and gating chain (funnel dropped)", () => {
    expect(STAGE_ORDER).toEqual(["foundation", "skool", "emails", "ads"]);
    expect(STAGES.foundation.requires).toBeNull();
    expect(STAGES.skool.requires).toBe("foundation");
    // Funnel copy is no longer in the required chain: emails gate on skool
    expect(STAGES.emails.requires).toBe("skool");
    expect(STAGES.ads.requires).toBe("emails");
  });

  it("slims the onboarding ads stage to 10 community statics", () => {
    const call = stagePromptSpec("ads", "call")!;
    // One doc: 10 rendered statics that sell the free-community join
    expect(call.outputs.map((o) => o.docType)).toEqual(["ad_statics"]);
    expect(call.outputs[0].description).toContain("EXACTLY 10 NATIVE STATIC ADS");
    expect(call.outputs[0].description).toContain("FULLY RENDERED");
    expect(call.outputs[0].description).toContain("[COMMUNITY LINK]");
    expect(call.outputs[0].description).toContain("./assets/");
    expect(call.outputs[0].description).toContain("VISUAL QA LOOP");
    expect(call.outputs[0].description).toContain("REBUILD ONLY");
    expect(call.extraInstructions).toContain("[COMMUNITY LINK]");
    expect(call.childSkills.join()).toContain("static-ad-builder");
    // The old full-batch docTypes are retired and still get swept
    expect(stageAllDocTypes("ads")).toContain("ad_scripts");
    expect(stageAllDocTypes("ads")).toContain("ad_campaign_plan");
  });

  it("branches the funnel contract on funnel type", () => {
    const call = stagePromptSpec("funnel", "call")!;
    const webinar = stagePromptSpec("funnel", "webinar")!;
    // Call funnel: 2 docs. Funnel Structure (both pages) + Video Scripts (10 scripts)
    expect(call.outputs.map((o) => o.docType)).toEqual(["funnel_structure", "video_scripts"]);
    expect(call.outputs[1].description).toContain("EXACTLY 10");
    expect(call.outputs[1].description).toContain("script 1 the VSL");
    expect(call.outputs[1].description).toContain("YOU choose the 8 breakout topics");
    // Webinar funnel: deck + structure + scripts
    expect(webinar.outputs.map((o) => o.docType)).toEqual(["funnel_core", "funnel_structure", "video_scripts"]);
    expect(webinar.outputs[0].filename).toBe("01_webinar_deck.md");
    expect(call.childSkills.join()).toContain("vsl-and-sales-page-writer");
    expect(webinar.childSkills.join()).toContain("webinar-deck-builder");
    // The copy quality bar is enforced in the stage instructions
    expect(call.extraInstructions).toContain("ATTENTION");
    expect(call.extraInstructions).toContain("NEVER a diagnosis");
  });

  it("defines validation contracts for every stage", () => {
    expect(Object.keys(stageContract("foundation", "call"))).toEqual([
      "icp_snapshot",
      "offers",
      "brand_positioning",
      "course_outline",
    ]);
    expect(Object.keys(stageContract("skool", "call"))).toEqual([
      "skool_free_community",
      "skool_paid_community",
    ]);
    // Onboarding emails are just the community nurture + SMS now
    expect(Object.keys(stageContract("emails", "webinar"))).toEqual(["email_sequence_14day", "sms_set"]);
    expect(Object.keys(stageContract("emails", "call"))).toEqual(["email_sequence_14day", "sms_set"]);
    expect(stageContract("nonsense", "call")).toEqual({});
    expect(stagePromptSpec("nonsense", "call")).toBeNull();
  });

  it("holds the lean Skool community spec", () => {
    const spec = stagePromptSpec("skool", "call")!;
    const free = spec.outputs.find((o) => o.docType === "skool_free_community")!.description;
    // The exact structure: green-tick unlocks, 3 lead magnets, 2 About variations, 2 pinned posts
    expect(free).toContain("GREEN-TICK");
    expect(free).toContain("THREE named lead magnets");
    expect(free).toContain("under 1000 characters");
    expect(free).toContain("EXACTLY TWO");
    expect(free).toContain("[COMMUNITY NAME]");
    // Banned noise is explicitly forbidden
    expect(free).toContain("banned");
    expect(spec.extraInstructions).toContain("LESS IS MORE");
    // Gamification names identical across communities
    expect(spec.extraInstructions).toContain("IDENTICAL across free and paid");
  });

  it("keeps onboarding emails to the community nurture set and defers the rest", () => {
    const call = stagePromptSpec("emails", "call")!;
    const webinar = stagePromptSpec("emails", "webinar")!;
    // Both funnel types: 14-day community sequence + SMS only
    expect(call.outputs.map((o) => o.docType)).toEqual(["email_sequence_14day", "sms_set"]);
    expect(webinar.outputs.map((o) => o.docType)).toEqual(["email_sequence_14day", "sms_set"]);
    // Exactly two community CTAs, the locked placeholder, and the three lead magnets
    expect(call.outputs[0].description).toContain("ONLY TWO calls to action");
    expect(call.outputs[0].description).toContain("weekly live Q&A");
    expect(call.outputs[0].description).toContain("[COMMUNITY NAME]");
    expect(call.outputs[0].description).toContain("THREE named free lead magnets");
    // The funnel-specific sequences are explicitly deferred to on-demand
    expect(call.extraInstructions).toContain("generated on demand later");
    // Quality bar still enforced
    expect(call.extraInstructions).toContain("MODEL THE REFERENCE EMAILS");
    expect(call.extraInstructions).toContain("standalone value");
  });

  it("carries the 14-day community sequence and link placeholders in the emails stage", () => {
    const spec = stagePromptSpec("emails", "call")!;
    expect(spec.outputs[0].description).toContain("FREE Skool community");
    expect(spec.extraInstructions).toContain("THE CTA DESTINATION IS ALWAYS [VSL LINK]");
    expect(spec.extraInstructions).toContain("never emit a separate [BOOKING LINK]");
    expect(spec.outputs[0].description).toContain("14-day");
  });

  it("mines both platforms in the content intel contract", () => {
    const spec = stagePromptSpec("content_intel", "call")!;
    const desc = spec.outputs[0].description;
    // Both scrapers, both platforms
    expect(desc).toContain("BOTH Instagram and YouTube");
    expect(desc).toContain("ig-scrape.py");
    expect(desc).toContain("yt-scrape.py");
    expect(desc).toContain("YOUTUBE_API_KEY");
    // Structured desk data carries a platform tag
    expect(desc).toContain('"platform": "instagram"|"youtube"');
    // Captionless YouTube videos fall back to packaging analysis, never fabricated transcripts
    expect(desc).toContain("WITHOUT captions");
    // Deep mining: 10 per source, top + newest blend, and discovery to 10+ competitors
    expect(desc).toContain("Default depth is 10 per source");
    expect(desc).toContain("AT LEAST 10 SOURCES");
    expect(desc).toContain("web search");
    expect(spec.extraInstructions).toContain("no invented views");
  });

  it("defines the landing pages engine as a GHL-pasteable, offer-routed, mobile-first contract", () => {
    const spec = stagePromptSpec("more_landers", "call")!;
    const desc = spec.outputs[0].description;
    expect(spec.outputs[0].docType).toBe("lander_extra");
    expect(desc).toContain("GOHIGHLEVEL");
    expect(desc).toContain("PAGE TYPE");
    expect(desc).toContain("[LAYOUT]");
    expect(desc).toContain("MOBILE-FIRST");
    // Also builds the page for real: a self-contained responsive HTML block
    expect(desc).toContain("```html");
    expect(desc).toContain("<!doctype html>");
    expect(desc).toContain("@media");
    // Offer routing carries through to the page CTA
    expect(desc).toContain("HIGH TICKET -> [VSL LINK]");
    // One doc per page via SPLIT so each page files as its own card
    expect(desc).toContain("<!-- SPLIT -->");
    expect(spec.childSkills.join()).toContain("vsl-and-sales-page-writer");
    // On-demand, gated on ads
    expect(STAGES.more_landers.requires).toBe("ads");
    expect((ON_DEMAND_TYPES as readonly string[]).includes("more_landers")).toBe(true);
  });

  it("mandates a three-rung offer ladder and rich sub-avatars in the ICP/offers contracts", () => {
    const found = stagePromptSpec("foundation", "call")!;
    const icp = found.outputs.find((o) => o.docType === "icp_snapshot")!.description;
    const offers = found.outputs.find((o) => o.docType === "offers")!.description;
    // Sub-avatars parse as name + who-they-are descriptor
    expect(icp).toContain("## Sub-Avatars");
    expect(icp).toContain("who they actually are");
    // Offers are exactly the three-rung ladder in order
    expect(offers).toContain("Free Offer");
    expect(offers).toContain("Low/Mid Ticket Offer");
    expect(offers).toContain("High Ticket Offer");
  });

  it("routes the promoted offer to the right destination in the skool contract", () => {
    const skool = stagePromptSpec("more_skool", "call")!.outputs[0].description;
    expect(skool).toContain("HIGH TICKET -> [VSL LINK]");
    expect(skool).toContain("PAID community -> the paid community join link");
    expect(skool).toContain("OFFER");
  });

  it("honors REBUILD ONLY on both static ad contracts", () => {
    // Rebuild-rejected must never regenerate the batch: exact filenames, listed ads only
    expect(stagePromptSpec("more_statics", "call")!.outputs[0].description).toContain("REBUILD ONLY");
    expect(stagePromptSpec("ads", "call")!.outputs[0].description).toContain("REBUILD ONLY");
    expect(stagePromptSpec("more_statics", "call")!.outputs[0].description).toContain("AWARENESS LEVEL");
    expect(stagePromptSpec("more_scripts", "call")!.outputs[0].description).toContain("AWARENESS LEVEL");
  });

  it("routes funnel stage, audience, and offer selections into the content contracts", () => {
    const ig = stagePromptSpec("more_content_ig", "call")!.outputs[0].description;
    const yt = stagePromptSpec("more_content_yt", "call")!.outputs[0].description;
    const em = stagePromptSpec("more_emails", "call")!.outputs[0].description;
    expect(ig).toContain("FUNNEL STAGE");
    expect(ig).toContain("AUDIENCE");
    expect(ig).toContain("RESEARCH THEM FIRST");
    expect(yt).toContain("FUNNEL STAGE");
    expect(em).toContain("OFFER");
  });
});
