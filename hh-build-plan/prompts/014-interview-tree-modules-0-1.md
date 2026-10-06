---
id: "014"
kind: build
phase: dont-panic
slice: The Guide
title: "Write interview tree modules 0 and 1"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["006"]
files: ["interview/tree.yaml", "packages/engine/src/tree.ts", "packages/engine/test/tree.test.ts"]
requirements: ["HH-INT-01"]
review_checkpoint_embedded: false
---

# 014. Write interview tree modules 0 and 1

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

Land the question schema and the first two modules as data, not as prose buried in a prompt. tree.yaml lists every Module 0 and Module 1 id from v2, with depth tags, skip defaults, and the files each answer writes. The loader rejects a duplicate id or a missing field.

## Why this prompt exists

The interview engine should not hardcode questions. If the tree is data, Express versus Deep is a filter, and a later module prompt can append ids without rewriting the runner.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 8.2, 8.3 (modules 0 and 1), and 8.4
- context/miro/01-brand-assets.png is optional visual context. The ids in v2 win if you cannot read the image.
- packages/engine/src/config.ts
- CONTEXT-PACKAGE.md (v1) sections 3, 6, 8.1, 8.2, and 8.3 modules 0 and 1 (full wording; v2 is a condensed rewrite)
- context/matt-answers.md (Q1, Q6, Q7, Q8, Q9, Q11, Q38 override everything)

## Files to create or change

- interview/tree.yaml
- packages/engine/src/tree.ts
- packages/engine/test/tree.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Use a tiny YAML subset. Each item is a mapping under `questions:`. Required keys: id, module, depth, ask, why, input, skip_default, writes. Optional: suggest, pushback_if, follow_ups (list of {id, ask}), levels ({beginner: explain|terse, pro: explain|terse}), required_for (list of downstream ids). depth is a flow sequence of express, standard, and/or deep. Do not add a YAML library if you can parse this subset. The documents are indented mappings you control, so a 100-line parser that handles strings, lists, and nested maps is enough. If you prefer a dependency, record the license in NOTICE and pin it. Module 0 ids, all of them: DP-0.1 self or client. DP-0.2 prior sites and tools. DP-0.2a love and wince. DP-0.3 comfort on four rungs. DP-0.4 existing brand assets. DP-0.5 optional X, read-only. DP-0.6 mic or keyboard. DP-0.7 time today and the depth offer Express, Standard, or Deep. Module 1 ids: DP-1.1 logo. DP-1.2 color, including a why that mentions mixed research on color psychology rather than a fake universal meaning. DP-1.3 slogan. DP-1.4 mood images, cap 5, why per image. DP-1.5 fonts, and the suggest text must name the six pairings: Bebas Neue + Barlow, Space Grotesk + Inter, DM Serif Display + DM Sans, Fraunces + Work Sans, Archivo Black + Archivo, Clash Display + Satoshi. DP-1.6 voice as a person or animal. DP-1.7 the brand why and origin story (Miro box 1.6): "Why did you build this, and what is the origin story?" with follow_ups "Do you understand your why?" and, if not, "Let's find it with the Golden Circle" (the Why Finder, a Babel Fish deep-dive in Standard/Express and inline in Deep). DP-1.7 is NOT the site why. The site why is DP-2.1. DP-1.8 kindred brands. DP-1.9 asset inventory and protected list. Wording is the Guide's voice: short, precise, no exclamation marks, no book quotes. input values are subsets of upload, text, voice, choice.

## Interfaces and data shapes

```ts
export interface Question {
  id: string;
  module: string;
  depth: Array<"express" | "standard" | "deep">;
  ask: string;
  why: string;
  input: Array<"upload" | "text" | "voice" | "choice">;
  skipDefault: string;
  suggest?: string;
  pushbackIf?: string[];
  followUps?: Array<{ id: string; ask: string }>;
  levels?: { beginner: "explain" | "terse"; pro: "explain" | "terse" };
  requiredFor?: string[];
  writes: string[];
}

export function loadTree(file: string): Question[];
export function questionsForDepth(all: Question[], depth: "express" | "standard" | "deep"): Question[];
```

## Steps

1. Write interview/tree.yaml with every id listed in the context. depth for every question is [express, standard, deep] unless noted. DP-0.5 is [standard, deep] in what Express shows, but Express still writes its ASSUMED default ("No X connection."). DP-1.7 is one entry whose ask is the brand why plus origin story, and whose follow_ups include the Why Finder offer. Do not create DP-1.7b.

2. DP-0.7 choices are Deep (the full Guide, recommended), Standard, and Express, written in the ask in that order. skip_default for DP-0.7 is Deep. The why says every mode keeps every id and Express only writes ASSUMED defaults for what it does not ask.

3. Implement the subset parser in tree.ts. Duplicate ids throw TreeError. A question missing writes throws. An unknown depth token throws.

4. questionsForDepth filters questions whose depth array includes the requested mode, preserving file order.

5. tree.test.ts loads the real interview/tree.yaml from the repo root via fileURLToPath and asserts the id set for modules towel-check (module 0) and ford-field-notes (module 1). Pick those module slug strings and use them consistently.

6. Assert DP-1.5 suggest contains all six font pairings. Assert DP-1.2 why does not claim a single color has one emotion for all cultures.

7. Assert no ask string contains `!` or an em dash.

8. Export loadTree and the Question type from the engine index.

9. Do not implement the ask loop in this prompt. Loader and data only.
10. DP-1.1 follow_ups are "Are you happy with it?" and "Want suggestions or an improved version?" (Miro 1.1). DP-1.5 follow_ups include "Send screenshots of fonts you like, or I can show you pairings" (Miro 1.5). DP-1.6 follow_ups include "Which brands' voices do you like? I can suggest 5 to 10 that speak to your customers" (Miro 1.5 voice). A test asserts these three follow-ups exist.

## Edge cases

- Quoted strings may contain colons, as in `skip_default: "Generate logo concepts in Babel Fish."`.
- Ids stay unique if a later prompt appends modules. The loader already rejects duplicates, so leave a comment in the yaml header that modules 2 through 9 arrive in the next prompts.
- Empty skip_default throws. Skip must record an ASSUMED value later, and the tree has to supply the words.

## Acceptance criteria

- [ ] Every Module 0 and Module 1 id from v2 is present once.
- [ ] DP-1.5 names the six pairings.
- [ ] Depth filter drops DP-0.5 from express.
- [ ] Asks contain no exclamation marks.

## must_haves

truths:

- Questions are data in interview/tree.yaml.
- The loader rejects a broken question instead of skipping it.
- Express is a subset, not a different tree file.

artifacts:

- interview/tree.yaml
- packages/engine/src/tree.ts

key_links:

- tree.test.ts loads interview/tree.yaml through loadTree.
- questionsForDepth is what the engine will call. It is exported.

prohibitions:

- Do not drop an id because the ask feels redundant.
- Matt's guide wording may be quoted with credit (D-005); keep the tree's own ids and structure.
- Do not quote The Hitchhiker's Guide to the Galaxy.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/014.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(interview): add tree modules 0 and 1
```
