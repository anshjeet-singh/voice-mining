# Skill update: `skool-community-builder` → lean v2

Hand this whole file to claude.ai (desktop, with the skills project open) so it updates
the `skool-community-builder` SKILL.md at the source. It then re-syncs to the local
worker cache automatically. Nothing here changes the app — this is the source-of-truth
skill so future generations match without me re-instructing the worker every run.

---

## PROMPT TO PASTE INTO CLAUDE.AI

> Update my `skool-community-builder` skill (SKILL.md) to the lean v2 spec below. This is
> a "delete the noise" rewrite: the deliverable must be plain, copy-pasteable text a human
> pastes straight into Skool — no meta-commentary, no rationale paragraphs, no "higher
> converting format" notes, no value-stack $ framing, no audit sections. Apply every change
> in the CHANGE SPEC exactly, keep the parts marked KEEP, and delete the parts marked
> REMOVE. Preserve the appendix swipe file. Keep the Start Here import key unchanged.
> After editing, re-read the file top to bottom and confirm the About page can't exceed
> 1000 characters, there are exactly two pinned posts, and `[COMMUNITY NAME]` is used as a
> literal placeholder everywhere the name would appear.

---

## GLOBAL PRINCIPLE (add near the top, above "Modes")

**LESS IS MORE is the hard rule.** Every asset is plain, copy-pasteable text that goes live
in Skool as-is. Zero meta-commentary, zero rationale, zero "next actions / why this works /
higher-converting format" notes, zero audit or summary sections. If a line is not copy that
goes live in Skool, delete it. Use `[COMMUNITY NAME]` (capitalized) as a literal placeholder
everywhere the community name would appear — never invent or substitute a name, the operator
picks it later. NEVER output a community pipeline plan, community-foundation section,
behavioral-science notes, or content-strategy section — those are banned.

---

## CHANGE SPEC (section by section)

### Frontmatter `description`
Rewrite so it lists the lean deliverable set: 3 name options, a 4–5 line emoji tagline, TWO
sub-1000-character About page variations, the About-page VSL script, categories (base + 1–2
independent extras), the 1–9 gamification levels, the Plugins/links config, and TWO pinned
posts (Welcome + Introduce Yourself). Drop "value stack" and "Accountability Buddy" from the
description.

### 1. Community name
- **3 options only** (was 3–5). Names only, on their own lines.
- Niched to the client's journey (e.g. credit/funding), short, ownable.
- **REMOVE** any recommendation, commentary, or "which to pick" note.

### 2. Group tagline / right-hand description
- **ALWAYS the emoji-stack format.** 4–5 lines, each line = one emoji + **2–3 WORDS MAX**
  (never a sentence, never "build a fundable credit profile"), whole tagline **under 150
  characters**. Last line is the CTA (e.g. `👇 Join below`).
- **REMOVE** "Format A — single benefit sentence" as an option (the emoji stack is the only
  format now).
- **REMOVE** the paragraph that says the tagline "pairs with the Links plugin, add 2–3
  info-box links directly under it" — links now live only in the Plugins step (§7).

### 3. About page (rewrite this section)
- **TWO variations**, labeled "Variation A" and "Variation B". **Each under 1000 characters.**
- Spaced one-liners, never paragraph blocks.
- **Exact anatomy, in this order:**
  1. An **ATTENTION** opening line (hook — not a greeting).
  2. The **ICP + their main pain point** (one line).
  3. **ONE owner-credibility line, near the TOP** (not the bottom) — pull the real story from
     the intake/research, e.g. "I'm Trent — I scaled a 7-figure Airbnb business, lost ~$100k,
     and rebuilt through funding and credit."
  4. **"What you unlock for free:"** as a **GREEN-TICK-only list** — every line starts with ✅,
     NO other emojis. Includes the core value items AND **exactly THREE named lead magnets**.
  5. **"Bonuses:"** (green ticks) that ALWAYS include: a **weekly live Q&A**, a **personalized
     1-on-1 onboarding call**, and **access to the community**.
  6. **One line of social proof** (real only).
  7. **"Who this is for" / "Who this is not for"** — one line each (or 2–3 ✅ / ❌ lines each).
  8. A short **urgency CTA**: "Only stays free for the next [N] members", a catchline (e.g.
     "Stop getting denied, start getting positioned"), then "Click join below".
  9. **Nothing after the CTA.**
- **REMOVE** the old "What You Get 🔥🛠🧠🎁" varied-emoji block → it becomes the green-tick list.
- **REMOVE** the "value stack — Worth $X — Now just $Y/mo" framing for the FREE community
  (paid community keeps a lean price line, see below).

### 4. About-page VSL script — **KEEP AS IS**
No change. Still hand to `vsl-and-sales-page-writer` with the Skool brief. The operator likes it.

### 5. Categories
- Keep the base names, tailor emojis to the niche.
- **Only 1–2 EXTRA categories**, and each must be **INDEPENDENT and non-overlapping** — never
  a category already covered by another (e.g. do NOT add "Proof Wall" or "Opportunities" when
  "Wins" already covers proof). Value-adding and relevant to the industry.

### 6. Gamification — level names 1–9
- Output **just the 9 level names** (numbered, one emoji each, under 20 chars, cool/fun/gamified).
  Keep Level 1 = `🚨 Caution`.
- **REMOVE** every explanatory sentence / "prompt to run" prose — names only.
- **The 9 names MUST be IDENTICAL in the paid community.**

### 7. Plugins / Next steps
- **KEEP** the plugins config (membership questions, auto-DM, unlock chat at L2, instant
  approval, Meta pixel, Zapier, etc.).
- This is the ONLY place the **community links / info-box links** live (moved out of the
  tagline section).

### 8. Pinned posts — **EXACTLY TWO** (was three)
- **REMOVE the "Accountability Buddy" pinned post entirely.**
- **Post 1 — "Welcome inside 🎉 Follow the steps below"** (make this the in-depth one):
  - Welcome to `[COMMUNITY NAME]`, 1–2 lines on what the community is, then a **numbered
    checklist**:
    1. **Book your free 1-on-1 onboarding call** → `[BOOKING LINK]`
    2. **Sign up for the weekly live Q&A** (add it to your calendar) → `[LIVE Q&A LINK]`
    3. **Start here** → links the Start Here module
    4. **Introduce yourself** → links Post 2
- **Post 2 — "Introduce Yourself"** (keep the existing intro-post copy).

### 9. Start Here module — trim to two lines
- Output ONLY:
  - `Copy this key into the Skool course import:` then the key
    `a9a6e0ad29a44904a6c78a5041bdb2845d22a951979941599808ded1dc393efa`
  - `Here are your 5 free course videos:` then the 5 video titles as a list.
- **REMOVE** any surrounding prose/explanation.

### Full-build order of operations
Update the numbered list to reflect: 3 names, emoji tagline, two <1000-char About pages,
VSL, categories (+1–2 independent), 9 levels, plugins/links, **two** pinned posts, Start Here
key + 5 videos, short setup checklist. Drop the third pinned post.

### Paid community
Same lean structure and rules, except the About page sells the paid offer (its real name,
price, promise, guarantee from the Offers doc) with the CTA pointing to the paid join/checkout,
and the 9 gamification level names are IDENTICAL to the free community's.

---

## Companion note (optional, for the email skills)

The free-community **14-day email sequence** (owned by `free-community-pipeline` /
`email-campaign-writer` / `pre-call-email-writer`) should use **exactly two CTAs** —
(1) book the 1-on-1 onboarding call, (2) add the weekly live Q&A to the calendar — feature
the **three named lead magnets** from the free About page, open with a welcome email
("welcome to `[COMMUNITY NAME]` — your toolkit is inside"), and keep `[COMMUNITY NAME]` as a
literal placeholder. Add this note to those skills too if you're updating them in the same pass.
