---
id: "054"
kind: build
phase: babel-fish
slice: Magrathean Logo Works
title: "List ten logo directions and render four flats"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["053", "051"]
files: ["packages/assets/src/logo-concepts.ts", "packages/assets/test/logo-concepts.test.ts"]
requirements: ["HH-LOGO-01"]
review_checkpoint_embedded: false
---

# 054. List ten logo directions and render four flats

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

Produce ten text directions: two wordmarks, two lettermarks, two symbols, two combinations, one emblem, one wildcard. Quote the cost of rendering the top four as flat white stills before any call. The prompts forbid gradients, mockups, and lettering that would later be traced.

## Why this prompt exists

The SVG step is not allowed to trace Imagine's letters. These prompts have to ask for symbol shapes, and the wordmark has to stay a font decision.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 9 logo pipeline steps 1 and 2
- packages/assets/src/imagine.ts
- packages/engine/src/brand/voice.ts

## Files to create or change

- packages/assets/src/logo-concepts.ts
- packages/assets/test/logo-concepts.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

directions(name) returns ten objects with kind and a prompt. Wordmark prompts say `do not render letters. Describe the personality only.` Symbol prompts say `flat white shape on a plain background, no text, no gradient, no mockup`. pickFour(list, indexes) returns four and calls quoteJob for four counts of grok-imagine-image. Default resolution default and model grok-imagine-image at $0.02, so four is $0.08. Show that number. run is not called inside directions(). A separate function renderFour(deps) calls runJobs only when deps.confirm is true and deps.remainingUsd >= 0.08. Otherwise it throws. Tests confirm false does not fetch.

## Interfaces and data shapes

```ts
export type LogoKind = "wordmark" | "lettermark" | "symbol" | "combination" | "emblem" | "wildcard";

export interface LogoDirection {
  id: string;
  kind: LogoKind;
  prompt: string;
}

export function logoDirections(name: string): LogoDirection[];
export function quoteTopFour(): { usd: number; line: string };
```

## Steps

1. Return exactly ten directions with the kind counts in the goal. Ids logo-01 to logo-10.

2. Wordmark and lettermark prompts include `do not render letters`.

3. Symbol, combination, emblem, and wildcard prompts include `no text` and `no gradient`.

4. quoteTopFour uses quoteJob so the price cannot drift from the card. Assert usd is 0.08.

5. renderFour with confirm false throws and the injected fetch is not called.

6. renderFour with confirm true and remaining 0.05 throws CapExceeded.

7. The name is included as a personality word, but a test asserts the wordmark prompt also says the letters will be set in a real font later.

8. No exclamation marks in prompts.

9. Export the functions from the assets index.

## Edge cases

- An empty name throws.
- A name with `<` is stripped from the prompt.
- pick indexes outside 0..9 throw.

## Acceptance criteria

- [ ] Counts of kinds match 2, 2, 2, 2, 1, 1.
- [ ] Top four quote is $0.08 on the default still model.
- [ ] Unconfirmed render does not fetch.

## must_haves

truths:

- Imagine is not asked to draw the final lettering.
- The user must confirm before a paid render.
- Gradients are excluded from the prompts.

artifacts:

- packages/assets/src/logo-concepts.ts

key_links:

- quoteTopFour calls quoteJob in prices.ts.

prohibitions:

- Do not trace or export SVG in this prompt.
- Do not call Imagine without confirm true.
- Do not ask Imagine to invent a real person's signature.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/assets test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/054.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(assets): draft ten logo directions and price four stills
```
