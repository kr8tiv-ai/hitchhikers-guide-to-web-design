---
id: "092"
kind: build
phase: deep-thought
slice: Infinite Monkeys
title: "Golden prompt library and Grok-authored site prompts"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["090", "077", "076", "078", "080", "081", "082", "084", "011", "086"]
files: ["packages/knowledge/golden/", "packages/engine/src/spec/author.ts", "packages/engine/src/spec/author-schemas.ts", "packages/engine/src/spec/framework-discussion.ts", "packages/engine/test/author.test.ts", "packages/engine/test/cassettes/author/README.md", "evals/towel-and-tea/site-prompts/README.md"]
requirements: ["HH-SPEC-07"]
review_checkpoint_embedded: false
---

# 092. Golden prompt library and Grok-authored site prompts

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

Expand the golden templates to about 40 (setup, structure, nav, hero, section, reveals, Lenis, SplitText, scroll video, transitions, 3D, shader, media, forms, integrations, SEO and blog, credits, QA, fix, Elevate, deploy), using Matt's AntiHero prompt wording verbatim with credit where it fits (D-005). Then Grok 4.7 at xhigh writes each site prompt body from the 090 skeleton entry, the matching golden template, CONTEXT.md anchors, and the knowledge packs, and 090's validator gates every body. The framework decision record is discussed with the user and can be overridden (Q21).

## Why this prompt exists

The skeleton says what to build; the bodies are what the site agent actually reads. Model-authored bodies grounded in proven templates are specific and self-contained in a way string templates are not.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/sources/prompts.txt and context/sources/website-on-autopilot.plain.txt (Matt's prompts; verbatim with credit allowed, D-005)
- context/research/09-antihero-guides-inventory.md
- CONTEXT-PACKAGE.md (v1) sections 10.4 and 10.5
- packages/engine/src/spec/site-prompts.ts and site-validate.ts (090)
- packages/knowledge/golden/ (077) and packages/knowledge/packs/ (076 to 084)
- packages/templates/ (106)
- context/matt-answers.md Q21, Q25
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/knowledge/golden/
- packages/engine/src/spec/author.ts
- packages/engine/src/spec/author-schemas.ts
- packages/engine/src/spec/framework-discussion.ts
- packages/engine/test/author.test.ts
- packages/engine/test/cassettes/author/README.md
- evals/towel-and-tea/site-prompts/README.md

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Golden templates are markdown with the v1 §10.5 sections and slots ({{library}}, {{element}}, {{page}}, {{section}}, {{anchor}}, {{files}}). Each ends with the AntiHero credit line when Matt's wording is used. author.ts: authorPackage(skeleton, ctx) loops entries in order; for each, builds a request containing the skeleton entry, the golden template chosen by entry kind, the CONTEXT.md anchors it cites (only those sections, not the whole file), the relevant pack excerpts, and the template paths from 106; calls think() at xhigh with schema { body: string } (the body is the markdown after the RULES block); runs validatePackage on the single prompt; on failure sends one repair with the validator errors; on a second failure marks the entry needs-human and continues. Writes .hitchhiker/prompts/NNN-<slug>.md with the shared RULES block and frontmatter. framework-discussion.ts: before authoring, presents STACK-DECISION.md's pick, why, and alternatives as a card; the user can accept or override, and an override regenerates the skeleton's file paths.

## Interfaces and data shapes

```ts
export function authorPackage(skeleton: SitePromptSkeleton[], ctx: { contextMd: string; packsDir: string; goldenDir: string; templatesDir: string; projectDir: string }, deps: { think: typeof think }): Promise<{ written: string[]; needsHuman: string[] }>;
export function pickGolden(entry: SitePromptSkeleton, goldenDir: string): string;
export function discussFramework(decision: StackDecision, deps: { ask: (card: unknown) => Promise<"accept" | { override: string }> }): Promise<StackDecision>;
```

## Steps

1. Write the ~40 golden templates with slots and credit lines; a test checks each has every v1 §10.5 section and passes the 077 slop denylist.

2. Write pickGolden mapping entry kinds to templates.

3. Write author.ts with per-entry validation and one repair.

4. Write framework-discussion.ts and its override path.

5. Record or hand-write cassettes, then test authoring a Towel & Tea package of 50 to 150 prompts that passes validatePackage.

6. Spot-check 5 authored prompts for self-containment and quote them briefly in the summary.

## Edge cases

- CONTEXT.md anchor missing: validator error, not a silent drop.
- Token budget: each request stays under 30k tokens by trimming pack excerpts first.
- The user overrides the framework after authoring started: stop, regenerate the skeleton, and restart authoring.

## Acceptance criteria

- [ ] About 40 golden templates exist with credit lines where Matt's wording is used.
- [ ] A Towel & Tea package of 50 to 150 prompts passes the validator.
- [ ] Five spot-checked prompts are self-contained.
- [ ] The framework decision can be overridden by the user.

## must_haves

truths:

- Site prompt bodies are written by Grok and gated by the validator.
- Matt's proven prompts are reused with credit.
- The user owns the framework choice.

artifacts:

- packages/knowledge/golden/
- packages/engine/src/spec/author.ts
- packages/engine/src/spec/framework-discussion.ts

key_links:

- authorPackage consumes generateSkeleton output and runs validatePackage (090).
- Authored prompts are what the drive (096, 142) runs.

prohibitions:

- Do not write a prompt that fails the validator to disk as ready.
- Do not use Matt's wording without the credit line.
- Do not pad the package.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/knowledge test
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/092.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(spec): golden prompt library and Grok-authored site prompts
```
