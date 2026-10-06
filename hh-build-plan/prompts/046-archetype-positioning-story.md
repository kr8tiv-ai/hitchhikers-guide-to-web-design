---
id: "046"
kind: build
phase: babel-fish
slice: Heart of Gold
title: "Draft archetype, positioning, and three story lengths"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["045"]
files: ["packages/engine/src/brand/story.ts", "packages/engine/test/story.test.ts"]
requirements: ["HH-BRAND-02"]
review_checkpoint_embedded: false
---

# 046. Draft archetype, positioning, and three story lengths

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

Produce a positioning line, one archetype label from a fixed list, and story text at about 25, 100, and 300 words. The 25-word version is the brand why you already compiled. Longer versions may only reuse facts present in the answers. Gaps stay as bracketed holes, not inventions.

## Why this prompt exists

Story that invents a founder, a year, or a city will ship as a lie on the website. The compiler's job is to refuse the invention.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 9
- context/research/08-brand-intake-frameworks.md
- packages/engine/src/brand/why.ts
- CONTEXT-PACKAGE.md (v1) sections 9.1–9.6
- context/sources/build-a-brand-from-scratch-with-ai.plain.txt (Matt's method; verbatim prompts allowed with credit, D-005)

## Files to create or change

- packages/engine/src/brand/story.ts
- packages/engine/test/story.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

ARCHETYPES is a fixed list of twelve short labels: caretaker, creator, explorer, innocent, jester, lover, magician, everyperson, hero, outlaw, ruler, sage. pickArchetype(text) scores by keyword and returns the best label plus `status: ASSUMED` always, because a keyword score is not the user's choice. The user approves later. positioningLine uses `For ${visitor}, ${name} is the ${offer} that ${siteWhy}`. If the project name is missing, use `this practice`. Stories: short is brandWhy. Medium and long call expandOnly(facts, targetWords). facts are strings you extracted: offer, visitor, place if DP-9.5 or a dedicated place answer contains a place, and protected list. If you need a sentence you do not have, insert `[needs a fact: founding story]` rather than writing one. Word counts may be plus or minus 15. No testimonials. No years unless the answer contains a four-digit year.

## Interfaces and data shapes

```ts
export interface StoryPack {
  archetype: string;
  archetypeStatus: "ASSUMED";
  positioning: string;
  words25: string;
  words100: string;
  words300: string;
  holes: string[];
}

export function buildStory(input: { answers: AnswerRecord[]; why: WhyDraft; name: string }): StoryPack;
```

## Steps

1. Implement the archetype list and a simple scorer. A fixture full of care words maps to caretaker. Document the keywords in the source next to the list.

2. positioningLine throws if visitor or offer is empty. Those are required upstream.

3. expandOnly never emits a digit sequence of four unless it appears in the input facts. Test with a fact list that has no year and a generated story. Assert no /\b(19|20)\d{2}\b/.

4. When the long story would need a founding anecdote, the hole `founding story` is listed and the bracket appears in words300.

5. Word count helper splits on whitespace. Test a tiny fact set still returns the three fields.

6. Strip exclamation marks.

7. Do not include the archetype list's unused labels in the output, only the chosen one.

8. Export buildStory.

9. The function is pure. 061 feeds it Grok-authored drafts through the 011 adapter.

## Edge cases

- Two archetypes tying: pick the one earlier in the list and add hole `archetype tie`.
- Name longer than 60 characters is truncated in the positioning line only.
- User text that already contains a testimonial sentence is not copied into the story. Drop sentences that contain `testimonial` or `5 stars`. Warn via a hole `dropped a proof sentence`.

## Acceptance criteria

- [ ] Archetype status is ASSUMED.
- [ ] No year appears unless the facts had one.
- [ ] A missing founding story is a visible hole.
- [ ] The 25-word field equals the brand why.

## must_haves

truths:

- Stories do not invent biography.
- Positioning uses the visitor, the offer, and the site why.
- The user has not approved the archetype yet.

artifacts:

- packages/engine/src/brand/story.ts

key_links:

- buildStory takes WhyDraft from compileWhy.

prohibitions:

- Do not invent a founder, a city, or a founding year.
- Do not add customer quotes.
- Do not hand-roll a model call in this module. The live Grok call goes through the 011 adapter and is wired in 061; this module stays the deterministic validator and shaper underneath it, tested with fixtures and recorded cassettes.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/046.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(brand): draft positioning and three story lengths
```
