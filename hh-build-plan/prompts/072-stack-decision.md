---
id: "072"
kind: build
phase: deep-thought
slice: The Ultimate Question
title: "Write the stack decision record"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["069"]
files: ["packages/engine/src/spec/stack.ts", "packages/engine/test/stack.test.ts"]
requirements: ["HH-STACK-01"]
review_checkpoint_embedded: false
---

# 072. Write the stack decision record

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

Choose Astro, Next.js, or Vite plus React from the rules in v2, and write research/STACK-DECISION.md with pick, why, alternatives, and what would change the decision. SvelteKit appears only as an alternative when the user insisted, with the sentence that the 3D ecosystem is thinner. Versions are listed as `re-resolve at install` rather than pinned in this file.

## Why this prompt exists

The prompt generator and the templates branch on this file. A casual sentence in the PRD is not a decision.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 10.4
- hh-build-plan/RESEARCH-ADDENDUM.md version baseline note (re-pin at install, do not treat 2026-10-05 versions as a promise)
- packages/engine/src/site-types.ts

## Files to create or change

- packages/engine/src/spec/stack.ts
- packages/engine/test/stack.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

decideStack({ siteType, motionLevel, persistentCanvas, userOverride }) returns the record. Astro is the default. Next.js when siteType is `app` or persistentCanvas is true. Vite plus React when motionLevel is 10. userOverride `sveltekit` is honored and sets insisted true. userOverride of a stack not in the set throws. Commerce site types do not switch the stack to Shopify. Add a note `Inventory-heavy commerce escalates. It does not change the site stack by itself.` The markdown headings are Pick, Why, Alternatives, What would change this, Versions.

## Interfaces and data shapes

```ts
export type StackPick = "astro" | "next" | "vite-react" | "sveltekit";

export function decideStack(input: {
  siteType: string;
  motionLevel: number;
  persistentCanvas: boolean;
  userOverride?: StackPick | null;
}): { pick: StackPick; markdown: string; insisted: boolean };
```

## Steps

1. Implement the rules in the context. Unit-test each branch: default marketing to astro, app to next, level 10 to vite-react, override sveltekit.

2. motionLevel outside 1 to 10 throws.

3. Versions section contains the phrase `re-resolve at install` and does not contain a fake patch version you did not read. You may mention the research 06 date as a baseline label if you also say it is not a pin.

4. Alternatives always name the two stacks you did not pick, plus sveltekit when it was not the pick.

5. What would change this includes persistent canvas, motion level 10, and an app-style site type.

6. Markdown contains no exclamation marks.

7. Export decideStack.

8. Do not npm install Astro.

## Edge cases

- Override wins over the heuristic and insisted is true.
- Level 10 and site type app: vite-react wins because the world is the harder constraint. Document that in Why.
- persistentCanvas and level 9 stays Next if siteType is app, Astro otherwise. Level 10 still vite-react.

## Acceptance criteria

- [ ] Each rule branch has a test.
- [ ] SvelteKit is not the default.
- [ ] Versions are not falsely pinned.

## must_haves

truths:

- The stack record has pick, why, alternatives, and a change condition.
- Astro is the default marketing stack.
- Shopify is not silently selected.

artifacts:

- packages/engine/src/spec/stack.ts

key_links:

- decideStack is what the template picker will read.

prohibitions:

- Do not install a framework in this prompt.
- Do not default to SvelteKit.
- Do not pin a version you did not resolve from a registry in this session.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/072.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(spec): write STACK-DECISION.md
```
