import { describe, expect, it } from "vitest";
import { rowToAd, scoreIntel } from "./creativeLibrary";

describe("scoreIntel", () => {
  it("ranks live long-runners seen repeatedly above dead one-offs", () => {
    const veteran = scoreIntel({ live: 1, runningDays: 60, timesSeen: 5 });
    const oneOff = scoreIntel({ live: 0, runningDays: 8, timesSeen: 1 });
    expect(veteran).toBeGreaterThan(oneOff);
  });
  it("caps longevity and persistence so no single signal dominates", () => {
    expect(scoreIntel({ live: 1, runningDays: 500, timesSeen: 50 })).toBe(40 + 120 + 50);
  });
});

describe("rowToAd", () => {
  it("maps a library row back to the formatter shape", () => {
    const ad = rowToAd({
      id: 1,
      source: "foreplay",
      sourceId: "abc",
      niche: "credit repair",
      advertiser: "Boweryboi",
      displayFormat: "image",
      headline: "H",
      copy: "C",
      transcript: null,
      ctaType: "LEARN_MORE",
      imageUrl: "https://x/y.png",
      productCategory: "funding",
      live: 1,
      runningDays: 33,
      timesSeen: 2,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    });
    expect(ad).toMatchObject({
      id: "abc",
      name: "Boweryboi",
      headline: "H",
      description: "C",
      display_format: "image",
      live: true,
      running_duration: { days: 33 },
      image: "https://x/y.png",
    });
  });
});
