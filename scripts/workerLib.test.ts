import { describe, expect, it } from "vitest";
import {
  buildFoundationPrompt,
  parseCraftLessons,
  parseFoundationOutputs,
  type ClaimedJob,
} from "./workerLib";

const job: ClaimedJob = {
  id: 7,
  type: "foundation",
  client: { name: "Ibby", niche: "business credit funding", funnelType: "call", pricePoint: "$7k" },
  onboardingDocs: [
    { title: "DWY Ibby Voice", docType: "voice_transcript", content: "I started in 2019 when..." },
  ],
  research: "PAIN POINTS:\n- banks keep denying me",
  lessons: ["Ibby prefers direct, no-fluff copy"],
  feedback: "",
};

describe("buildFoundationPrompt", () => {
  it("includes client meta, onboarding, research, and output contract", () => {
    const p = buildFoundationPrompt(job, { skillsDir: "/skills", learningsDir: "/learnings" });
    expect(p).toContain("Ibby");
    expect(p).toContain("business credit funding");
    expect(p).toContain("call");
    expect(p).toContain("I started in 2019");
    expect(p).toContain("banks keep denying me");
    expect(p).toContain("Ibby prefers direct, no-fluff copy");
    expect(p).toContain("/skills");
    expect(p).toContain("/learnings");
    expect(p).toContain("01_icp_snapshot.md");
    expect(p).toContain("02_offers.md");
    expect(p).toContain("03_brand_positioning.md");
    expect(p).toContain("04_course_outline.md");
    expect(p).not.toContain("REVISION FEEDBACK");
  });

  it("includes rejection feedback when present", () => {
    const p = buildFoundationPrompt(
      { ...job, feedback: "ICP is too broad, narrow to W2 employees" },
      { skillsDir: "/skills", learningsDir: "/learnings" }
    );
    expect(p).toContain("REVISION FEEDBACK");
    expect(p).toContain("narrow to W2 employees");
  });
});

describe("parseFoundationOutputs", () => {
  const good = {
    "01_icp_snapshot.md": "# ICP Snapshot\n".padEnd(80, "x"),
    "02_offers.md": "# Offers\n".padEnd(80, "x"),
    "03_brand_positioning.md": "# Brand\n".padEnd(80, "x"),
    "04_course_outline.md": "# Course\n".padEnd(80, "x"),
    "client_lessons.md": "- Ibby hates jargon",
  };

  it("maps files to doc types and extracts client lessons", () => {
    const out = parseFoundationOutputs(good);
    expect(Object.keys(out.docs)).toEqual([
      "icp_snapshot",
      "offers",
      "brand_positioning",
      "course_outline",
    ]);
    expect(out.docs.icp_snapshot).toContain("ICP Snapshot");
    expect(out.clientLessons).toEqual(["Ibby hates jargon"]);
  });

  it("throws when a foundation doc is missing or too short", () => {
    expect(() => parseFoundationOutputs({ ...good, "02_offers.md": "hi" })).toThrow(/02_offers/);
    const { "03_brand_positioning.md": _drop, ...missing } = good;
    expect(() => parseFoundationOutputs(missing)).toThrow(/03_brand_positioning/);
  });

  it("tolerates absent lesson files", () => {
    const out = parseFoundationOutputs({ ...good, "client_lessons.md": undefined as never });
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
