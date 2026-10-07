/**
 * Scaffold a client site's spec spine under `.hitchhiker/`.
 * Files come from the ported GSD templates. Nothing is written into `.planning`,
 * and that directory is never deleted. Requirement rows stay empty.
 * Prompt ranges stay TBD for the prompt package.
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { replaceViaTemp, withStateLock } from "../lock.ts";
import { renderTemplate } from "../templates.ts";

export class ScaffoldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScaffoldError";
  }
}

export interface ProjectInfo {
  name: string;
  siteWhy: string;
  hosting: string;
  acknowledgeForeignPlanning?: boolean;
  /** Epoch milliseconds. The written date is UTC `YYYY-MM-DD`. Defaults to Date.now. */
  now?: () => number;
}

interface PhaseSpec {
  dir: string;
  number: number;
  title: string;
  goal: string;
  criteria: readonly string[];
  slices: readonly string[];
}

const PHASES: readonly PhaseSpec[] = [
  {
    dir: "01-dont-panic",
    number: 1,
    title: "Don't Panic",
    goal: "Approve the site brief and record the interview",
    criteria: [
      "The user has approved the site brief",
      "Interview notes and project context are on disk",
    ],
    slices: [
      "Towel Check",
      "Ford's Field Notes",
      "The Question",
      "Vogon Neighbors",
      "Point-of-View Gun",
      "Pan Galactic Gargle Blaster",
      "Bistromathics",
      "Guide Entry",
    ],
  },
  {
    dir: "02-babel-fish",
    number: 2,
    title: "Babel Fish",
    goal: "Approve the brand kit item by item",
    criteria: [
      "The user has approved the brand kit item by item",
      "Voice, logo, and tokens are recorded",
    ],
    slices: [
      "Deep Why",
      "Heart of Gold",
      "Sens-O-Matic",
      "Magrathean Logo Works",
      "Babel Voice",
      "Hyperspace Bypass",
      "The Brand Brain",
    ],
  },
  {
    dir: "03-deep-thought",
    number: 3,
    title: "Deep Thought",
    goal: "Approve the PRD, the context document, and the prompt list",
    criteria: [
      "The user has approved the PRD, the context document, and the prompt list",
      "Requirement ids map to the six phases",
    ],
    slices: [
      "Seven and a Half Million Years",
      "The Ultimate Question",
      "Earth Mk II Blueprints",
      "Infinite Monkeys",
    ],
  },
  {
    dir: "04-improbability-drive",
    number: 4,
    title: "Improbability Drive",
    goal: "Build the site from the approved prompts",
    criteria: [
      "Every prompt is done or explicitly deferred",
      "No open blocker remains",
    ],
    slices: [
      "Vogon Constructor Fleet",
      "Infinite Improbability",
      "Milliways Menu",
      "Somebody Else's Problem Field",
      "Pan Galactic Gargle Blaster",
      "Magrathea",
      "Sub-Etha Signal",
    ],
  },
  {
    dir: "05-mostly-harmless",
    number: 5,
    title: "Mostly Harmless",
    goal: "Pass the quality gates and sign off",
    criteria: ["The quality gates pass", "The user signs off"],
    slices: [
      "Nutrimatic Test",
      "Total Perspective Vortex",
      "Slartibartfast's Fjords",
    ],
  },
  {
    dir: "06-so-long",
    number: 6,
    title: "So Long and Thanks for All the Fish",
    goal: "Deploy after an explicit yes and hand the site over",
    criteria: ["The user approved the deploy", "The live URL is healthy"],
    slices: ["Milliways at the End", "Share and Enjoy"],
  },
];

const SPINE_FILES = [
  "PROJECT.md",
  "REQUIREMENTS.md",
  "ROADMAP.md",
  "STATE.md",
] as const;

function requiredText(value: string, emptyMessage: string, newlineMessage: string): string {
  if (value.includes("\n") || value.includes("\r")) {
    throw new ScaffoldError(newlineMessage);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ScaffoldError(emptyMessage);
  }
  return trimmed;
}

function isoDate(now: () => number): string {
  const value = new Date(now());
  if (Number.isNaN(value.getTime())) {
    throw new ScaffoldError("Clock did not return a valid time.");
  }
  return value.toISOString().slice(0, 10);
}

function firstMarkdownFence(rendered: string): string {
  const match = rendered.match(/```markdown\n([\s\S]*?)\n```/);
  const body = match?.[1];
  if (body === undefined) {
    throw new ScaffoldError("Spine template is missing its markdown body.");
  }
  return `${body}\n`;
}

function requireIncludes(rendered: string, needle: string, label: string): void {
  if (!rendered.includes(needle)) {
    throw new ScaffoldError(`${label} template is missing ${needle}.`);
  }
}

function snippet(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  if (from < 0) {
    throw new ScaffoldError(`Roadmap template is missing ${start}.`);
  }
  const to = source.indexOf(end, from + start.length);
  if (to < 0) {
    throw new ScaffoldError(`Roadmap template is missing the end after ${start}.`);
  }
  return source.slice(from, to).trimEnd();
}

function headingLevel(heading: string): number {
  const match = /^(#{1,6}) /.exec(heading);
  if (match?.[1] === undefined) {
    throw new ScaffoldError(`Not a heading: ${heading}.`);
  }
  return match[1].length;
}

/**
 * Replace the body under `heading` through the next same-or-higher heading, or a `---` rule.
 * Deeper headings belong to the section, so example rows under them are removed with it.
 */
function setSection(markdown: string, heading: string, body: string): string {
  const level = headingLevel(heading);
  const marker = `\n${heading}\n`;
  const start = markdown.indexOf(marker);
  if (start < 0) {
    throw new ScaffoldError(`Template is missing heading ${heading}.`);
  }
  const contentStart = start + marker.length;
  const rest = markdown.slice(contentStart);
  const lines = rest.split("\n");
  let offset = 0;
  let cut = rest.length;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const hashes = /^(#{1,6}) /.exec(line);
    const isBoundary =
      line === "---" || (hashes?.[1] !== undefined && hashes[1].length <= level);
    if (isBoundary) {
      cut = index === 0 ? 0 : offset - 1;
      break;
    }
    offset += line.length + 1;
  }
  return `${markdown.slice(0, contentStart)}\n${body.trim()}\n${rest.slice(cut)}`;
}

function replaceLine(markdown: string, prefix: string, next: string): string {
  const lines = markdown.split("\n");
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index < 0) {
    throw new ScaffoldError(`Template is missing a line starting with ${prefix}.`);
  }
  lines[index] = next;
  return lines.join("\n");
}

function fillProject(
  rendered: string,
  facts: { name: string; siteWhy: string; hosting: string; date: string },
): string {
  requireIncludes(rendered, "## What This Is", "project");
  requireIncludes(rendered, "## Core Value", "project");
  requireIncludes(rendered, "## Constraints", "project");
  let body = firstMarkdownFence(rendered);
  if (!body.startsWith(`# ${facts.name}\n`)) {
    throw new ScaffoldError("Project template did not receive the project name.");
  }
  body = setSection(body, "## What This Is", facts.siteWhy);
  body = setSection(body, "## Core Value", facts.siteWhy);
  body = setSection(body, "## Business Context", "None recorded yet.");
  body = setSection(body, "### Validated", "(None yet)");
  body = setSection(body, "### Active", "(None yet)");
  body = setSection(body, "### Out of Scope", "(None yet)");
  body = setSection(body, "## Context", `Hosting: ${facts.hosting}`);
  body = setSection(body, "## Constraints", `- **Hosting**: ${facts.hosting}`);
  body = setSection(
    body,
    "## Key Decisions",
    ["| Decision | Rationale | Outcome |", "|----------|-----------|---------|"].join("\n"),
  );
  body = replaceLine(body, "*Last updated:", `*Last updated: ${facts.date} after scaffold*`);
  return body;
}

function fillRequirements(
  rendered: string,
  facts: { name: string; siteWhy: string; date: string },
): string {
  requireIncludes(rendered, "## v1 Requirements", "requirements");
  requireIncludes(rendered, "## Traceability", "requirements");
  requireIncludes(rendered, "| Requirement | Phase | Status |", "requirements");
  requireIncludes(rendered, "| Feature | Reason |", "requirements");
  let body = firstMarkdownFence(rendered);
  body = replaceLine(body, "# Requirements:", `# Requirements: ${facts.name}`);
  body = replaceLine(body, "**Defined:**", `**Defined:** ${facts.date}`);
  body = replaceLine(body, "**Core Value:**", `**Core Value:** ${facts.siteWhy}`);
  body = setSection(body, "## v1 Requirements", "Ids only. None yet.");
  body = setSection(body, "## v2 Requirements", "Ids only. None yet.");
  body = setSection(
    body,
    "## Out of Scope",
    ["| Feature | Reason |", "|---------|--------|"].join("\n"),
  );
  body = setSection(
    body,
    "## Traceability",
    [
      "| Requirement | Phase | Status |",
      "|-------------|-------|--------|",
      "",
      "**Coverage:**",
      "- v1 requirements: 0 total",
      "- Mapped to phases: 0",
      "- Unmapped: 0",
    ].join("\n"),
  );
  body = replaceLine(body, "*Requirements defined:", `*Requirements defined: ${facts.date}*`);
  body = replaceLine(body, "*Last updated:", `*Last updated: ${facts.date} after scaffold*`);
  return body.endsWith("\n") ? body : `${body}\n`;
}

function phaseDetails(phase: PhaseSpec): string {
  const previous = phase.number === 1 ? "Nothing (first phase)" : `Phase ${phase.number - 1}`;
  const criteria = phase.criteria.map((line, index) => `  ${index + 1}. ${line}`).join("\n");
  const plans = phase.slices.map((slice) => `- [ ] ${slice}: prompt range TBD`).join("\n");
  return [
    `### Phase ${phase.number}: ${phase.title}`,
    `**Goal**: ${phase.goal}`,
    `**Depends on**: ${previous}`,
    "**Requirements**: (none yet)",
    "**Success Criteria** (what must be TRUE):",
    criteria,
    "**Plans**: TBD",
    "",
    "Plans:",
    plans,
  ].join("\n");
}

function fillRoadmap(rendered: string, facts: { name: string; siteWhy: string }): string {
  const fence = firstMarkdownFence(rendered);
  for (const needle of [
    "## Overview",
    "## Phases",
    "## Phase Details",
    "## Progress",
    "**Goal**",
    "**Depends on**",
    "**Requirements**",
    "**Success Criteria**",
    "**Plans**",
    "| Phase | Plans Complete | Status | Completed |",
  ]) {
    requireIncludes(fence, needle, "roadmap");
  }
  const numbering = snippet(fence, "**Phase Numbering:**", "\n- [ ]");
  const execution = snippet(fence, "**Execution Order:**", "\n| Phase |");
  const checked = PHASES.map(
    (phase) => `- [ ] **Phase ${phase.number}: ${phase.title}** - ${phase.goal}`,
  ).join("\n");
  const details = PHASES.map((phase) => phaseDetails(phase)).join("\n\n");
  const progress = PHASES.map(
    (phase) => `| ${phase.number}. ${phase.title} | 0/TBD | Not started | - |`,
  ).join("\n");
  return [
    `# Roadmap: ${facts.name}`,
    "",
    "## Overview",
    "",
    facts.siteWhy,
    "",
    "Six locked phases carry this site. Prompt ranges stay open.",
    "",
    "## Phases",
    "",
    numbering,
    "",
    checked,
    "",
    "## Phase Details",
    "",
    details,
    "",
    "## Progress",
    "",
    execution,
    "",
    "| Phase | Plans Complete | Status | Completed |",
    "|-------|----------------|--------|-----------|",
    progress,
    "",
  ].join("\n");
}

function fillState(rendered: string, facts: { siteWhy: string; date: string }): string {
  requireIncludes(rendered, "## Current Position", "state");
  requireIncludes(rendered, "Prompt id:", "state");
  let body = firstMarkdownFence(rendered);
  body = replaceLine(body, "  total_phases:", "  total_phases: 6");
  body = replaceLine(body, "**Core value:**", `**Core value:** ${facts.siteWhy}`);
  body = replaceLine(body, "**Current focus:**", "**Current focus:** Deep Thought");
  body = replaceLine(body, "Phase:", "Phase: 3 of 6 (Deep Thought)");
  body = replaceLine(body, "Slice:", "Slice: Seven and a Half Million Years");
  body = replaceLine(body, "Prompt id:", "Prompt id: scaffold");
  body = replaceLine(body, "Plan:", "Plan: TBD of TBD in current phase");
  body = replaceLine(body, "Status:", "Status: Planning");
  body = replaceLine(body, "Last good commit:", "Last good commit: none");
  body = replaceLine(body, "Last activity:", `Last activity: ${facts.date} scaffolded project files`);
  body = replaceLine(body, "Blockers:", "Blockers: None");
  body = replaceLine(body, "Next action:", "Next action: Write the PRD");
  if (!body.includes("Deep Thought") || !body.includes("Write the PRD")) {
    throw new ScaffoldError("State template did not take the scaffold position.");
  }
  return body;
}

function assertSafe(body: string, label: string): void {
  if (body.includes("{{")) {
    throw new ScaffoldError(`${label} still contains a raw token.`);
  }
  if (body.includes(".planning")) {
    throw new ScaffoldError(`${label} mentions .planning.`);
  }
  if (/^\s*- \[[xX]\]/m.test(body)) {
    throw new ScaffoldError(`${label} checks off a phase.`);
  }
}

/**
 * Create `.hitchhiker` project, requirements, roadmap, and state for one site.
 * Returns the relative paths written. Does not write a PRD.
 */
export async function scaffoldProject(dir: string, info: ProjectInfo): Promise<string[]> {
  const name = requiredText(info.name, "Project name is empty.", "Project name contains a newline.");
  const siteWhy = requiredText(info.siteWhy, "siteWhy is empty.", "siteWhy contains a newline.");
  const hosting = requiredText(info.hosting, "hosting is empty.", "hosting contains a newline.");
  const date = isoDate(info.now ?? Date.now);
  const acknowledged = info.acknowledgeForeignPlanning === true;
  const planningPath = path.join(dir, ".planning");
  const hitchhiker = path.join(dir, ".hitchhiker");
  const projectPath = path.join(hitchhiker, "PROJECT.md");

  if (existsSync(planningPath) && !acknowledged) {
    throw new ScaffoldError(
      "A .planning directory already exists. Pass acknowledgeForeignPlanning to scaffold beside it.",
    );
  }
  if (existsSync(projectPath)) {
    throw new ScaffoldError(".hitchhiker/PROJECT.md already exists.");
  }

  const vars = { project_name: name, date };
  const renderedProject = renderTemplate("project", vars);
  const renderedRequirements = renderTemplate("requirements", vars);
  const renderedRoadmap = renderTemplate("roadmap", vars);
  const renderedState = renderTemplate("state", vars);

  const files: { name: (typeof SPINE_FILES)[number]; body: string }[] = [
    {
      name: "PROJECT.md",
      body: fillProject(renderedProject, { name, siteWhy, hosting, date }),
    },
    {
      name: "REQUIREMENTS.md",
      body: fillRequirements(renderedRequirements, { name, siteWhy, date }),
    },
    {
      name: "ROADMAP.md",
      body: fillRoadmap(renderedRoadmap, { name, siteWhy }),
    },
    {
      name: "STATE.md",
      body: fillState(renderedState, { siteWhy, date }),
    },
  ];
  for (const file of files) {
    assertSafe(file.body, file.name);
  }

  await withStateLock(dir, async () => {
    if (existsSync(planningPath) && info.acknowledgeForeignPlanning !== true) {
      throw new ScaffoldError(
        "A .planning directory already exists. Pass acknowledgeForeignPlanning to scaffold beside it.",
      );
    }
    if (existsSync(projectPath)) {
      throw new ScaffoldError(".hitchhiker/PROJECT.md already exists.");
    }
    for (const phase of PHASES) {
      await mkdir(path.join(hitchhiker, "phases", phase.dir), { recursive: true });
    }
    for (const file of files) {
      await replaceViaTemp(path.join(hitchhiker, file.name), file.body);
    }
  });

  return files.map((file) => path.join(".hitchhiker", file.name));
}
