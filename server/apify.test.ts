import { describe, expect, it } from "vitest";
import { extractFacebookGroupUrls, mapGroupItems } from "./apify";

describe("extractFacebookGroupUrls", () => {
  it("ranks groups by frequency and returns base URLs", () => {
    const urls = extractFacebookGroupUrls([
      "https://www.facebook.com/groups/2815042615255352/posts/24688480887484877/",
      "https://www.facebook.com/groups/2815042615255352/posts/23952900241042949/",
      "https://www.facebook.com/groups/1069734517513769/posts/1716816209472260/",
      "https://www.facebook.com/groups/2815042615255352/posts/25131872946479000/",
      "https://www.facebook.com/groups/bluecollarmillionaire/posts/1349785160488622/",
      "https://example.com/not-facebook",
    ]);
    expect(urls).toEqual([
      "https://www.facebook.com/groups/2815042615255352",
      "https://www.facebook.com/groups/1069734517513769",
    ]);
  });

  it("returns empty for no group links", () => {
    expect(extractFacebookGroupUrls(["https://reddit.com/r/smallbusiness"])).toEqual([]);
  });
});

describe("mapGroupItems", () => {
  it("extracts post text and nested comments", () => {
    const out = mapGroupItems([
      {
        url: "https://facebook.com/groups/g/posts/1",
        text: "Has anyone actually received a business grant? Every lender keeps denying me.",
        topComments: [
          { text: "Applied for two years, got nothing but rejections and scam offers" },
          { text: "ok" },
        ],
      },
      { message: "short" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].platform).toBe("facebook_groups");
    expect(out[0].text).toContain("business grant");
    expect(out[1].text).toContain("rejections and scam offers");
  });
});
