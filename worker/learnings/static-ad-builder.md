# Learnings: static-ad-builder

Accumulated craft lessons applied on every run.

<!-- 2026-07-10 · job 180009 · client: Trent Kus -->
- The skill documents only the SVG + rsvg-convert + components.py pipeline, but the live agency build route is the ad-factory HTML pipeline: one HTML file of `.s` design elements at 360x450, rendered to 1080x1350 via puppeteer (`render.js`, deviceScaleFactor 3), plus `genimage.js` (Nano Banana Pro) for photo-real formats. Worth documenting as the supported alternative so a builder does not have to reverse-engineer it.
- Add a hard warning about CSS class collisions when many `.s` ads live in one file: an unscoped utility class reused across ads (e.g. a generic `.big` used both as a full-ad wrapper and as an inline number style) bleeds background, padding, and flex onto the wrong element and silently overflows the crop. Rule: scope every per-ad class under that ad's id or a unique prefix, and pixel-audit each render for right-edge clipping.
- For lifestyle / photo + caption-chip formats, recommend generating the photo with genimage (text-free) and compositing the caption chips as HTML over a `file://` background, then rendering. Baking caption text into the image model is unreliable; the HTML overlay guarantees text fidelity, which the format needs.
