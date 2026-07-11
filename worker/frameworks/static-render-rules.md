# Static Ad Render Rules: The Build System, The Bans, The Visual QA Loop

These rules exist because a batch shipped with hand-rolled chrome, designed CTA text baked onto native formats, a broken tweet layout, and an AI-generated human standing in for the client. Operator verdict: 5/10, not at par. Every rule below is a hard gate.

## 1. The skill's build system IS the build system

- The static-ad-builder skill ships its OWN pipeline: scripts/ (components.py, notes_v2.py with compose_chrome(), text_w(), render_all(), pixel-band audit), assets/chrome/ (REAL device screenshot crops), assets/fonts/ (the real marker and sans fonts), assets/reference-screenshots/ (what correct output looks like). For every format that skill covers, USE ITS PIPELINE AND ASSETS. Run its scripts. Composite its chrome crops. Load its fonts.
- Never hand-draw or hand-code chrome (status bars, nav bars, toolbars) that exists as a real crop in the skill's assets. Synthesized chrome is a publish blocker per the notes spec ("chrome is composited, never drawn").
- ad-factory (render.js HTML route, genimage.js) is the FALLBACK for formats the skill does not cover, never the primary route for formats it does.
- If a script needs a dependency (PIL etc.), install it and run it. Do not reroute to HTML because setup felt heavy.

## 2. The CTA rule (where the batch failed hardest)

- On-image CTA text lives ONLY in the format's designated CTA slot, styled as the format dictates: the marker line at the bottom of a Notes ad (in the real marker font, per spec: "DM '[KEYWORD]' to get started" with keyword max 4 characters, or "Click the link below to get started"), the final blue bubble of an iMessage thread, the last caption chip of a story photo.
- NEVER a floating colored designed CTA line ("the fix is in the link below." in brand green) pasted onto a native format. That single element converts a screenshot into an obvious ad and fails the native test.
- If a format has no natural CTA slot, the image carries NO CTA and the primary text above the creative does that job. An imperfect CTA-free native beats a broken-illusion native every time.

## 3. Human beings are never generated

- NEVER AI-generate a person to represent the client, a client of the client, or any identifiable human. That is fabrication, same category as fake testimonials.
- Founder-lifestyle formats use REAL photos of the client from their Drive assets or onboarding material. If no usable real photo exists, either build the format with a no-person composition (hands, desk, environment, object) or swap to a different format from the library and note the swap in the doc.
- AI-generated imagery is allowed only for objects, environments, and textures (a sticky note, a desk, a whiteboard), never faces or bodies.

## 4. The visual QA loop (mandatory, per ad)

Rendering without looking is how a broken tweet layout ships. For EVERY rendered ad:
1. Render it.
2. VIEW the output PNG with the Read tool.
3. Grade it against (a) the skill's reference screenshots, (b) the format's spec section, (c) the native test: "would this pass as something a mate screenshotted and sent you?", and (d) layout sanity: no dead voids, no clipped text, no overflow, correct safe zones.
4. If anything fails, fix and re-render. Repeat until it passes.
5. Log one QA line per ad in the deliverable doc: what was checked, what was fixed.
An ad that was never viewed is an ad that does not ship.

## 5. CLONE the reference, never "take inspiration"

The single most important rule in this file. The operator's verdict on batches that merely resembled the references: not at par.
- Every static ad DECLARES its reference: pick ONE image from the reference-ads library (use catalog.md there when it exists, otherwise browse) that matches the planned format, and record "Reference: <filename>" in the ad's spec.
- Then CLONE it: same layout, same composition, same background, same spacing feel, same text treatment hierarchy, same CTA treatment and placement, same color logic. You are producing a sibling of that exact image where ONLY the copy (and brand-specific tokens like names and numbers) changed.
- The QA test is side by side: view your render and the reference together. If a stranger would not believe they came from the same designer's same template, the ad fails. Rebuild until it passes.
- Inventing a new composition is allowed ONLY when no reference exists for the format, and the doc must say so explicitly on that ad.

## 6. Spec fidelity beats improvisation

- Read the format spec IN FULL before building that format (notes-format-spec.md rev 7 for Notes, native-formats.md for the rest). The spec's casing rules (sentence case for Notes, lowercase for chat formats), background rules (pure #FFFFFF or #000000), garnish limits (max one), and layout skeletons are hard constraints, not inspiration.
- VIEW EVERY IMAGE in the operator's winning-ad library BEFORE building the first ad: '/Users/anshjeetsingh/Library/CloudStorage/GoogleDrive-anshjeets@gmail.com/My Drive/Cashflow Coaches/Ad Creative System/reference-ads/' (Read tool, all of them). These are the bar: match their look, text density, spacing, and CTA treatment. Also view the skill's reference screenshots and any previously APPROVED batch outputs on Drive (Cashflow Coaches/<Client>/Ads/). Calibrate on pictures, not just prose specs.
- Every concept that the spec says ships in both modes ships in both modes (Notes: light AND dark).

## Where this maps in our pipeline

- Ads stage, ad_statics deliverable: this file is the render contract. The ad-script-system framework governs the ANGLES and COPY of statics; this file governs the PIXELS.
- Copy QA / review: reject any static that fails a numbered rule above, citing the rule number. Rejections append here as new rules when they reveal a gap.
