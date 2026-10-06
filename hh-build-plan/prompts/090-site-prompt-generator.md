---
id: "090"
kind: build
phase: deep-thought
slice: Earth Mk II Blueprints
title: "Generate the site prompt skeleton (50 to 150) and the package validator"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["089", "074", "070", "077", "078", "080", "081", "082", "084"]
files: ["packages/engine/src/spec/site-prompts.ts", "packages/engine/src/spec/site-rules.ts", "packages/engine/src/spec/site-validate.ts", "packages/engine/test/site-prompts.test.ts", "packages/engine/test/site-validate.test.ts"]
requirements: ["HH-SPEC-06"]
review_checkpoint_embedded: true
---

# 090. Generate the site prompt skeleton (50 to 150) and the package validator

## RULES

You are Grok 4.7 in Grok Build, building The Hitchhiker's Guide to Web Design. This prompt builds the Guide app itself, not a client's website.

- TypeScript strict. No `any` unless a line in this prompt names the exception and the reason.
- Tests ship with the behavior. Run the verification commands before you finish.
- No secrets in source, fixtures, logs, or commits. Keys come from the environment or the OS keychain.
- MIT-compatible dependencies only. Before adding a package, check the registry: exact name, license field, repository URL, and that the repo is the project you meant. Record the result in NOTICE. GPL and AGPL are out. Apache-2.0, BSD, ISC, MIT, Unlicense, Zlib, and MPL-2.0 (file-level, noted in NOTICE) are allowed. Font files may be SIL OFL-1.1. Media assets (models, HDRIs, textures, images) may be CC0 or CC-BY-4.0 with a CREDITS.json entry.
- Do not bundle `@theatre/studio` (AGPL-3.0). Theatre runtime means `@theatre/core` only, pinned, never `@latest`.
- Motion toolkit (D-001): GSAP is the base engine (ScrollTrigger, SplitText, and the other free plugins), and Three.js, raw WebGL/GLSL (OGL or WebGL2), Motion, anime.js, Theatre.js core, Lenis, CSS scroll-driven animations, and vanilla JS all ship. The picker chooses per effect. No replacement or fallback paths.
- One job. Do not implement the next prompt.
- The app UI obeys the anti-slop rulebook: no purple-to-blue gradients, no magnetic buttons, no default Tailwind indigo look, no lorem, no banned words in user-facing copy, no exclamation marks. App screens use the Guide design system in packages/app/src/design/ (tokens, type, motion, components). Never ship an unstyled or default-looking screen. The app must look agency-grade with Don't Panic energy.
- Windows, macOS, and Linux. Use `node:path` and `node:os`. No hardcoded POSIX paths. No required `pdftotext`, Homebrew, or apt.
- If a doc in the repo disagrees with this prompt, stop and write the conflict in the summary. Do not invent an API.
- Authority: context/matt-answers.md (Matt's 40 answers) and DECISIONS.md override everything, including this prompt and CONTEXT-PACKAGE.v2.md. CONTEXT-PACKAGE.md (v1) holds full detail where v2 says "as in v1". If this prompt contradicts Matt, follow Matt and record the conflict.
- Commit when the checks pass. Do not push. Do not create a GitHub repo. Do not deploy.

## Goal

Generate the site prompt package in two stages. Stage 1 (deterministic, this file): a skeleton of 50–150 entries from SECTION-PLAN, MOTION, STACK-DECISION, KPIS, the feature answers (DP-3.x), the SEO/blog plan (DP-4.3/8.3), the asset plan, and the protected list. Each entry has id, phase (one of the six), slice (v2 §5.2 catalog), title, tier (Towel, Cup of Tea, Gargle Blaster, Heart of Gold, Forty-Two), effort, model, depends_on, files_modified, requirements, protected, review_after (true every 3rd and at each phase end), and max_turns. Stage 2 (092): Grok 4.7 xhigh authors each prompt body from the golden templates and CONTEXT.md anchors. Stage 3 (this file): a validator rejects any prompt that breaks the v1 §10.5 schema. This generates prompts for the user's website, not more Guide app prompts.

## Why this prompt exists

This is the output Deep Thought exists to produce. A thin prompt that says `make it nice` cannot be reviewed every three steps.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 5.2 and 10.5
- CONTEXT-PACKAGE.md (v1) sections 10.4 and 10.5 (prompt schema, tiers, review cadence)
- context/research/09-antihero-guides-inventory.md (Matt's prompt method)
- packages/engine/src/spec/sections.ts
- packages/engine/src/spec/motion.ts
- packages/engine/src/spec/context-doc.ts
- packages/knowledge/golden/ (templates from 077)

## Files to create or change

- packages/engine/src/spec/site-prompts.ts
- packages/engine/src/spec/site-rules.ts
- packages/engine/src/spec/site-validate.ts
- packages/engine/test/site-prompts.test.ts
- packages/engine/test/site-validate.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

RULES text lives in site-rules.ts as a constant. It tells the site agent: TypeScript strict, no secrets, MIT-compatible deps with a legitimacy check, no GPL, no @theatre/studio, the D-001 motion toolkit (GSAP base; Three.js, raw WebGL/GLSL, Motion, anime.js, Theatre.js core, Lenis, CSS scroll-driven, vanilla chosen per effect), import only the libraries this prompt names, one scroll owner per page, one ticker, one WebGL context, reduced motion, phone Lighthouse >= 90 on all four categories, anti-slop, no invented testimonials, no lorem, no exclamation marks in copy.

**Count rule:** the count comes from real work units (pages × sections, effects, features, integrations, SEO/blog items, QA, Mostly Harmless gates, the Elevate slot, So Long deploy and launch, the final Forty-Two once-over). Under 50 means the site is small: merge nothing, and return a warning that asks Deep Thought whether sections were under-planned (a Before-we-jump question). **Never pad with filler prompts.** Over 150 throws and asks to split into milestones.

**Must include:** a final xhigh Forty-Two once-over prompt before Mostly Harmless (v2 §11.4), the Mostly Harmless gate, jury, and Elevate prompts, and So Long deploy, handoff, and launch prompts. Every motion prompt names exactly one library from MOTION.md for that page.

**Validator (stage 3):** RULES text identical; frontmatter complete; `<read_first>` uses `@.hitchhiker/CONTEXT.md#anchor`; must_haves have truths, artifacts, key_links, and prohibitions; no "as before", "see above", or "same as previous"; one job; files exist under the chosen stack's paths; each phase has at least one prompt; the review_after cadence is correct.

Each entry's files are concrete paths under the chosen stack (Astro paths look like `src/pages/index.astro`). depends_on are ids that appear earlier. Phase is one of `dont-panic`, `babel-fish`, `deep-thought`, `improbability-drive`, `mostly-harmless`, `so-long`.

## Interfaces and data shapes

```ts
export type SitePhase = "dont-panic" | "babel-fish" | "deep-thought" | "improbability-drive" | "mostly-harmless" | "so-long";
export type Tier = "Towel" | "Cup of Tea" | "Gargle Blaster" | "Heart of Gold" | "Forty-Two";

export interface SitePromptSkeleton {
  id: string;
  phase: SitePhase;
  slice: string;
  title: string;
  tier: Tier;
  effort: "medium" | "high" | "xhigh";
  model: string;
  dependsOn: string[];
  filesModified: string[];
  requirements: string[];
  protected: string[];
  reviewAfter: boolean;
  maxTurns: number;
  library?: string;
  kind: "build" | "once-over";
}

export interface SitePrompt extends SitePromptSkeleton {
  rules: string;
  body: string;
}

export interface ValidationReport { ok: boolean; errors: Array<{ id: string; rule: string; detail: string }> }

export function generateSkeleton(input: {
  pages: Array<{ id: string; title: string; sections: string[] }>;
  effects: Array<{ id: string; library: string; sectionId: string; page: string }>;
  features: string[];
  integrations: string[];
  seoItems: string[];
  stack: "astro" | "next" | "vite-react" | "sveltekit";
  protectedPaths: string[];
}): { prompts: SitePromptSkeleton[]; warnings: string[] };

export function validatePackage(prompts: SitePrompt[]): ValidationReport;
```

## Steps

1. Put RULES in one constant in site-rules.ts and reference it from every entry. The test asserts exact string equality across the package.

2. Implement generateSkeleton from work units. A 3-page calm fixture lands between 50 and 150 because its sections, features, gates, deploy, and launch are each real units. A one-page tiny fixture may land under 50: return it as is with a warning, never filler.

3. A fixture with enough synthetic pages to exceed 150 expects a throw whose message says to split into milestones.

4. Assign phase and slice from the v2 §5.2 catalog. Every phase has at least one entry.

5. Set reviewAfter on every third entry within a phase and on the last entry of each phase.

6. Add exactly one `kind: "once-over"` entry at xhigh, tier Forty-Two, placed before the Mostly Harmless entries.

7. Motion entries carry exactly one library taken from MOTION.md for that page and the sentence `Do not also bind this element with another library.` 3D entries appear only when an effect uses three, ogl, or theatre.

8. Write validatePackage in site-validate.ts with every stage-3 rule from the context, each as a named rule id. One test per rule, including one that rejects a body containing "as before".

9. Export generateSkeleton and validatePackage. Body text comes from 092 (Grok 4.7 through the 011 adapter); this file never writes prose bodies.

## Edge cases

- Duplicate page ids throw.
- An effect whose sectionId matches no page throws.
- sveltekit still gets entries, with a warning that templates are thinner for it.
- A depends_on that points forward is a validator error, not a silent reorder.

## Acceptance criteria

- [ ] A 3-page calm fixture yields 50–150 entries without any entry tagged filler.
- [ ] Every entry's phase is one of the six locked names.
- [ ] review_after is true on every 3rd entry and on the last entry of each phase.
- [ ] The package contains exactly one final Forty-Two once-over at xhigh.
- [ ] The validator rejects a body containing "as before".

## must_haves

truths:

- Site prompts are grouped into the six locked phases and ordered by dependency.
- The count reflects real work units; nothing is padded.
- One effect library is named per motion prompt.
- The package is for the user's site.

artifacts:

- packages/engine/src/spec/site-prompts.ts
- packages/engine/src/spec/site-rules.ts
- packages/engine/src/spec/site-validate.ts

key_links:

- generateSkeleton consumes the section plan, MOTION.md assignments, features, and the stack decision.
- validatePackage is the gate 092 runs on every Grok-authored body.

prohibitions:

- Do not pad the package with filler prompts.
- Do not emit more than 150 entries.
- Do not tell the site to load every motion library on every page.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/090.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(spec): generate the 50 to 150 site prompts
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `091-review-088-090.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `088` Plan sections and name the hero Infinite Improbability (Earth Mk II Blueprints, Gargle Blaster, high)
- `089` Assemble CONTEXT.md with anchors under the token budget (Earth Mk II Blueprints, Heart of Gold, high)
- `090` Generate the site prompt skeleton (50 to 150) and the package validator (Earth Mk II Blueprints, Forty-Two, xhigh)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
