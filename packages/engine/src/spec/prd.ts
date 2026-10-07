/**
 * Seventeen-section site PRD.
 *
 * Pure. The caller writes `.hitchhiker/PRD.md`.
 * Sections 1, 4, 6, 9, and 16 are filled from the interview and the brand
 * excerpt. The 011 adapter is not called here: the locked signature has no
 * adapter argument. This module owns the headings, the assumptions list,
 * the REQ-IDs, and the pending approval line.
 *
 * AnswerRecord stores a skip as SKIPPED, not ASSUMED. The assumptions list
 * is the parallel record of those skips (the value is the assumed text)
 * plus every SOFT answer. ANSWERED, SUGGESTED, and IMPORTED stay out.
 */

import { missingRequired, type AnswerRecord } from "../required.ts";
import { SITE_TYPES, type SiteTypeHint } from "../site-types.ts";

export class PrdError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(`Cannot render a PRD. Missing required fields: ${missing.join(", ")}.`);
    this.name = "PrdError";
    this.missing = [...missing];
  }
}

const BRAND_WORD_CAP = 120;

const HEADINGS = [
  "1. Summary",
  "2. Users and personas",
  "3. KPIs and tracking plan",
  "4. Positioning and messaging hierarchy",
  "5. Information architecture",
  "6. Section plan summary",
  "7. Functional requirements",
  "8. Content requirements",
  "9. Visual and motion requirements",
  "10. 3D and media requirements",
  "11. Non-functional requirements",
  "12. Tech stack decision",
  "13. Deploy plan",
  "14. Assumptions",
  "15. Out of scope / Version 2 list",
  "16. Risks",
  "17. Approval",
] as const;

interface ReqSpec {
  id: string;
  label: string;
  sources: readonly string[];
}

const REQS: readonly ReqSpec[] = [
  { id: "REQ-FORM-01", label: "Contact or email intake", sources: ["DP-3.1"] },
  { id: "REQ-PAY-01", label: "Payments and products", sources: ["DP-3.2"] },
  { id: "REQ-BOOK-01", label: "Bookings, reservations, or calls", sources: ["DP-3.3"] },
  { id: "REQ-CMS-01", label: "CMS and later self-serve edits", sources: ["DP-3.5"] },
  { id: "REQ-BLOG-01", label: "Blog", sources: ["DP-4.3"] },
  { id: "REQ-ANLYT-01", label: "Analytics", sources: ["DP-3.8"] },
  {
    id: "REQ-INT-01",
    label: "Integrations, newsletter, locales, and special features",
    sources: ["DP-3.4", "DP-3.7", "DP-3.9"],
  },
];

interface Assumption {
  id: string;
  value: string;
  status: "SKIPPED" | "SOFT";
}

/**
 * Newlines become spaces so an assumption stays one line.
 * Exclamation marks are dropped so the PRD never carries one.
 */
function flatten(value: string): string {
  return value
    .replace(/\r\n|[\r\n]/g, " ")
    .replace(/[!！]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

function latestById(answers: readonly AnswerRecord[]): Map<string, AnswerRecord> {
  const latest = new Map<string, AnswerRecord>();
  for (const answer of answers) latest.set(answer.id, answer);
  return latest;
}

/**
 * Parallel list of stored assumptions.
 * A SKIPPED row is included because its value is the assumed text.
 * SOFT is included as itself. The parenthesis uses that same status word.
 */
function assumptionList(latest: ReadonlyMap<string, AnswerRecord>): Assumption[] {
  const list: Assumption[] = [];
  for (const record of latest.values()) {
    if (record.status === "SKIPPED" || record.status === "SOFT") {
      list.push({ id: record.id, value: flatten(record.value), status: record.status });
    }
  }
  return list;
}

function wordsOf(markdown: string): string[] {
  const trimmed = markdown.trim();
  if (trimmed === "") return [];
  const words: string[] = [];
  for (const word of trimmed.split(/\s+/)) {
    const cleaned = word.replace(/[!！]/g, "");
    if (cleaned !== "") words.push(cleaned);
  }
  return words;
}

function brandExcerpt(markdown: string): { text: string; cut: boolean } {
  const words = wordsOf(markdown);
  if (words.length <= BRAND_WORD_CAP) return { text: words.join(" "), cut: false };
  return { text: words.slice(0, BRAND_WORD_CAP).join(" "), cut: true };
}

function settled(record: AnswerRecord | undefined): record is AnswerRecord {
  if (record === undefined) return false;
  if (flatten(record.value) === "") return false;
  return record.status === "ANSWERED" || record.status === "SUGGESTED" || record.status === "IMPORTED";
}

function withPeriod(value: string): string {
  if (value.endsWith(".") || value.endsWith("?")) return value;
  return `${value}.`;
}

function show(record: AnswerRecord | undefined, label: string): string {
  if (record === undefined || flatten(record.value) === "") {
    return `${label} is not recorded.`;
  }
  if (record.status === "SOFT" || record.status === "SKIPPED") {
    return `${label} is not settled (${record.status}). See Assumptions.`;
  }
  if (record.status === "IMPORTED") return `${label}, imported: ${withPeriod(flatten(record.value))}`;
  if (record.status === "SUGGESTED") {
    return `${label}, suggested and stored: ${withPeriod(flatten(record.value))}`;
  }
  return `${label}: ${withPeriod(flatten(record.value))}`;
}

function tokens(value: string): Set<string> {
  const found = value.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [];
  return new Set(found);
}

function matchedTypes(value: string): SiteTypeHint[] {
  const words = tokens(value);
  return SITE_TYPES.filter((type) => words.has(type.id));
}

function section(title: string, body: readonly string[]): string {
  return [`## ${title}`, "", ...body].join("\n");
}

function summary(latest: ReadonlyMap<string, AnswerRecord>, name: string): string {
  const flat = flatten(name);
  const intro = flat === "" ? "This PRD describes the site." : `${flat} is the site this PRD describes.`;
  return section("1. Summary", [
    intro,
    show(latest.get("DP-2.1"), "Goal"),
    show(latest.get("DP-2.2"), "One action"),
    show(latest.get("DP-2.3"), "Site types"),
  ]);
}

function users(latest: ReadonlyMap<string, AnswerRecord>): string {
  return section("2. Users and personas", [
    show(latest.get("DP-2.6"), "Visitor"),
    "The interview names one visitor. A second persona is not added here.",
  ]);
}

function kpis(latest: ReadonlyMap<string, AnswerRecord>): string {
  const lines = [
    "The tracking plan lives in `.hitchhiker/KPIS.md`.",
    "Outcome words only. A rate, a volume, or a percent is quoted only when the interview recorded it.",
    "",
  ];
  const siteType = latest.get("DP-2.3");
  if (!settled(siteType)) {
    lines.push("Site type is not settled, so no outcome phrase is attached.");
  } else {
    const matches = matchedTypes(flatten(siteType.value));
    if (matches.length === 0) {
      lines.push("The recorded site type does not match a known pack, so no outcome phrase is attached.");
    } else {
      lines.push("Outcome words from the site-type pack. These are labels, not target figures.");
      for (const type of matches) {
        lines.push(`- ${type.id}: ${type.kpi}`);
      }
    }
  }
  lines.push(show(latest.get("DP-2.4"), "Key outcome"));
  return section("3. KPIs and tracking plan", lines);
}

function positioning(brandMarkdown: string): string {
  const excerpt = brandExcerpt(brandMarkdown);
  const lines = [
    "Positioning is quoted from the brand file. Voice rules live in `.hitchhiker/VOICE.md`.",
    "",
  ];
  if (excerpt.text === "") {
    lines.push("The brand file has no words yet.");
  } else {
    lines.push(`Brand excerpt: ${excerpt.text}`);
  }
  if (excerpt.cut) {
    lines.push("The excerpt stops at 120 words, on a word boundary.");
  } else {
    lines.push("The excerpt is the full brand file.");
  }
  lines.push("Full brand: `.hitchhiker/BRAND.md`.");
  return section("4. Positioning and messaging hierarchy", lines);
}

function architecture(latest: ReadonlyMap<string, AnswerRecord>): string {
  return section("5. Information architecture", [
    show(latest.get("DP-2.8"), "Pages"),
    show(latest.get("DP-2.5"), "Shape"),
    "Nav follows the recorded page list. This PRD adds no extra pages.",
  ]);
}

function sectionPlan(latest: ReadonlyMap<string, AnswerRecord>): string {
  return section("6. Section plan summary", [
    "Each section gets one job and one wow. Both are written in `.hitchhiker/SECTION-PLAN.md`.",
    "This summary leaves the job and the wow for that file.",
    show(latest.get("DP-2.8"), "Pages on the plan"),
  ]);
}

function sourceNote(record: AnswerRecord | undefined, id: string): string {
  if (record === undefined || flatten(record.value) === "") return `${id} not recorded`;
  if (record.status === "SOFT" || record.status === "SKIPPED") {
    return `${id} not settled (${record.status})`;
  }
  return `${id} recorded: ${flatten(record.value)}`;
}

function functional(latest: ReadonlyMap<string, AnswerRecord>): string {
  const lines = [
    "Each requirement below traces to an interview id. An unsettled source stays in Assumptions.",
  ];
  for (const req of REQS) {
    const notes = req.sources.map((id) => sourceNote(latest.get(id), id));
    lines.push(`- **${req.id}**: ${req.label}. ${notes.join(". ")}.`);
  }
  return section("7. Functional requirements", lines);
}

function content(latest: ReadonlyMap<string, AnswerRecord>): string {
  return section("8. Content requirements", [
    "Real proof only. Testimonials, awards, client names, and figures need a recorded source.",
    show(latest.get("DP-8.1"), "Copy source"),
    show(latest.get("DP-8.2"), "Proof on record"),
    show(latest.get("DP-8.3"), "Blog plan"),
    show(latest.get("DP-4.3"), "Keywords"),
    show(latest.get("DP-8.4"), "Legal pages and claims to avoid"),
  ]);
}

function visual(latest: ReadonlyMap<string, AnswerRecord>): string {
  return section("9. Visual and motion requirements", [
    "Visual direction lives in `.hitchhiker/VISUAL-DIRECTION.md`. Motion lives in `.hitchhiker/MOTION.md`.",
    "The toolkit is chosen per effect in MOTION.md and is not a library dump on every page.",
    show(latest.get("DP-5.3"), "Vibe"),
    show(latest.get("DP-6.2"), "Motion level"),
    show(latest.get("DP-6.1"), "Motion families"),
    show(latest.get("DP-5.4"), "Signature moment"),
    show(latest.get("DP-5.5"), "Light"),
    show(latest.get("DP-5.6"), "Imagery"),
  ]);
}

function media(latest: ReadonlyMap<string, AnswerRecord>): string {
  return section("10. 3D and media requirements", [
    show(latest.get("DP-6.4"), "3D source"),
    show(latest.get("DP-3.6"), "Media"),
    show(latest.get("DP-6.5"), "Phone motion"),
    show(latest.get("DP-7.1"), "Stills and clips spend"),
    show(latest.get("DP-7.2"), "Custom 3D budget"),
    "Licenses and grades live in `.hitchhiker/ASSETS.md`.",
    "A phone receives the phone path. A missing phone fallback is a blocker.",
  ]);
}

function nonFunctional(): string {
  return section("11. Non-functional requirements", [
    "Lighthouse mobile is at least 90 in all four categories: performance, accessibility, best practices, and SEO.",
    "The floor is measured on real mobile runs of what a phone actually gets (D-006): the LHCI mobile preset, throttled, the median of 3 runs, every route as a phone receives it.",
    "A desktop scene does not waive the phone.",
    "On the phone path, LCP is at most 2.5 s and CLS is at most 0.1. INP at most 200 ms is a lab-proxy target measured with an interaction script.",
    "Accessibility is WCAG 2.2 AA.",
    "Browser support: current-minus-two browsers.",
    "SEO on that phone run includes a unique title, one H1, alt text, a sitemap, robots, a canonical, and JSON-LD that matches the page.",
    "Privacy follows the analytics answer. No tracker is added beyond what that answer records.",
  ]);
}

function stack(): string {
  return section("12. Tech stack decision", [
    "The stack record is `.hitchhiker/research/STACK-DECISION.md`. This PRD does not lock a framework. The user may override it.",
    "Default rules for that file:",
    "- Astro for brand, marketing, portfolio, and content sites, and for motion levels 1 to 9.",
    "- Next.js for app features or one persistent canvas across routes.",
    "- Vite and React for a single-page level 10 world.",
    "- SvelteKit if the user insists. The 3D ecosystem is thinner there.",
    "- Inventory-heavy commerce uses a Shopify Buy Button or Storefront, or an escalation.",
    "Versions are re-resolved at lock time from the registry.",
  ]);
}

function deploy(latest: ReadonlyMap<string, AnswerRecord>): string {
  return section("13. Deploy plan", [
    show(latest.get("DP-9.2"), "Hosting"),
    show(latest.get("DP-9.1"), "Deadline"),
    show(latest.get("DP-9.3"), "Maintenance"),
    "Deploy runs only after an explicit yes. DEPLOY.md and the rollback steps are written at launch.",
    "Adapters the Guide can use are Hostinger, Vercel, Netlify, and Cloudflare. The recorded hosting answer wins.",
  ]);
}

function assumptions(list: readonly Assumption[]): string {
  const lines = [
    "SKIPPED means the value is the assumed text. SOFT is an answer kept after pushback. Neither status is a decision. ANSWERED, SUGGESTED, and IMPORTED fields are omitted.",
    "",
  ];
  if (list.length === 0) {
    lines.push("No skipped or soft fields are on record.");
  } else {
    for (const item of list) {
      lines.push(`- ${item.id}: ${item.value} (${item.status})`);
    }
  }
  return section("14. Assumptions", lines);
}

function outOfScope(): string {
  return section("15. Out of scope / Version 2 list", [
    "- A full Shopify store is out unless a later escalation says otherwise.",
    "- Version 2 is every field still not settled under Assumptions. Those lines stay out of the build until a later pass records them.",
  ]);
}

function risks(): string {
  return section("16. Risks", [
    "Soft and skipped fields live under Assumptions. Treating one of them as a decision is the risk this list exists to catch.",
    "Phone performance is specified under Non-functional requirements, including the real mobile floor of 90. A later pass does not lower that floor.",
    "Proof, rates, and volumes the interview did not record must stay off the site.",
    "The framework stays unlocked until STACK-DECISION.md is written. The user may override that record.",
  ]);
}

function approval(): string {
  return section("17. Approval", [
    "PRD approval: pending",
    "This renderer leaves the PRD unsigned. CONTEXT.md and the prompt list wait for the same sign-off.",
  ]);
}

function headingBlock(name: string): string {
  const flat = flatten(name);
  return flat === "" ? "# PRD" : `# ${flat} PRD`;
}

export function renderPrd(input: {
  answers: AnswerRecord[];
  brandMarkdown: string;
  name: string;
}): { markdown: string } {
  const missing = missingRequired(input.answers);
  if (missing.length > 0) throw new PrdError(missing);

  const latest = latestById(input.answers);
  const assumed = assumptionList(latest);
  const blocks = [
    headingBlock(input.name),
    summary(latest, input.name),
    users(latest),
    kpis(latest),
    positioning(input.brandMarkdown),
    architecture(latest),
    sectionPlan(latest),
    functional(latest),
    content(latest),
    visual(latest),
    media(latest),
    nonFunctional(),
    stack(),
    deploy(latest),
    assumptions(assumed),
    outOfScope(),
    risks(),
    approval(),
  ];
  return { markdown: `${blocks.join("\n\n")}\n` };
}
