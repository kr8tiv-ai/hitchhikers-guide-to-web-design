---
id: "084"
kind: build
phase: deep-thought
slice: Reference Library
title: "Write SEO, sales, and award-site packs without fake numbers"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["076", "029"]
files: ["packages/knowledge/packs/seo/SKILL.md", "packages/knowledge/packs/sales-psychology/SKILL.md", "packages/knowledge/packs/award-sites/SKILL.md", "packages/knowledge/test/market-packs.test.ts"]
requirements: ["HH-KNOW-06"]
review_checkpoint_embedded: false
---

# 084. Write SEO, sales, and award-site packs without fake numbers

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

Write SEO, sales, and award-site packs. SEO does not invent keyword volumes. Sales does not invent persuasion percents. Award sites name Lando Norris as SOTY 2025 and CoMinVi as an SOTD example dated 2026-09-30, and explicitly say SOTY 2026 was not announced as of the addendum date. Godly has no assumed API.

## Why this prompt exists

These packs are where a model will hallucinate authority if you leave a blank. Filling the blank with a sourced fact or a refusal is the work.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/RESEARCH-ADDENDUM.md gallery section
- hh-build-plan/CONTEXT-PACKAGE.v2.md section 8.3 module 4
- packages/knowledge/galleries/curated.json
- context/research/03-awwwards-anatomy.md
- context/research/05-inspiration-galleries.md
- context/research/11-integrations.md

## Files to create or change

- packages/knowledge/packs/seo/SKILL.md
- packages/knowledge/packs/sales-psychology/SKILL.md
- packages/knowledge/packs/award-sites/SKILL.md
- packages/knowledge/test/market-packs.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

SEO: title, description, one h1, crawlable text, no promised citations in answer engines. Sales: clear offer, proof only from the user, no dark patterns. Award pack: how to look at a reference (what it is doing, not a skin to clone), the two sourced examples, and the offline curated pack as the Suggest source. Each claim that names an award has a Source line pointing at the addendum. No exclamation marks. parsePack must pass.

## Interfaces and data shapes

```ts
export const MARKET_PACKS: readonly string[];
```

## Steps

1. Write the three skills.

2. Test award-sites contains `Lando Norris`, `SOTY 2025`, `CoMinVi`, and `SOTD`.

3. Test it contains `2026` only in a sentence that says there is no SOTY 2026 winner yet, or in the CoMinVi date. Fail if `SOTY 2026 winner` appears.

4. Test seo does not match `/\d+\s+searches/`.

5. Test sales does not match `/\d+%/`.

6. parsePack and lintPackClaims pass.

7. Mention curated.json as the offline source.

8. Do not crawl.

## Edge cases

- Do not call CoMinVi the site of the year.
- Do not add a Godly API URL.

## Acceptance criteria

- [ ] Awards match the addendum.
- [ ] SEO and sales packs contain no invented volumes or percents.
- [ ] All three parse.

## must_haves

truths:

- SOTD is not mislabeled SOTY.
- The packs refuse fake precision.

artifacts:

- packages/knowledge/packs/award-sites/SKILL.md
- packages/knowledge/packs/seo/SKILL.md

key_links:

- award-sites points at packages/knowledge/galleries/curated.json.

prohibitions:

- Do not invent a SOTY 2026 winner.
- Do not invent search volumes.
- Do not add a Godly API.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/knowledge test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/084.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(knowledge): add SEO, sales, and award-site packs
```
