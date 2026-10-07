import assert from "node:assert/strict";
import { test } from "node:test";
import { SITE_RULES } from "../src/spec/site-rules.ts";
import {
  MOTION_BIND_SENTENCE,
  generateSkeleton,
  type SitePrompt,
  type SitePromptSkeleton,
  type SiteSkeletonInput,
  type SiteStack,
} from "../src/spec/site-prompts.ts";
import { validatePackage, type ValidationReport } from "../src/spec/site-validate.ts";

function calmInput(stack: SiteStack = "astro"): SiteSkeletonInput {
  return {
    pages: [
      { id: "home", title: "Home", sections: ["hero", "offer", "proof"] },
      { id: "work", title: "Work", sections: ["selected", "process"] },
      { id: "visit", title: "Visit", sections: ["hours", "find"] },
    ],
    effects: [{ id: "hero-mark", library: "css-scroll", sectionId: "hero", page: "home" }],
    features: ["contact form"],
    integrations: ["resend"],
    seoItems: ["sitemap", "json-ld"],
    stack,
    protectedPaths: ["src/pages/index.astro#splash"],
  };
}

function bodyFor(entry: SitePromptSkeleton): string {
  const motion =
    entry.library === undefined
      ? ""
      : `\n${entry.library}\n${MOTION_BIND_SENTENCE}\n`;
  return [
    "<objective>",
    entry.title,
    "</objective>",
    "<read_first>",
    "@.hitchhiker/CONTEXT.md#section-plan",
    "</read_first>",
    "<task>",
    entry.title,
    motion,
    "</task>",
    "<must_haves>",
    `truths: [${JSON.stringify(entry.title)}]`,
    `artifacts: [${JSON.stringify(entry.filesModified[0] ?? entry.id)}]`,
    `key_links: [${JSON.stringify(`${entry.id} follows its depends_on`)}]`,
    `prohibitions: ["Do not invent testimonials"]`,
    "</must_haves>",
    "<verify>",
    "npm run build",
    "</verify>",
    "<report_back>",
    "Report the files and anything assumed.",
    "</report_back>",
    "<commit>",
    `feat(site): ${entry.id}`,
    "</commit>",
  ].join("\n");
}

function seal(input: SiteSkeletonInput = calmInput()): SitePrompt[] {
  return generateSkeleton(input).prompts.map((entry) => ({
    ...entry,
    rules: SITE_RULES,
    body: bodyFor(entry),
  }));
}

function onlyRule(report: ValidationReport, rule: string): void {
  const rules = [...new Set(report.errors.map((error) => error.rule))];
  assert.equal(report.ok, false, JSON.stringify(report.errors, null, 2));
  assert.deepEqual(rules, [rule], JSON.stringify(report.errors, null, 2));
}

test("validatePackage accepts a generated package for each stack", () => {
  for (const stack of ["astro", "next", "vite-react", "sveltekit"] as const) {
    const report = validatePackage(seal(calmInput(stack)));
    assert.equal(report.ok, true, `${stack} ${JSON.stringify(report.errors, null, 2)}`);
  }
});

test("rules-identical: every entry uses the shared RULES string", () => {
  const prompts = seal();
  for (const prompt of prompts) {
    assert.equal(prompt.rules, SITE_RULES);
  }
  const broken = structuredClone(prompts);
  const first = broken[0];
  assert.ok(first);
  first.rules = `${SITE_RULES}\nExtra line.`;
  onlyRule(validatePackage(broken), "rules-identical");
});

test("frontmatter-complete rejects an empty id", () => {
  const prompts = seal();
  const last = prompts.at(-1);
  assert.ok(last);
  last.id = "";
  onlyRule(validatePackage(prompts), "frontmatter-complete");
});

test("read-first-anchor requires a CONTEXT.md anchor", () => {
  const prompts = seal();
  const first = prompts[0];
  assert.ok(first);
  first.body = first.body.replaceAll(
    "@.hitchhiker/CONTEXT.md#section-plan",
    "@.hitchhiker/MOTION.md",
  );
  onlyRule(validatePackage(prompts), "read-first-anchor");
});

test("must-haves rejects an empty prohibitions list", () => {
  const prompts = seal();
  const first = prompts[0];
  assert.ok(first);
  first.body = first.body.replace(
    'prohibitions: ["Do not invent testimonials"]',
    "prohibitions: []",
  );
  onlyRule(validatePackage(prompts), "must-haves");
});

test("must-haves accepts the list form", () => {
  const prompts = seal();
  const first = prompts[0];
  assert.ok(first);
  first.body = first.body.replace(
    /<must_haves>[\s\S]*?<\/must_haves>/,
    [
      "<must_haves>",
      "truths:",
      "- The route table lists the approved pages",
      "artifacts:",
      "- src/data/routes.ts",
      "key_links:",
      "- The nav reads the route table",
      "prohibitions:",
      "- Do not add a page that was not approved",
      "</must_haves>",
    ].join("\n"),
  );
  const report = validatePackage(prompts);
  assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
});

test("no-as-before rejects a body containing as before", () => {
  const prompts = seal();
  const first = prompts[0];
  assert.ok(first);
  first.body = first.body.replace("</task>", "as before\n</task>");
  onlyRule(validatePackage(prompts), "no-as-before");
});

test("no-see-above rejects a body containing see above", () => {
  const prompts = seal();
  const first = prompts[0];
  assert.ok(first);
  first.body = first.body.replace("</task>", "see above\n</task>");
  onlyRule(validatePackage(prompts), "no-see-above");
});

test("no-same-as-previous rejects a body containing same as previous", () => {
  const prompts = seal();
  const first = prompts[0];
  assert.ok(first);
  first.body = first.body.replace("</task>", "same as previous\n</task>");
  onlyRule(validatePackage(prompts), "no-same-as-previous");
});

test("one-job rejects a second task", () => {
  const prompts = seal();
  const first = prompts[0];
  assert.ok(first);
  first.body = first.body.replace("</task>", "</task>\n<task>Second job.</task>");
  onlyRule(validatePackage(prompts), "one-job");
});

test("stack-paths rejects a file outside the chosen stack", () => {
  const prompts = seal();
  const routes = prompts.find((prompt) => prompt.requirements.includes("REQ-ROUTES"));
  assert.ok(routes);
  routes.filesModified = ["notes/nope.md"];
  onlyRule(validatePackage(prompts), "stack-paths");
});

test("phase-coverage requires every locked phase", () => {
  const prompts = seal().filter((prompt) => prompt.phase !== "so-long");
  onlyRule(validatePackage(prompts), "phase-coverage");
});

test("review-cadence rejects a skipped phase-end flag", () => {
  const prompts = seal();
  const first = prompts[0];
  assert.ok(first);
  assert.equal(first.reviewAfter, true);
  first.reviewAfter = false;
  onlyRule(validatePackage(prompts), "review-cadence");
});

test("depends-forward is an error and the package is not reordered", () => {
  const prompts = seal();
  const before = prompts.map((prompt) => prompt.id).join(",");
  const first = prompts[0];
  const second = prompts[1];
  assert.ok(first && second);
  first.dependsOn = [second.id];
  const report = validatePackage(prompts);
  onlyRule(report, "depends-forward");
  assert.match(report.errors[0]?.detail ?? "", /forward/);
  assert.equal(prompts.map((prompt) => prompt.id).join(","), before);
});

test("motion-library requires the single-library sentence", () => {
  const prompts = seal();
  const motion = prompts.find((prompt) => prompt.library === "css-scroll");
  assert.ok(motion);
  motion.body = motion.body.replaceAll(MOTION_BIND_SENTENCE, "Use the assigned library.");
  onlyRule(validatePackage(prompts), "motion-library");
});
