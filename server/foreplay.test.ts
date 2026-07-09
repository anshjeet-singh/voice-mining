import { describe, expect, it } from "vitest";
import { formatForeplayAds } from "./foreplay";

describe("formatForeplayAds", () => {
  it("formats an ad with headline, copy, cta, and dominant emotions", () => {
    const blob = formatForeplayAds([
      {
        id: "a1",
        name: "Boweryboi",
        headline: "Don't Leave $250K on the Table",
        description: "A 700+ FICO score is your ticket to $250,000 in business funding at 0% interest.",
        cta_type: "LEARN_MORE",
        display_format: "IMAGE",
        live: true,
        running_duration: { days: 20 },
        emotional_drivers: { urgency: 9, achievement: 8, fear: 2 },
        product_category: "business financing",
      },
    ]);
    expect(blob).toContain("Boweryboi");
    expect(blob).toContain("LIVE, running 20+ days");
    expect(blob).toContain("HEADLINE: Don't Leave $250K on the Table");
    expect(blob).toContain("COPY: A 700+ FICO score");
    expect(blob).toContain("CTA: LEARN_MORE");
    expect(blob).toContain("urgency 9/10");
    expect(blob).not.toContain("fear");
  });

  it("includes video transcripts and caps the count", () => {
    const ads = Array.from({ length: 20 }, (_, i) => ({
      id: `v${i}`,
      name: `Brand${i}`,
      full_transcription: "Stop scrolling. Here is how I got funded.",
      display_format: "VIDEO",
      live: false,
      running_duration: { days: 3 },
    }));
    const blob = formatForeplayAds(ads);
    expect(blob).toContain("VIDEO SCRIPT: Stop scrolling.");
    expect(blob.match(/AD by Brand/g)?.length).toBe(12);
  });

  it("returns empty string for no ads", () => {
    expect(formatForeplayAds([])).toBe("");
  });
});
