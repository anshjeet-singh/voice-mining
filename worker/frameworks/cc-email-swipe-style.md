# CC Email Swipe Style: The House Email Format (ConvertKit)

Source: the agency's [CC] Emails Swipe File (Google Doc, read in full: 5 sequences, 40+ emails from a live funnel). This file defines HOW our emails look, sound, and are formatted. The persuasion doctrine lives in suby-email-machine.md, emails-and-booking.md, and haynes-scaling-systems.md section 4. This file is the STYLE contract every email deliverable must match.

## Platform rules (non-negotiable)

- Emails ship in ConvertKit. First name is ALWAYS the merge tag {{ subscriber.first_name }}, exactly like that, never [FIRST NAME] or a made-up name.
- SMS ships in GHL and uses GHL merge fields ({{contact.first_name}}), stays under 320 characters, one link, one CTA.
- Every email is written so the rendered doc can be copy-pasted straight into ConvertKit: markdown bold (**text**), italics (*text*), and underline (<u>text</u>) only. No tables inside email bodies, no code blocks, no images.
- Links: never invent URLs. Use [VSL LINK], [CLASSROOM LINK], [COMMUNITY LINK], [ZOOM LINK], [CALENDAR LINK] placeholders as the link target, with real anchor text.
- LINK ROLES, never mixed: [VSL LINK] is the conversion CTA (book the call). [CLASSROOM LINK] is the Skool classroom where the lead magnets live: EVERY "go consume [named magnet]" pointer hyperlinks the MAGNET NAME to [CLASSROOM LINK] (e.g. `[The Come-Up Starter Kit]([CLASSROOM LINK])`) — one destination for all magnet pointers, because members land on the classroom and pick the asset. [COMMUNITY LINK] is the join/About page, for NON-members only (ads, join CTAs), never as a magnet pointer inside member emails. [CALENDAR LINK] is the Q&A add-to-calendar.
- EVERY link is a real markdown hyperlink on descriptive anchor text: `[The Come-Up Starter Kit]([COMMUNITY LINK])`, `👉 [Book your free onboarding call]([VSL LINK])`. A bare URL pasted into the body, or a "label: URL" line ("Book your call: https://..."), is a FAILED email: the operator has to hand-hyperlink it in ConvertKit, which defeats the point of the doc. Hyperlink the asset NAME or the command words, never show the raw address.
- THE CTA DESTINATION FOR ALL NURTURE AND RECOVERY EMAILS IS [VSL LINK]. In our call funnels the VSL page IS the booking page: one URL. Never write [BOOKING LINK] as a separate destination. The only other links that ever appear: [ZOOM LINK] and [CALENDAR LINK] in post-booking logistics emails, [COMMUNITY LINK] when pointing back into Skool.

## Document layout (how each email is laid out in the deliverable markdown)

Every email in the doc follows this EXACT block layout. Every labeled line is its OWN line with a BLANK LINE after it. Never run Send, Subject, and Preview text together in one paragraph.

### Day N: [Internal email title]

**Send:** [timing]

**Subject:** [subject line]

**Preview text:** [preview text]

[blank line, then the email body exactly as it will be pasted into ConvertKit]

- Arrow and check bullets: ONE bullet per line, written as markdown list items (each line starts with the arrow or check), never chained inside a paragraph.
- The CLOSING CTA is its own `## ` H2 heading, hyperlinked, flanked by the pointing hand: `## 👉 [Book your free onboarding call]([VSL LINK])`. Written as an H2 in the doc it pastes into ConvertKit as a Heading 2 with zero hand-formatting. Exactly ONE H2 CTA per email, at the close; earlier mentions of the same CTA stay inline hyperlinks in body text.
- The sign-off is ALWAYS a three-part block on separate lines, and the ENTIRE block (from "To your success," through the end of the P.S.) is set in ITALICS:

*To your success,*

*Trent "Nickname" Kus*

***P.S.*** *[the P.S. line]*

- Underline with <u>...</u> around a PHRASE or a few words, never a whole sentence and never more than once per email. The underline marks the few words you'd punch, not the whole thought.

## The email skeleton (every email, in this order)

1. SUBJECT: lowercase-casual or sentence case, curiosity or specificity, never "Reminder:". House patterns: the fake thread ("re: ur special invite is inside"), the quoted objection ("my credit isn't good enough" (here's the truth)), the number claim ("she made $3,200 from one text message"), the status line ("your application status has been declined..."), the blunt question ("in or out?").
2. PRETEXT (preview text): one line that extends the subject's loop, never repeats it.
3. Greeting: "Hey {{ subscriber.first_name }}," or just "{{ subscriber.first_name }}," and sometimes the name is woven into the first sentence instead.
4. Body (see rhythm rules below).
5. CTA link line: the ONE CTA of the email. The same destination may repeat 2 to 3 times through the email (early, middle, close), but it is always the SAME action. One CTA, one core idea per email, always. The CLOSING instance is the hyperlinked `## ` H2 heading (see Document layout); earlier instances are inline hyperlinks.
6. Sign-off: the italic three-part block (see Document layout). The topic-matched nickname-in-quotes device (Trent "0%" Kus, Trent "Funded" Kus) is capped at the FIRST 3 EMAILS of a sequence: it is charming once and reads as a bit by day 6, which is corrosive under an income claim. From email 4 on, plain name. In a one-off broadcast, one topic-matched nickname is fine.
7. P.S. line: mandatory but VARIED. The tomorrow-teaser P.S. ("P.S. Tomorrow I'm sending you a case study. Don't miss it.") appears on AT MOST HALF the emails of a sequence; the rest either (a) repeat the CTA with real scarcity or the live-only bonus, or (b) drop one extra proof detail the body didn't use. The P.S. is often hyperlinked to the CTA.

## Body rhythm rules

- ONE SENTENCE PER LINE. Every sentence sits on its own line (a hard line break after it). Group 2 to 4 related sentences with single line breaks into a block, then leave a BLANK line before the next block. Never let two sentences share a line, and never ship a dense multi-sentence paragraph. Example of RIGHT: `Most funding companies get paid up front.` / new line / `I only get paid when you get funded.` / new line / `So the incentives point the same way yours do.` Each on its own line.
- SECTION MARKERS ARE HEADINGS. Any numbered step or labeled section marker ("1. Add it to your calendar", "2. Watch this before we talk", "The Problem:", "What We Did:", "The Result:") is written as a markdown `## ` heading (H2) on its own line, NOT as a bold paragraph. Headings give the email real sections and breathing room in ConvertKit. A three-step email therefore has three `## ` headings, each followed by a 2 to 4 line block.
- 2 to 4 short lines per block. Never a wall. The email should read like texts from a sharp friend.
- Heavy formatting on the words that carry the sale: bold the pains, the numbers, the mechanism names, and the commands. Italicize the reframes and quoted speech. Underline the one sentence per email you'd say louder. Aim for a formatting touch every 2 to 3 lines: the swipe file underuses this, we go further, without bolding whole paragraphs.
- Arrow bullets for mechanisms and contrasts, check-mark bullets for benefit stacks and what-you-get lists, numbered lists for steps.
- Labeled beats for story emails: "The Problem:" then "What We Did:" then "The Result:". Each label bolded, each section 2 to 4 short lines.
- Specific numbers everywhere a claim lives, pulled from the approved docs or [PROOF:] placeholders. The swipe file's credibility engine is repetition of the same 3 or 4 proof anchors across every email (2,100+ clients, $130M+ funded, 520 to 850 score, $1.1M stacked). Establish the client's anchor set in email 1 and repeat it.
- Objection emails quote the objection in the subject and first line, in quotes, then dismantle it with one story and one reframe.
- Scarcity is only ever real: live-attendee bonuses, founding-member caps, price changes. Named bonus + dollar value + the word LIVE.
- BANNED, in every email, forever: fake-honesty disclaimers that pre-deny selling. "No pitch, no pressure", "this isn't a sales call", "I won't try to sell you anything", "no strings attached" and every cousin. There IS a pitch on the call and the reader knows it; pre-denying it is a lie that kills trust the moment they hear the offer. Sell the call with real value and real scarcity instead: "Claim your personalized free 1-on-1 call with our team. You only get one slot."
- Voice: contractions, "ur" and "tmrw" style shorthand in subjects only (body stays clean), zero corporate tone, no em dashes anywhere.
- Casing: lowercase casual is the default (about 80% of clients). EXCEPTION: if the ICP skews 40+/50+, switch to straighter sentence-case email copy. Check the approved ICP Snapshot's age range before writing.
- Emoji: use whatever the swipe file uses where it fits. The three workhorses, good in almost every email: the green tick (benefit stacks and checklists), the red cross (myth busting and what-you-don't-need lists), and the pointing hand (flanking CTA link lines). No banned emojis, just never decorate for decoration's sake.

## Leverage the free community (the asset multiplier)

The free Skool community is the lead magnet vault, and the email sequences are its delivery system. This is core strategy, not decoration:
- Every value email in the 14-day sequence points the reader INTO the community to consume a SPECIFIC named asset: "access your toolkit inside", "go watch [named video] in the classroom", "grab [named lead magnet], it's pinned". Pull the real asset names from the approved Skool docs (pinned posts, Start Here module, classroom courses). Never invent an asset that isn't in those docs. The magnet name is ALWAYS the hyperlink and its destination is ALWAYS [CLASSROOM LINK] (see Link roles) — never the About page.
- The post-booking sequence does the same job: between booking and the call, every value email sends them BACK into the community to consume more (a lead magnet, a training, a wins wall), breaks one limiting belief per email, and one email in the arc is a straight FAQ email answering the questions people actually ask before the call.
- The reader should feel: "I already have access to all this, and there's more where it came from." Consumption between emails is what raises show rates and close rates.

## The sequence map (which emails exist)

The swipe file's five-sequence architecture, generalized:
1. Community onboarding (14 day): welcome + toolkit, myth/mechanism emails, case-study emails (one per avatar path), objection emails, urgency close. Every email CTAs to ONE next step (the onboarding call / VSL / booking page) and points into a named community asset for the value beat.
2. Show-up reminders (post-registration or post-booking): confirmation with link + calendar + what-we-cover + live-only bonus, then value-loaded reminders at decreasing distance. Short, logistics up top, one value beat, live bonus restated. These are the shortest emails in the system. CALL FUNNELS: the booking window is ALWAYS 3 days out at most, so the post-booking sequence is exactly: instant confirmation, day-1 value email, day-2 value email, 24h reminder, 3h reminder. Never write a week-long show-up arc for a call.
3. Attended follow-up: "u were on it, u know it works" recap, the offer restated, case study, deadline.
4. No-show recovery: "u missed it (others didn't)" without shaming, replay or rebook path, objection handling, final "in or out?".
5. Ascension/upsell: congrats + first move, where to start, what's-happening-inside social proof, DFY invitation, price-anchor comparison.

## Sequence architecture (any nurture of 10+ emails)

Fourteen same-shaped emails is a FAILED sequence even when every email passes alone. The reader learns the pattern by day 4 and starts skimming. Architect the SEQUENCE, not just the emails:

- BREAK THE SKELETON ON PURPOSE. If every email runs hook line, belief, underline, magnet link, CTA, sign-off, P.S., nothing earns attention. Vary the opening device (cold story drop, quoted objection, one-line question, a number with no context) and let at least 3 emails abandon the standard skeleton entirely.
- LENGTH VARIANCE IS A WEAPON. Anchor emails (the origin story, the flagship case study, the biggest proof email) run LONG, 700-900+ words with real texture: what the flat looked like, the exact text message, the moment the bank closed the account. Pattern interrupts run SHORT, 50-90 words. A short email lands hardest right after a long one. Never ship a sequence where everything is the same mid-length.
- ONE CTA PER EMAIL, PHASED ACROSS THE ARC. Three offers per email (magnet + call + Q&A) means no offer. Phase it: opening quarter of the sequence is consumption only (named magnets, the Q&A calendar add, zero call pressure); the middle is belief-shifting with a soft call mention; the final third makes the call the SINGLE ask with rising urgency. The close never splits attention.
- PROOF COMPOUNDS, NEVER RECYCLES. Each named proof number gets ONE lead slot in the sequence. Every re-mention must ADD a detail the reader didn't have (what the first affiliate-recruitment week actually looked like, what a 500-affiliate roster costs to run). Relisting the same three numbers turns them into slogans.
- REQUIRED FORMATS somewhere in the arc: one REPLY-BAIT email (a one-word-reply question: deliverability gold and intel), one DISQUALIFICATION email ("do NOT book this call if..."), and one Q&A ROUND-UP (real member questions, rapid-fire answers).
- OBJECTION COVERAGE IS A CHECKLIST. Pull the avatar's top objections from the approved ICP doc and tick them off across the sequence. The money objection (the offer's real price bracket), the time commitment, and "can I run this alongside my job" are almost always louder than "I'll build it myself": each MUST get an email or a major beat. An unhandled loudest objection is a failed sequence.

## Quality gates before an email doc ships

- Every email has: subject, pretext, {{ subscriber.first_name }}, one CTA (repeated max 3x, same destination), the italic "To your success," sign-off block, and a P.S. Nickname-in-quotes only within the first 3 emails of a sequence; plain name after.
- Link pass: EVERY URL is a markdown hyperlink on real anchor text, the closing CTA is a hyperlinked `## ` H2 heading, and there are ZERO bare URLs or "label: URL" lines anywhere in the doc.
- Banned-phrase pass: no "no pitch", "no pressure", "not a sales call", "won't sell you anything", "no strings" anywhere. Scarcity and value sell the call, never a fake disclaimer.
- Formatting pass: bolds on pains/numbers/commands, italics on reframes/quotes, at least one underlined key sentence per email, blank lines between blocks, no bare walls of text.
- One core idea per email. If an email teaches two things, split it.
- Proof anchors match the approved foundation docs exactly, or carry [PROOF:], and every repeat mention adds a new detail (see Sequence architecture).
- Sequence pass, reading the whole thing in order: P.S. loops actually connect (if email 3's P.S. promises a case study, email 4 IS that case study), tomorrow-teaser P.S. on at most half the emails, length variance is visible, the CTA phasing holds, and the required formats (reply-bait, disqualification, Q&A round-up) are present.
