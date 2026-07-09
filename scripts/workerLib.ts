/**
 * Pure helpers for the local Mac worker: build the headless Claude Code prompt
 * for a claimed foundation job, and parse the files it writes back.
 * No I/O here — worker.ts owns the filesystem and network.
 */

export interface ClaimedJob {
  id: number;
  type: string;
  client: { name: string; niche: string; funnelType: string; pricePoint: string };
  onboardingDocs: Array<{ title: string; docType: string; content: string }>;
  research: string;
  lessons: string[];
  feedback: string;
}

export interface PromptOptions {
  /** Read-only claude.ai skills cache holding the agency skills. */
  skillsDir: string;
  /** Git-versioned worker/learnings dir with accumulated craft lessons. */
  learningsDir: string;
}

const FOUNDATION_FILES: Record<string, string> = {
  "01_icp_snapshot.md": "icp_snapshot",
  "02_offers.md": "offers",
  "03_brand_positioning.md": "brand_positioning",
  "04_course_outline.md": "course_outline",
};

export function buildFoundationPrompt(job: ClaimedJob, opts: PromptOptions): string {
  const onboarding = job.onboardingDocs
    .map((d) => `### ${d.title} (${d.docType})\n\n${d.content}`)
    .join("\n\n---\n\n");

  const lessons = job.lessons.length
    ? `\n# CLIENT LESSONS (apply these — feedback from previous work with this client)\n\n${job.lessons.map((l) => `- ${l}`).join("\n")}\n`
    : "";

  const feedback = job.feedback.trim()
    ? `\n# REVISION FEEDBACK (this is a regeneration — the previous foundation docs were rejected; fix these issues)\n\n${job.feedback.trim()}\n`
    : "";

  return `You are running Step 1 (Foundation Documents) of the client-onboarding-orchestrator skill for our agency.

# SKILLS
Read the mother skill first, then the child skills it references for Step 1:
- Mother skill: ${opts.skillsDir}/client-onboarding-orchestrator/SKILL.md
- Child skills live in sibling folders under: ${opts.skillsDir}/
These skill files are READ-ONLY. Never modify anything under ${opts.skillsDir}.

# ACCUMULATED CRAFT LESSONS
Before writing, read every file in ${opts.learningsDir}/ (if it exists and has files). These are lessons from past client work — apply them.

# CLIENT
- Name: ${job.client.name}
- Niche: ${job.client.niche}
- Funnel type: ${job.client.funnelType}
- Price point: ${job.client.pricePoint || "not specified"}
${lessons}${feedback}
# ONBOARDING MATERIAL

${onboarding}

# VOICE MINING RESEARCH

${job.research || "(no research report attached — work from onboarding material alone and note the gap in your lessons)"}

# YOUR TASK
Produce the four Step 1 foundation documents. The STRUCTURE of each document comes from the skills, not from this prompt: follow the mother skill's process and each child skill's document template EXACTLY as the skills define them, section by section. Write each as a complete, polished markdown document into the CURRENT WORKING DIRECTORY with EXACTLY these filenames:

1. 01_icp_snapshot.md (ICP Snapshot)
2. 02_offers.md (Offers)
3. 03_brand_positioning.md (Brand & Positioning)
4. 04_course_outline.md (Course Outline)

Ground every document in the client's actual language from the onboarding transcript and the research verbatims. No generic filler.

# FORMATTING RULES (the docs render in a web app as formatted markdown)
- Clean heading hierarchy: one # title, ## for sections, ### for subsections. Never skip levels.
- Use GitHub-flavored markdown TABLES wherever the skill's template calls for tabular content (sub-avatars, comparisons, pricing tiers, module maps). Real | tables, not bullet lists pretending to be tables.
- Bold the key labels inside prose (e.g. **Pain:**, **Desire:**) so sections scan fast.
- Short paragraphs (3 sentences max), bullets for lists, --- between major sections.
- NO em dashes anywhere. Use commas, colons, or periods instead.
- Write for a reader skimming on screen: every section should be understandable from its heading and first line.

# LESSONS OUTPUT
After the four documents, also write:
5. client_lessons.md — one bullet per lesson that is SPECIFIC TO THIS CLIENT (preferences, quirks, context that future work on this client needs). Write "none" if nothing.
6. craft_lessons.md — lessons that would improve the SKILLS THEMSELVES for every future client. Format strictly as sections:
## skill: <skill-folder-name>
- <lesson>
Write "none" if nothing. Be conservative — only genuinely generalizable improvements.

Write all files, then stop.`;
}

export interface FoundationOutputs {
  docs: Record<string, string>;
  clientLessons: string[];
  craftLessonsRaw: string;
}

/** Map the job dir's files (name → content) to the API's completion payload. */
export function parseFoundationOutputs(files: Record<string, string | undefined>): FoundationOutputs {
  const docs: Record<string, string> = {};
  for (const [filename, docType] of Object.entries(FOUNDATION_FILES)) {
    const content = files[filename]?.trim();
    if (!content || content.length < 50) {
      throw new Error(`Missing or too-short output file: ${filename}`);
    }
    docs[docType] = content;
  }

  const clientLessons = (files["client_lessons.md"] ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 5 && !/^none\.?$/i.test(l));

  return { docs, clientLessons, craftLessonsRaw: files["craft_lessons.md"] ?? "" };
}

export interface CraftLesson {
  skill: string;
  lessons: string;
}

/** Parse craft_lessons.md's "## skill: <name>" sections into per-skill chunks. */
export function parseCraftLessons(raw: string): CraftLesson[] {
  const trimmed = raw.trim();
  if (!trimmed || /^(none\.?|no new craft lessons\.?)$/i.test(trimmed)) return [];

  const out: CraftLesson[] = [];
  const sections = trimmed.split(/^##\s*skill:\s*/im).slice(1);
  for (const section of sections) {
    const newline = section.indexOf("\n");
    const rawName = (newline === -1 ? section : section.slice(0, newline)).trim();
    const body = (newline === -1 ? "" : section.slice(newline + 1)).trim();
    const skill = rawName
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (skill && body) out.push({ skill, lessons: body });
  }
  return out;
}
