import { describe, expect, it } from "vitest";
import {
  buildStagePrompt,
  parseCraftLessons,
  parseStageOutputs,
  type ClaimedJob,
  type StageSpec,
} from "./workerLib";

const foundationStage: StageSpec = {
  label: "Foundation Documents",
  motherStep: "Step 1 (Foundation docs)",
  childSkills: ["avatar-extraction", "offer-architecture"],
  outputs: [
    { docType: "icp_snapshot", filename: "01_icp_snapshot.md", title: "ICP Snapshot", description: "The avatar" },
    { docType: "offers", filename: "02_offers.md", title: "Offers", description: "The offers" },
    { docType: "brand_positioning", filename: "03_brand_positioning.md", title: "Brand & Positioning", description: "Positioning" },
    { docType: "course_outline", filename: "04_course_outline.md", title: "Course Outline", description: "Course" },
  ],
  extraInstructions: "Ground every document in the client's actual language.",
};

const skoolStage: StageSpec = {
  label: "Skool Setup",
  motherStep: "Step 2 (Skool community build)",
  childSkills: ["skool-community-builder"],
  outputs: [
    { docType: "skool_free_community", filename: "01_free_community.md", title: "Free Community", description: "Free community assets" },
    { docType: "skool_paid_community", filename: "02_paid_community.md", title: "Paid Community", description: "Paid community assets" },
  ],
  extraInstructions: "Build BOTH communities.",
};

const job: ClaimedJob = {
  id: 7,
  type: "foundation",
  stage: foundationStage,
  client: { name: "Ibby", niche: "business credit funding", funnelType: "call", pricePoint: "$7k" },
  onboardingDocs: [
    { title: "DWY Ibby Voice", docType: "voice_transcript", content: "I started in 2019 when..." },
  ],
  approvedDocs: [],
  research: "PAIN POINTS:\n- banks keep denying me",
  lessons: ["Ibby prefers direct, no-fluff copy"],
  feedback: "",
};

describe("buildStagePrompt", () => {
  it("includes client meta, onboarding, research, and the stage's output contract", () => {
    const p = buildStagePrompt(job, { skillsDir: "/skills", learningsDir: "/learnings" });
    expect(p).toContain("Ibby");
    expect(p).toContain("business credit funding");
    expect(p).toContain("I started in 2019");
    expect(p).toContain("banks keep denying me");
    expect(p).toContain("Ibby prefers direct, no-fluff copy");
    expect(p).toContain("/skills");
    expect(p).toContain("/learnings");
    expect(p).toContain("Step 1 (Foundation docs)");
    expect(p).toContain("avatar-extraction");
    expect(p).toContain("01_icp_snapshot.md");
    expect(p).toContain("04_course_outline.md");
    expect(p).not.toContain("REVISION FEEDBACK");
    expect(p).not.toContain("APPROVED DOCUMENTS");
  });

  it("includes approved earlier-stage docs and feedback for later stages", () => {
    const p = buildStagePrompt(
      {
        ...job,
        type: "skool",
        stage: skoolStage,
        approvedDocs: [{ title: "Offers", docType: "offers", content: "Core offer: $7k DFY community build" }],
        feedback: "The free community name is too generic",
      },
      { skillsDir: "/skills", learningsDir: "/learnings" }
    );
    expect(p).toContain("Step 2 (Skool community build)");
    expect(p).toContain("APPROVED DOCUMENTS FROM EARLIER STAGES");
    expect(p).toContain("Core offer: $7k DFY community build");
    expect(p).toContain("REVISION FEEDBACK");
    expect(p).toContain("too generic");
    expect(p).toContain("01_free_community.md");
    expect(p).toContain("02_paid_community.md");
    expect(p).toContain("Build BOTH communities.");
  });
});

describe("parseStageOutputs", () => {
  const good = {
    "01_free_community.md": "# Free Community\n".padEnd(80, "x"),
    "02_paid_community.md": "# Paid Community\n".padEnd(80, "x"),
    "client_lessons.md": "- Ibby hates jargon",
  };

  it("maps files to doc types per the stage spec and extracts client lessons", () => {
    const out = parseStageOutputs(good, skoolStage.outputs);
    expect(Object.keys(out.docs)).toEqual(["skool_free_community", "skool_paid_community"]);
    expect(out.docs.skool_free_community).toContain("Free Community");
    expect(out.clientLessons).toEqual(["Ibby hates jargon"]);
  });

  it("throws when a deliverable is missing or too short", () => {
    expect(() => parseStageOutputs({ ...good, "02_paid_community.md": "hi" }, skoolStage.outputs)).toThrow(
      /02_paid_community/
    );
    const { "01_free_community.md": _drop, ...missing } = good;
    expect(() => parseStageOutputs(missing, skoolStage.outputs)).toThrow(/01_free_community/);
  });

  it("tolerates absent lesson files", () => {
    const out = parseStageOutputs({ ...good, "client_lessons.md": undefined as never }, skoolStage.outputs);
    expect(out.clientLessons).toEqual([]);
  });
});

describe("parseCraftLessons", () => {
  it("splits '## skill:' sections into per-skill lesson bodies", () => {
    const raw = [
      "## skill: avatar-extraction",
      "- Ask for W2 vs 1099 split early",
      "",
      "## skill: offer-architecture",
      "- Anchor price against cost of inaction",
    ].join("\n");
    const parsed = parseCraftLessons(raw);
    expect(parsed).toEqual([
      { skill: "avatar-extraction", lessons: "- Ask for W2 vs 1099 split early" },
      { skill: "offer-architecture", lessons: "- Anchor price against cost of inaction" },
    ]);
  });

  it("returns empty for empty or 'none' content", () => {
    expect(parseCraftLessons("")).toEqual([]);
    expect(parseCraftLessons("none")).toEqual([]);
    expect(parseCraftLessons("No new craft lessons.")).toEqual([]);
  });

  it("sanitizes skill names to safe filenames", () => {
    const parsed = parseCraftLessons("## skill: ../../etc/passwd\n- evil");
    expect(parsed[0].skill).toBe("etc-passwd");
  });
});
