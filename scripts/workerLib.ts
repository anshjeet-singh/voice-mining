/**
 * Pure helpers for the local Mac worker: build the headless Claude Code prompt
 * for any claimed pipeline stage, and parse the files it writes back. The
 * server's stage registry ships the stage spec (skills, output files,
 * instructions) inside the claim payload, so this module stays generic.
 * No I/O here — worker.ts owns the filesystem and network.
 */

export interface StageOutputSpec {
  docType: string;
  filename: string;
  title: string;
  description: string;
}

export interface StageSpec {
  label: string;
  motherStep: string;
  childSkills: string[];
  outputs: StageOutputSpec[];
  extraInstructions: string;
}

export interface ClaimedJob {
  id: number;
  type: string;
  stage: StageSpec;
  client: { name: string; niche: string; funnelType: string; pricePoint: string };
  onboardingDocs: Array<{ title: string; docType: string; content: string }>;
  /** Approved artefacts from earlier stages (foundation docs, skool copy, ...). */
  approvedDocs: Array<{ title: string; docType: string; content: string }>;
  research: string;
  lessons: string[];
  feedback: string;
}

export interface PromptOptions {
  /** Read-only claude.ai skills cache holding the agency skills. */
  skillsDir: string;
  /** Git-versioned worker/learnings dir with accumulated craft lessons. */
  learningsDir: string;
  /** Git-versioned worker/frameworks dir: distilled copywriting playbooks. */
  frameworksDir?: string;
}

export function buildStagePrompt(job: ClaimedJob, opts: PromptOptions): string {
  const { stage } = job;

  const onboarding = job.onboardingDocs
    .map((d) => `### ${d.title} (${d.docType})\n\n${d.content}`)
    .join("\n\n---\n\n");

  const approved = job.approvedDocs.length
    ? `\n# APPROVED DOCUMENTS FROM EARLIER STAGES (consume these fully; never work from a summary)\n\n${job.approvedDocs
        .map((d) => `### ${d.title} (${d.docType})\n\n${d.content}`)
        .join("\n\n---\n\n")}\n`
    : "";

  const lessons = job.lessons.length
    ? `\n# CLIENT LESSONS (apply these — feedback from previous work with this client)\n\n${job.lessons.map((l) => `- ${l}`).join("\n")}\n`
    : "";

  const feedback = job.feedback.trim()
    ? `\n# REVISION FEEDBACK (this is a regeneration — the previous version was rejected; fix these issues)\n\n${job.feedback.trim()}\n`
    : "";

  const outputList = stage.outputs
    .map((o, i) => `${i + 1}. ${o.filename} (${o.title}): ${o.description}`)
    .join("\n");

  return `You are running ${stage.motherStep} of the client-onboarding-orchestrator skill for our agency: ${stage.label}.

# MANDATORY READING (do this FIRST, with the Read tool, before writing a single word)
You MUST read, in full, in this order:
1. The mother skill: ${opts.skillsDir}/client-onboarding-orchestrator/SKILL.md
2. EVERY child skill for this stage: ${stage.childSkills.join(", ")} (each lives in its own folder under ${opts.skillsDir}/ as SKILL.md; strip any parenthetical mode note to get the folder name)
3. EVERY file in ${opts.frameworksDir ?? "the frameworks directory"}/ (distilled from the $100M playbooks, Scientific Advertising, Sell Like Crazy, and top-converting funnel teardowns; these set the QUALITY BAR)
4. EVERY file in ${opts.learningsDir}/ (lessons from past client work)

This is not optional. The deliverables must VISIBLY follow the skill templates and pass the framework quality bars. If your draft would read the same without having read these files, you have failed the task. Skill files and framework files are READ-ONLY. Never modify anything under ${opts.skillsDir}.

# CLIENT
- Name: ${job.client.name}
- Niche: ${job.client.niche}
- Funnel type: ${job.client.funnelType}
- Price point: ${job.client.pricePoint || "not specified"}
${lessons}${feedback}${approved}
# ONBOARDING MATERIAL

${onboarding}

# VOICE MINING RESEARCH

${job.research || "(no research report attached — work from the documents above and note the gap in your lessons)"}

# YOUR TASK
Produce the deliverables for ${stage.label}. The STRUCTURE of each document comes from the skills, not from this prompt: follow the mother skill's process and each child skill's template EXACTLY, section by section. ${stage.extraInstructions}

Write each deliverable as a complete, polished markdown document into the CURRENT WORKING DIRECTORY with EXACTLY these filenames:

${outputList}

# FORMATTING RULES (the docs render in a web app as formatted markdown)
- Clean heading hierarchy: one # title, ## for sections, ### for subsections. Never skip levels.
- Use GitHub-flavored markdown TABLES wherever the skill's template calls for tabular content. Real | tables, not bullet lists pretending to be tables.
- Bold the key labels inside prose so sections scan fast.
- Short paragraphs (3 sentences max), bullets for lists, --- between major sections.
- NO em dashes anywhere. Use commas, colons, or periods instead.
- Write for a reader skimming on screen: every section should be understandable from its heading and first line.

# LESSONS OUTPUT
After the deliverables, also write:
- client_lessons.md — one bullet per lesson that is SPECIFIC TO THIS CLIENT (preferences, quirks, context that future work on this client needs). Write "none" if nothing.
- craft_lessons.md — lessons that would improve the SKILLS THEMSELVES for every future client. Format strictly as sections:
## skill: <skill-folder-name>
- <lesson>
Write "none" if nothing. Be conservative — only genuinely generalizable improvements.

Write all files, then stop.`;
}

export interface StageOutputs {
  docs: Record<string, string>;
  clientLessons: string[];
  craftLessonsRaw: string;
}

/** Map the job dir's files (name -> content) to the API's completion payload. */
export function parseStageOutputs(
  files: Record<string, string | undefined>,
  outputs: StageOutputSpec[]
): StageOutputs {
  const docs: Record<string, string> = {};
  for (const { filename, docType } of outputs) {
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
