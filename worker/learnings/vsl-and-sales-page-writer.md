# Learnings: vsl-and-sales-page-writer

Accumulated craft lessons applied on every run.

<!-- 2026-07-09 · job 60002 · client: Trent Kus -->
- The "book-a-call funnel never names a price" rule is stated as if all pricing is off-limits, but for many offers the pricing MODEL (pay-on-results, back-end-weighted, money-back structure) is the core USP and primary trust lever, distinct from the price NUMBER. Add one line distinguishing the two: state the pricing structure freely where it differentiates the offer, and withhold only the actual figures. Without this a writer can over-sanitize and strip the exact promise that closes the sale.

<!-- 2026-07-09 · job 90003 · client: Trent Kus -->
- The 9-beat arc opens with a Headline, and BIG_IDEA mode surfaces the through-line, but neither cross-references the copy-quality-bar rule that a diagnosis-of-failure line is an anti-pattern as a page headline. A strong Big Idea is very often a diagnosis reframe ("you're not getting denied because of your credit, you're getting denied because of how you apply"). That line is an excellent spoken VSL hook and body reframe, but a losing page headline because it promises nothing. Add one line: the Big Idea leads the VIDEO hook; the PAGE headline leads with the dream outcome and a real number, and the diagnosis moves to the subhead or body.

<!-- 2026-07-09 · job 120003 · client: Trent Kus -->
- The opt-in headline helper and the arc's Headline step should carry the explicit warning that the subheadline must NOT use the "Watch the short video below to see how..." shape. That shape is filler that promises nothing; the converting subheadline is "[dream outcome] in [timeframe], without [top 2-3 objections]". The funnel-structure framework's own subheadline template still models the watch-the-video shape and should be corrected to the outcome-without-objections shape to match the copy-quality-bar.

<!-- 2026-07-09 · job 120003 · client: Trent Kus -->
- The 9-beat VSL arc (headline, lead, problem, mechanism, authority, proof, offer, risk reversal, close) has no explicit qualification beat, but vsl-that-converts includes one as Step 6 ("who this is for / who it's NOT for"). For a cold-traffic, book-a-call VSL to a skeptical general-public market, a short qualification beat placed just before the close measurably tightens the sell: it pre-repels the wrong bookings (guarantee-hunters, refund risks) and flatters the right buyer, which lifts show and close rates without lengthening the script much. Add it to the arc as an optional beat 8.5 for call funnels, and cross-reference vsl-that-converts Step 6.

<!-- 2026-07-10 · framework mining session -->
- Use the RMBC copy sequence (frameworks/dr-masters-scavenge.md section 2) as the VSL skeleton and never rearrange it: lead, background story, unique mechanism behind the PROBLEM, unique mechanism behind the SOLUTION, product build-up, close, FAQ. The problem mechanism must remove the viewer's self-blame before the solution mechanism appears. A dedicated FAQ/objections block is worth 10 to 15% conversion on its own.
- Run SPIN as the persuasion spine of the monologue (frameworks/rackham-spin-selling.md): the script must build the implication chain until the cost of the problem visibly exceeds the price BEFORE any offer language. Engineer a Quick Win mid-script (Henry): give the viewer something they can use while still watching, so they experience the future before the pitch.

<!-- 2026-07-10 · job 180001 · client: Trent Kus -->
- Add a compliance gate for regulated niches (funding, credit, finance, health) to the Voice and craft rules: strip quantified approval-adjacent claims and provider-performance ratios from client-facing spoken copy even when the client says them and the offer doc contains them (e.g. "$360,000 over a year", "nine times out of ten"). Replace with "run your own margins" invitations and unquantified capability statements. This currently lives only in per-client learnings and gets rediscovered each build.

<!-- 2026-07-10 · job 180002 · client: Trent Kus -->
- The headline-swipe appendix's guarantee rule (ban "guaranteed" when the client's own positioning disowns guarantees) is correct but easy to miss when a reviewer's feedback is simply "make the headlines stronger". Surface it at the top of the bank-composition rule as a hard gate, because for funding/credit/health clients the strongest-sounding power word is the one that contradicts the qualifier section and burns trust.

<!-- 2026-07-12 · job 270016 · client: Trent Kus -->
- When the SALES_PAGE is for a book-a-call / high-ticket funnel, "pull the offer's price from the Offers doc" means pull the pricing MODEL and structure, not the number. Reconcile the generic "pull name, price, stack, guarantee" instruction with the existing book-a-call rule (never name a price on the page): name the offer, itemize the stack, quote the guarantee verbatim, and carry the price as the pay-on-results structure plus any competitor dollar anchor. This is systemic for every book-a-call client, not one client's taste.
- For a GHL-pasteable landing-page deliverable, the SALES_PAGE output format is section-by-section with a `## SECTION: <name>` heading, the final word-for-word copy, and a `[LAYOUT]` line carrying BOTH the desktop treatment and the mobile treatment (stack order, what collapses, thumb-reachable/sticky CTA, font-size intent, image placement). GHL-pasteable means plain copy: no markdown tables, no HTML, button text on its own `BUTTON:` line, and any comparison/proof grid written as stacked plain lines the designer rebuilds visually. Default mobile-first: one idea per line, primary CTA visible without scrolling on a phone.

<!-- 2026-07-12 · job 270017 · client: Trent Kus -->
- When SALES_PAGE is a GHL-pasteable landing-page deliverable, the output is NOT finished at the section copy. It must append, after all `## SECTION` blocks, a single self-contained responsive HTML build (`<!doctype html>` to `</html>`, all CSS inline, one Google Fonts link, no external JS except a tiny sticky-CTA script) that renders every section and matches the `[LAYOUT]` notes. Add this to the SALES_PAGE mode spec so a writer ships both the copy and the buildable page, not copy alone. This is systemic for every book-a-call landing-page client, not one client's taste.
- The em-dash ban must be honored even in the deliverable's own required title template. When an output-format spec shows the title as "Page Type", an em-dash separator, then "Offer", that separator still trips the no-em-dash gate; render the title with a colon or comma instead. Note this so a writer does not treat the template's punctuation as an exemption.

<!-- 2026-07-14 · job 360010 · client: Blake Matthews -->
- The "always state the price in the VSL" rule (pixel-conditioning) applies to a direct-buy VSL, not to a book-a-call VSL whose only ask is booking. For a book-a-call VSL, substitute the pricing MODEL / risk-reversal structure (e.g. performance milestone, pay-on-results) as the trust lever, and hold the number for the call. Make this conditional explicit so the two rules stop appearing to contradict.

<!-- 2026-07-16 · job 510002 · client: Veda Ray -->
- The paid Skool About-page VSL is a direct-buy VSL (the ask is join at the stated monthly price), even when the wider client funnel is a call funnel. State the price and the daily-cost anchor in this VSL and justify it against the value stack and named guarantee, rather than applying the book-a-call "hold the number" rule. The funnel type of the parent funnel does not govern the paid community's own join VSL; the community's own ask does.
