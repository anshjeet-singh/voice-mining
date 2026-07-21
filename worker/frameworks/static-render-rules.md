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

## 5. NATIVE-FIRST batch mix (operator taste, learned from two review rounds)

The operator's approved library skews HEAVILY to phone-native formats: chat threads, notes app, search bar, calendar, email inbox, reddit thread, chatgpt/claude UI, reminders, napkin handwriting, big-text callouts. The DR-poster family (dark designed posters, three-step infographics, chart comparisons, offer posters) got batch-rejected TWICE even when well executed. Default batches are NATIVE-DOMINANT: at least 80% phone-native formats. DR-poster formats only when the generation request names them explicitly. When in doubt: would a designer be proud of it? Then it probably fails the native test.

## 6. CLONE the reference, never "take inspiration"

The single most important rule in this file. The operator's verdict on batches that merely resembled the references: not at par.
- Every static ad DECLARES its reference: pick ONE image from the reference-ads library (use catalog.md there when it exists, otherwise browse) that matches the planned format, and record "Reference: <filename>" in the ad's spec.
- Then CLONE it: same layout, same composition, same background, same spacing feel, same text treatment hierarchy, same CTA treatment and placement, same color logic. You are producing a sibling of that exact image where ONLY the copy (and brand-specific tokens like names and numbers) changed.
- The QA test is side by side: view your render and the reference together. If a stranger would not believe they came from the same designer's same template, the ad fails. Rebuild until it passes.
- Inventing a new composition is allowed ONLY when no reference exists for the format, and the doc must say so explicitly on that ad.
- A Foreplay winning static (from the FOREPLAY WINNING STATIC ADS research section) may serve as the reference instead of a catalog image: VIEW the actual image first, declare "Reference: foreplay — <advertiser>", and hold the same side-by-side clone standard. The native test still applies; a designed DR poster from Foreplay does not override rule 5's native-first mix.
- The client's OWN Meta-proven winners (MARKET TRUTH ads with above-average real CTR) are FIRST-CLASS references: VIEW the PNG from the client's Drive ads folder, declare "Reference: winner — <filename>", and clone its layout DNA with fresh copy. A reference the REFERENCE PERFORMANCE section marks UNDERPERFORMING is radioactive: never build on it except when explicitly varying a proven winner.

## 6b. Reference VARIETY across the batch (operator feedback: "same designs over and over")

- Never declare the same reference image twice in one batch.
- Spread every batch across 6+ distinct style families of the catalog (notes, chat threads, tweet/reddit, search/UI, photo-caption, handwriting, big-text, comparison, and the rest).
- Before choosing references, list which reference files already back the client's APPROVED library ads and the OPERATOR AD VERDICTS. Any reference already behind 2+ approved ads is OFF the table for new-ad batches (VARIATIONS batches that name a source ad are the exception: there, the source's format is the point).
- Cloning discipline (rule 6) is unchanged: variety means MORE references from MORE families, never looser clones.

## 7. Spec fidelity beats improvisation

- Read the format spec IN FULL before building that format (notes-format-spec.md rev 7 for Notes, native-formats.md for the rest). The spec's casing rules (sentence case for Notes, lowercase for chat formats), background rules (pure #FFFFFF or #000000), garnish limits (max one), and layout skeletons are hard constraints, not inspiration.
- VIEW EVERY IMAGE in the operator's winning-ad library BEFORE building the first ad: '/Users/anshjeetsingh/Library/CloudStorage/GoogleDrive-anshjeets@gmail.com/My Drive/Cashflow Coaches/Ad Creative System/reference-ads/' (Read tool, all of them). These are the bar: match their look, text density, spacing, and CTA treatment. Also view the skill's reference screenshots and any previously APPROVED batch outputs on Drive (Cashflow Coaches/<Client>/Ads/). Calibrate on pictures, not just prose specs.
- Every concept that the spec says ships in both modes ships in both modes (Notes: light AND dark).

## 8. Quarantined formats + the photoreal-or-swap rule (operator verdicts, 2026-07-21)

The operator batch-graded four formats as "absolutely horrible" renders. They are QUARANTINED: NEVER include them in a default/diverse mix; build them ONLY when the generation request selects them by name, and then hold them to the bars below. If the render cannot hit the bar, SWAP to a strong native family and note the swap in the doc.

- **napkin-handwriting** — failed because it "does not look like a napkin at all." The base MUST be a photoreal napkin/paper texture (genimage an actual napkin on a table, or a real photo), with real shadow and paper grain; marker text follows the napkin's perspective. Flat white rectangles with handwriting font = automatic fail.
- **offer-poster** — failed for incoherent messaging. A poster carries ONE claim, ONE offer, ONE CTA in a clean hierarchy; if the copy needs three reads to parse, rewrite before rendering. Clone the exact catalog reference's layout; do not improvise poster design.
- **tombstone-shock** — failed for "very weird contrast." Match the reference's palette and lighting exactly; no glowing text on dark gradients that the reference does not have. If the scene needs illustration the pipeline can't produce cleanly, swap.
- **photo-caption-chips** — falls flat without a REAL photographic base. Use a real client photo or a photoreal genimage environment (never a person); caption chips composited in the platform's real chip style. Illustrated/cartoon backgrounds fail the native test for this format.

These four are review-first: on any batch containing them, VIEW those renders against their reference FIRST and rebuild before touching the rest of QA.

Strong native formats WITHOUT catalog images — **calendar, reminders, email-inbox** — are first-class: clone the static-ad-builder skill's own format spec + reference screenshots (native-formats.md), same chrome-compositing rules. The calendar format is operator-approved (Trent's batch).

## Where this maps in our pipeline

- Ads stage, ad_statics deliverable: this file is the render contract. The ad-script-system framework governs the ANGLES and COPY of statics; this file governs the PIXELS.
- Copy QA / review: reject any static that fails a numbered rule above, citing the rule number. Rejections append here as new rules when they reveal a gap.
