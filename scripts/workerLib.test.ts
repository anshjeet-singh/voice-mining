import { describe, expect, it } from "vitest";
import {
  buildDocPrompt,
  parseCraftLessons,
  parseDocOutput,
  type ClaimedJob,
  type StageSpec,
} from "./workerLib";

const funnelStage: StageSpec = {
  label: "Funnel Copy",
  motherStep: "Steps 3 and 4 (Funnel core + pages & videos)",
  childSkills: ["vsl-and-sales-page-writer (BIG_IDEA then VSL)", "funnel-page-builder"],
  outputs: [
    { docType: "funnel_structure", filename: "01_funnel_structure.md", title: "Funnel Structure", description: "Complete final page copy. The HEADLINE section alone gives 5-7 ranked options" },
    { docType: "video_scripts", filename: "02_video_scripts.md", title: "Video Scripts", description: "EXACTLY 10 full scripts" },
  ],
  extraInstructions: "Eyebrow is ONLY a pure callout.",
};

const job: ClaimedJob = {
  id: 7,
  type: "funnel",
  stage: funnelStage,
  client: { name: "Trent", niche: "business funding", funnelType: "call", pricePoint: "$7k" },
  onboardingDocs: [{ title: "Voice", docType: "voice_transcript", content: "I started in 2019 when..." }],
  approvedDocs: [{ title: "Offers", docType: "offers", content: "Core offer: $7k DFY build" }],
  research: "PAIN POINTS:\n- banks keep denying me",
  lessons: ["Trent prefers direct copy"],
  feedback: "",
};

describe("buildDocPrompt", () => {
  it("focuses one deliverable and names the parallel siblings", () => {
    const p = buildDocPrompt(job, funnelStage.outputs[0], { skillsDir: "/skills", learningsDir: "/learnings", frameworksDir: "/frameworks" });
    expect(p).toContain("exactly ONE deliverable: Funnel Structure");
    expect(p).toContain("Video Scripts (02_video_scripts.md)");
    expect(p).toContain("Write 01_funnel_structure.md");
    expect(p).not.toContain("Write 02_video_scripts.md");
  });

  it("carries context, mandatory reading, and client-facing rules", () => {
    const p = buildDocPrompt(job, funnelStage.outputs[1], { skillsDir: "/skills", learningsDir: "/learnings", frameworksDir: "/frameworks" });
    expect(p).toContain("Trent");
    expect(p).toContain("banks keep denying me");
    expect(p).toContain("Core offer: $7k DFY build");
    expect(p).toContain("Trent prefers direct copy");
    expect(p).toContain("/skills/client-onboarding-orchestrator/SKILL.md");
    expect(p).toContain("/frameworks");
    expect(p).toContain("CLIENT-FACING, FINAL deliverable");
    expect(p).toContain("NO analysis sections");
    expect(p).toContain("MINIMUM, not the ceiling");
    expect(p).not.toContain("REVISION FEEDBACK");
  });

  it("includes rejection feedback on regeneration", () => {
    const p = buildDocPrompt(
      { ...job, feedback: "The headline reads like a parable, fix it" },
      funnelStage.outputs[0],
      { skillsDir: "/skills", learningsDir: "/learnings" }
    );
    expect(p).toContain("REVISION FEEDBACK");
    expect(p).toContain("reads like a parable");
  });
});

describe("parseDocOutput", () => {
  const spec = funnelStage.outputs[0];

  it("extracts the deliverable and client lessons", () => {
    const out = parseDocOutput(
      {
        "01_funnel_structure.md": "# Funnel Structure\n".padEnd(80, "x"),
        "client_lessons.md": "- Trent hates jargon",
      },
      spec
    );
    expect(out.content).toContain("Funnel Structure");
    expect(out.clientLessons).toEqual(["Trent hates jargon"]);
  });

  it("throws when the deliverable is missing or too short", () => {
    expect(() => parseDocOutput({ "01_funnel_structure.md": "hi" }, spec)).toThrow(/01_funnel_structure/);
    expect(() => parseDocOutput({}, spec)).toThrow(/01_funnel_structure/);
  });

  it("tolerates absent lesson files", () => {
    const out = parseDocOutput({ "01_funnel_structure.md": "# ok\n".padEnd(80, "x") }, spec);
    expect(out.clientLessons).toEqual([]);
    expect(out.craftLessonsRaw).toBe("");
  });
});

describe("parseCraftLessons", () => {
  it("splits '## skill:' sections into per-skill lesson bodies", () => {
    const parsed = parseCraftLessons("## skill: vsl-that-converts\n- Flag the big idea at the top");
    expect(parsed).toEqual([{ skill: "vsl-that-converts", lessons: "- Flag the big idea at the top" }]);
  });

  it("returns empty for empty or 'none' content", () => {
    expect(parseCraftLessons("")).toEqual([]);
    expect(parseCraftLessons("none")).toEqual([]);
  });

  it("sanitizes skill names to safe filenames", () => {
    const parsed = parseCraftLessons("## skill: ../../etc/passwd\n- evil");
    expect(parsed[0].skill).toBe("etc-passwd");
  });
});
