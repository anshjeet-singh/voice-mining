import { describe, expect, it } from "vitest";
import { STAGE_ORDER, STAGES, stageContract, stagePromptSpec } from "./stages";

describe("stage registry", () => {
  it("keeps the mother skill's order and gating chain", () => {
    expect(STAGE_ORDER).toEqual(["foundation", "skool", "funnel", "emails"]);
    expect(STAGES.foundation.requires).toBeNull();
    expect(STAGES.skool.requires).toBe("foundation");
    expect(STAGES.funnel.requires).toBe("skool");
    expect(STAGES.emails.requires).toBe("funnel");
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
      "sms_set",
    ]);
    expect(stageContract("nonsense", "call")).toEqual({});
    expect(stagePromptSpec("nonsense", "call")).toBeNull();
  });

  it("carries the 14-day community sequence and link placeholders in the emails stage", () => {
    const spec = stagePromptSpec("emails", "call")!;
    expect(spec.extraInstructions).toContain("FREE community");
    expect(spec.extraInstructions).toContain("[BOOKING LINK]");
    expect(spec.outputs[0].description).toContain("14-day");
  });
});
