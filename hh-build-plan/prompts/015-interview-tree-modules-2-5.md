---
id: "015"
kind: build
phase: dont-panic
slice: The Guide
title: "Append interview modules 2 through 5"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["014"]
files: ["interview/tree.yaml", "packages/engine/test/tree-modules-2-5.test.ts"]
requirements: ["HH-INT-02"]
review_checkpoint_embedded: true
---

# 015. Append interview modules 2 through 5

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

Extend the same tree with The Question, Tools, Vogon Neighbors, and the Point-of-View Gun. Each site type names a primary KPI and a knowledge-pack id. Full Shopify is marked escalate. No search volumes are invented. The existing loader keeps passing.

## Why this prompt exists

Modules 2 through 5 decide the site, the tools, and the references. If they live in a second file, Express filtering and coverage will drift.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 8.3 modules 2, 3, 4, and 5
- interview/tree.yaml
- packages/engine/src/tree.ts
- CONTEXT-PACKAGE.md (v1) sections 3, 6, and 8.3 modules 2 to 5 (full wording; v2 is a condensed rewrite)
- context/matt-answers.md (Q1, Q6, Q7, Q8, Q9, Q11, Q38 override everything)

## Files to create or change

- interview/tree.yaml
- packages/engine/test/tree-modules-2-5.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Append questions. Do not renumber Module 0 or 1. Module 2 ids: DP-2.1 why this site, one sentence, writes SITE-BRIEF.md. DP-2.2 one visitor action. DP-2.3 site type, multi-select. The ask lists: sales, funnel, calls, reservations, sign-ups, portfolio, content, local, event, personal, nonprofit, recruiting, investor, app. suggest names the pack ids sales-psychology, seo, or ux-conversion in the why, one primary KPI per type, as words not fake numbers. DP-2.4 KPI helper writes KPIS.md and its why says ranges are assumptions. DP-2.5 funnel, brand, or hybrid. DP-2.6 one visitor: want, fear, device. DP-2.7 offer. DP-2.8 pages they think they need. Module 3: DP-3.1 contact form default yes. DP-3.2 sell products. suggest offers Stripe Payment Links or Shopify Buy Button, and says a full store escalates. DP-3.3 bookings. DP-3.4 newsletter, ask which platform. DP-3.5 blog and whether they edit later. DP-3.6 video, media, portfolio. DP-3.7 specials with Suggest, and why says discovery is approval-gated. DP-3.8 analytics: Plausible, Umami, or GA4 with consent. DP-3.9 locales. Module 4: DP-4.1 competitors. DP-4.2 envy and boredom. DP-4.3 blog and keyword posts. why says do not invent search volumes. DP-4.4 where customers are. DP-4.5 answer-engine goals without promising citations. Module 5: DP-5.1 three to five loved sites and what they love. DP-5.2 guided walk if they have none. DP-5.3 three vibe words and three never-words. DP-5.4 visual interview ending in the signature moment. DP-5.5 light: moody, airy, or paper. DP-5.6 photo, illustration, 3D, or type-only. Module slugs: the-question, tools, vogon-neighbors, point-of-view-gun.

## Interfaces and data shapes

```ts
export interface SiteTypeHint {
  id: string;
  kpi: string;
  pack: string;
}

export const SITE_TYPES: readonly SiteTypeHint[];
```

## Steps

1. Append the questions to interview/tree.yaml. Keep the header comment. Ids match the context exactly, including the hyphenation already used (DP-2.1 not DP-21).

2. Put SITE_TYPES in packages/engine/src/site-types.ts and export it from the engine index. Thirteen types, each with a kpi phrase and a pack id. No numeric conversion rates.

3. DP-2.3 suggest points at SITE_TYPES by saying the engine will offer these types. The yaml does not need to duplicate every KPI if the test checks SITE_TYPES separately. The ask still lists every type name so the question is readable alone.

4. DP-3.2 pushback_if includes `shopify store` and `full store`. skip_default is `No store. Contact or content only.`

5. DP-4.3 why contains the sentence `Do not invent search volumes.`

6. Add tree-modules-2-5.test.ts that loads the tree and asserts the id set for these four modules, asserts SITE_TYPES length, and asserts no SITE_TYPES entry contains a `%` character.

7. Assert DP-5.1 ask says three to five, not ten. The ten-site walk is the gallery instruction, not the saved board.

8. Re-run the Module 0 and 1 test so an append did not break the parser.

9. Do not write crawler code. DP-4.1 writes COMPETITORS.md as a writes target. The crawl comes later.

## Edge cases

- Multi-select is still input: [choice, text]. The engine does not need a new input type.
- A site type missing from the ask but present in SITE_TYPES fails the test. Keep them aligned.
- Do not add DP-3.2a. Escalation is a sentence inside DP-3.2.

## Acceptance criteria

- [ ] All ids in the context load.
- [ ] SITE_TYPES has no percent signs and no invented volumes.
- [ ] DP-3.2 mentions escalation for a full store.
- [ ] Module 0 and 1 tests still pass.

## must_haves

truths:

- One tree file holds modules 0 through 5.
- Commerce beyond a payment link is an escalation, not a default build.
- KPI numbers are not baked into the question data.

artifacts:

- interview/tree.yaml
- packages/engine/src/site-types.ts

key_links:

- tree-modules-2-5.test.ts loads the same interview/tree.yaml as the module 0 test.
- DP-2.3 ask names every SITE_TYPES id.

prohibitions:

- Do not invent keyword volumes or conversion rates.
- Do not promise answer-engine citations in DP-4.5.
- Do not start a second tree file.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/015.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(interview): add tree modules 2 through 5
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `016-review-013-015.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `013` Speak to grok agent over stdio ACP (Eddie, Heart of Gold, xhigh)
- `014` Write interview tree modules 0 and 1 (The Guide, Gargle Blaster, high)
- `015` Append interview modules 2 through 5 (The Guide, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
