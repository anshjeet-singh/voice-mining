import { describe, expect, it } from "vitest";
import { composeMineRequest, harvestCompetitorSources } from "./competitorSources";

describe("competitor source harvesting", () => {
  it("tags platforms, dedupes, and prefers research origin", () => {
    const sources = harvestCompetitorSources({
      researchUrls: ["https://instagram.com/chiefsbs", "https://youtube.com/@hunterrtobin"],
      researchText: "see https://youtube.com/channel/UCabcdef1234567890 and instagram.com/reel/xyz",
      onboardingTexts: ["follow @chiefsbs and instagram.com/hxxntrr plus youtube.com/c/SomeChannel"],
    });
    const keys = sources.map((s) => `${s.platform}:${s.handle}`);
    expect(keys).toContain("instagram:chiefsbs");
    expect(keys).toContain("youtube:hunterrtobin");
    expect(keys).toContain("youtube:UCabcdef1234567890");
    expect(keys).toContain("instagram:hxxntrr");
    expect(keys).toContain("youtube:somechannel");
    // /reel/ paths are not handles
    expect(keys).not.toContain("instagram:reel");
    // research beats onboarding when both mention the same account
    expect(sources.find((s) => s.handle === "chiefsbs")?.origin).toBe("research");
    // channel ids keep their casing and channel-style URL
    expect(sources.find((s) => s.handle === "UCabcdef1234567890")?.url).toContain("/channel/");
  });

  it("composes a deep-mine request with both platforms and discovery", () => {
    const req = composeMineRequest([
      { platform: "instagram", handle: "chiefsbs", url: "https://instagram.com/chiefsbs", origin: "research" },
      { platform: "youtube", handle: "hunterrtobin", url: "https://youtube.com/@hunterrtobin", origin: "research" },
    ]);
    expect(req).toContain("INSTAGRAM accounts: chiefsbs");
    expect(req).toContain("YOUTUBE channels: @hunterrtobin");
    expect(req).toContain("10 reels per Instagram account");
    expect(req).toContain("at least 10 sources");
  });
});
