---
id: "017"
kind: build
phase: dont-panic
slice: The Guide
title: "Finish the tree, Guide Entry, and required fields"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["015"]
files: ["interview/tree.yaml", "packages/engine/src/required.ts", "packages/engine/test/tree-rest.test.ts", "packages/engine/test/required.test.ts"]
requirements: ["HH-INT-03"]
review_checkpoint_embedded: false
---

# 017. Finish the tree, Guide Entry, and required fields

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

Add motion, budget, content, and limits, plus the one-page Guide Entry. Required fields cannot be blank: site why, one visitor, one action, vibe and anti-vibe, motion level, hosting. Skip stores an ASSUMED value. Appetite caps weight. It does not delete a library.

## Why this prompt exists

Deep Thought cannot write a PRD from an empty brief. The required-field check is the gate between a charming conversation and a spec that can be built.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 8.3 (modules 6 through 9 and Guide Entry) and 8.4
- hh-build-plan/CONTEXT-PACKAGE.v2.md section 15.1 and 15.3 (appetite is a weight ceiling)
- interview/tree.yaml
- CONTEXT-PACKAGE.md (v1) sections 3, 6, and 8.3 modules 6 to 9 plus the Guide Entry (full wording; v2 is a condensed rewrite)
- context/matt-answers.md (Q1, Q6, Q7, Q8, Q9, Q11, Q38 override everything)

## Files to create or change

- interview/tree.yaml
- packages/engine/src/required.ts
- packages/engine/test/tree-rest.test.ts
- packages/engine/test/required.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Module 6, pan-galactic, ids DP-6.1 through DP-6.6. DP-6.1 names families in plain words and, in suggest, the tool the picker would use: CSS, GSAP, Three, OGL, Theatre, Motion, anime.js, or vanilla. Magnetic buttons are described as banned, not offered. DP-6.2 appetite 1 through 10. The why says the number caps weight and does not remove libraries from the Guide. DP-6.3 full movie or branching story, mentioning build length, weight, phone fallback, and a crawlable text layer. DP-6.4 3D source: none, pre-rendered, CC0, Tripo, Meshy, upload, or a human brief. DP-6.5 phone lighter or calm, default calm. DP-6.6 motion sensitivity. Reduced motion is always implemented. Module 7 ids DP-7.1, DP-7.2, DP-7.3. DP-7.1 is the spend comfort. skip_default is `$0 DIY. Prompts only.` The why says show model and resolution, and do not promise 1080p inside a small cap. Do not hardcode a full price table in yaml. Point at the cost meter. DP-7.2 only in standard and deep. DP-7.3 stock, own, or AI. Module 8: DP-8.1 copy approve or reject. DP-8.2 real proof only. DP-8.3 blog cadence. DP-8.4 legal pages and claims they cannot make. Module 9: DP-9.1 deadline. DP-9.2 hosting, choices Hostinger, Vercel, Netlify, Cloudflare, or no idea. Hostinger is the recommended word, not a forced value. DP-9.3 who maintains it. DP-9.4 anything beyond WCAG 2.2 AA. DP-9.5 anything else. Guide Entry is not a fake question id. It is a function renderBrief(answers) documented in required.ts. Required ids: DP-2.1, DP-2.6, DP-2.2, DP-5.3, DP-6.2, DP-9.2. A skip on those still needs a non-empty assumed string.

## Interfaces and data shapes

```ts
export interface AnswerRecord {
  id: string;
  status: "ANSWERED" | "SUGGESTED" | "SKIPPED" | "SOFT" | "IMPORTED";
  value: string;
}

export function missingRequired(answers: AnswerRecord[]): string[];

export function renderBrief(answers: AnswerRecord[]): string;
```

## Steps

1. Append modules pan-galactic, bistromathics, content, and limits to tree.yaml with the ids in the context.

2. DP-6.1 suggest lists the eight tools and the sentence `Magnetic buttons are banned.`

3. DP-6.2 skip_default is `3. ASSUMED. Polished, not a spectacle.` depth includes all three modes.

4. DP-9.2 skip_default is `no idea`. The ask recommends Hostinger and names the other three hosts.

5. Implement missingRequired. ANSWERED, SUGGESTED, and IMPORTED count if value.trim() is non-empty. SKIPPED counts only if value.trim() is non-empty (the assumed text). SOFT counts as present but renderBrief must prefix that field with `SOFT:`. An empty value never counts.

6. renderBrief writes a one-page markdown brief with headings Goal, Visitor, Action, Vibe, Motion, Hosting, and a Coverage line of counts. It does not include a book quote.

7. tree-rest.test.ts asserts the full id inventory from DP-0.1 through DP-9.5, including DP-0.2a and excluding any id you were not given. Maintain the expected list in the test as a const array copied from v2.

8. required.test.ts: a skip of DP-6.2 with the default value is not missing. A skip with ` ` is missing. renderBrief contains `ASSUMED` when the motion answer is SKIPPED.

9. Export the new functions from the engine index. Leave the interview loop to the next prompt.

## Edge cases

- DP-7.2 is absent from express via the depth tag. missingRequired does not require DP-7.2.
- Guide Entry is derived. Do not add a question id DP-GE.
- Appetite 11 is not a legal skip_default. The engine clamp comes later. The tree ask says 1 to 10.

## Acceptance criteria

- [ ] The test's expected id list matches v2 modules 0 through 9, including DP-0.2a.
- [ ] Required blanks are detected.
- [ ] A skipped motion level with the assumed sentence passes.
- [ ] DP-6.1 says magnetic buttons are banned and names the toolkit.

## must_haves

truths:

- Every DP id in v2 section 8.3 is in one tree file.
- Required fields cannot be empty strings.
- Appetite is stored as a weight ceiling, not as a library ban.

artifacts:

- interview/tree.yaml
- packages/engine/src/required.ts

key_links:

- missingRequired reads AnswerRecord values produced later by the interview engine.
- DP-6.1 suggest names GSAP, Three, OGL, Theatre, Motion, anime.js, CSS, and vanilla.

prohibitions:

- Do not omit Theatre or GSAP from the motion question.
- Do not add a MIT-fallback motion question.
- Do not invent a price inside the yaml.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/017.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(interview): finish the tree and required-field check
```

