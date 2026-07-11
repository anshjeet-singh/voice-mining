import { describe, expect, it } from "vitest";
import { STAGE_ORDER, STAGES, stageAllDocTypes, stageContract, stagePromptSpec } from "./stages";

describe("stage registry", () => {
  it("keeps the mother skill's order and gating chain", () => {
    expect(STAGE_ORDER).toEqual(["foundation", "skool", "funnel", "emails", "ads"]);
    expect(STAGES.foundation.requires).toBeNull();
    expect(STAGES.skool.requires).toBe("foundation");
    expect(STAGES.funnel.requires).toBe("skool");
    expect(STAGES.emails.requires).toBe("funnel");
    expect(STAGES.ads.requires).toBe("emails");
  });

  it("defines the ads contract with the batch quality gates", () => {
    const call = stagePromptSpec("ads", "call")!;
    const webinar = stagePromptSpec("ads", "webinar")!;
    // Two docs: the full creative batch + the campaign plan (matrix absorbed)
    expect(call.outputs.map((o) => o.docType)).toEqual(["ad_scripts", "ad_campaign_plan"]);
    expect(call.outputs[0].description).toContain("15 NATIVE STATIC ADS");
    expect(call.outputs[0].description).toContain("FULLY RENDERED");
    expect(call.outputs[0].description).toContain("5 B-ROLL");
    expect(call.outputs[0].description).toContain("5 full-length video ad scripts");
    expect(call.outputs[0].description).toContain("reference-ads");
    expect(call.outputs[0].description).toContain("./assets/");
    expect(call.outputs[0].description).toContain("VISUAL QA LOOP");
    expect(call.outputs[1].description).toContain("ANGLE MATRIX");
    expect(call.outputs[1].description).toContain("Forester");
    expect(call.outputs[1].description).toContain("budget allocation");
    expect(call.extraInstructions).toContain("ONE AD, ONE ANGLE");
    expect(call.extraInstructions).toContain("[VSL LINK]");
    expect(webinar.extraInstructions).toContain("[REGISTRATION LINK]");
    expect(call.extraInstructions).toContain("COMPLIANCE GATE");
    expect(call.childSkills.join()).toContain("ad-script-writer");
    // Retired docTypes still get swept
    expect(stageAllDocTypes("ads")).toContain("ad_angles");
    expect(stageAllDocTypes("ads")).toContain("ad_statics");
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
    expect(Object.keys(stageContract("emails", "webinar"))).toEqual([
      "email_sequence_14day",
      "email_prewebinar",
      "email_postwebinar",
      "sms_set",
    ]);
    expect(Object.keys(stageContract("emails", "call"))).toEqual([
      "email_sequence_14day",
      "email_postbooking",
      "email_noshow_followup",
      "sms_set",
    ]);
    expect(stageContract("nonsense", "call")).toEqual({});
    expect(stagePromptSpec("nonsense", "call")).toBeNull();
  });

  it("branches the emails contract on funnel type with full sequence sets", () => {
    const call = stagePromptSpec("emails", "call")!;
    const webinar = stagePromptSpec("emails", "webinar")!;
    // Call funnel: post-booking show-up + no-show/post-call recovery exist and carry value rules
    expect(call.outputs.map((o) => o.docType)).toEqual([
      "email_sequence_14day",
      "email_postbooking",
      "email_noshow_followup",
      "sms_set",
    ]);
    expect(call.outputs[1].description).toContain("value-INTENSIVE");
    expect(call.outputs[1].description).toContain("FAQ email");
    expect(call.outputs[1].description).toContain("24h and 3h reminders");
    expect(call.outputs[0].description).toContain("named asset");
    expect(call.outputs[3].description).toContain("14-day community track");
    expect(call.outputs[2].description).toContain("no-show recovery");
    expect(call.outputs[2].description).toContain("post-call follow-up");
    // Webinar funnel: pre-webinar show-up + post-webinar replay/close
    expect(webinar.outputs.map((o) => o.docType)).toEqual([
      "email_sequence_14day",
      "email_prewebinar",
      "email_postwebinar",
      "sms_set",
    ]);
    expect(webinar.outputs[1].description).toContain("show-up");
    expect(webinar.outputs[2].description).toContain("replay");
    // Quality bar: reference emails + frameworks are mandatory
    expect(call.extraInstructions).toContain("MODEL THE REFERENCE EMAILS");
    expect(call.extraInstructions).toContain("suby-email-machine");
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
