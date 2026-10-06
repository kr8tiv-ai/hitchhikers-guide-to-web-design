---
id: "047"
kind: build
phase: babel-fish
slice: Heart of Gold
title: "Fold competitor cards into the brand notes"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["027", "046"]
files: ["packages/engine/src/brand/teardown.ts", "packages/engine/test/teardown.test.ts"]
requirements: ["HH-BRAND-03"]
review_checkpoint_embedded: true
---

# 047. Fold competitor cards into the brand notes

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

Merge up to three competitor reports and the user's envy and boredom answers into a short teardown: what the sea of sameness is, and three white spaces that quote the user. If the user did not name a white space, leave a hole. Do not invent a market gap.

## Why this prompt exists

Brand strategy that pretends three local sites reveal a blue ocean will embarrass the user in front of a client.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- packages/crawler/src/cards.ts
- hh-build-plan/CONTEXT-PACKAGE.v2.md section 9
- packages/engine/src/brand/story.ts
- context/research/08-brand-intake-frameworks.md
- CONTEXT-PACKAGE.md (v1) sections 9.1–9.6
- context/sources/build-a-brand-from-scratch-with-ai.plain.txt (Matt's method; verbatim prompts allowed with credit, D-005)

## Files to create or change

- packages/engine/src/brand/teardown.ts
- packages/engine/test/teardown.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

teardown({ reportMarkdown, envy, boredom }) returns markdown with headings Sameness, Envy, Boredom, White space. White space entries come only from lines in envy or boredom that the user started with `Wish:` or from DP-4.1 style notes already in the report. If there are none, the section is `No white space recorded yet.` Cap envy and boredom quotes at 240 characters each. Do not fetch URLs. Do not add adjectives like premium or authentic unless the user wrote them. Three white spaces maximum. A fourth wish is listed under `Parked`.

## Interfaces and data shapes

```ts
export interface TeardownInput {
  reportMarkdown: string;
  envy: string;
  boredom: string;
}

export function buildTeardown(input: TeardownInput): { markdown: string; whiteSpaces: string[]; parked: string[] };
```

## Steps

1. Parse lines that start with `Wish:` from both envy and boredom. Trim and dedupe.

2. Take the first three as whiteSpaces and the rest as parked.

3. Copy the sameness sentence from the report if it contains `shared` or `No shared title pattern`. If neither is present, write `Sameness was not computed.`

4. Escape nothing into HTML. This is markdown. Still strip `<script` to be safe.

5. Test: two Wish lines produce two white spaces and the third section does not say none.

6. Test: no Wish lines produce the empty sentence and zero white spaces.

7. Test: five Wish lines produce three plus two parked.

8. Do not import a network client.

9. Export buildTeardown.

## Edge cases

- Wish: with an empty body is ignored.
- A 1,000 character wish is clipped to 240 and marked with an ellipsis of three periods, not an ellipsis character if that character is hard to type. Three periods are fine.
- The function does not modify story.ts output.

## Acceptance criteria

- [ ] White spaces are user wishes only.
- [ ] More than three wishes park the extras.
- [ ] Missing sameness is labeled, not invented.

## must_haves

truths:

- The teardown does not claim a gap the user did not state.
- Competitor prose from the crawler is quoted, not re-fetched.

artifacts:

- packages/engine/src/brand/teardown.ts

key_links:

- buildTeardown consumes the markdown shape from buildCompetitorReport.

prohibitions:

- Do not invent market statistics.
- Do not crawl during teardown.
- Do not hand-roll a model call in this module. The live Grok call goes through the 011 adapter and is wired in 061; this module stays the deterministic validator and shaper underneath it, tested with fixtures and recorded cassettes.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/047.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(brand): teardown competitors from recorded wishes
```

## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `048-review-045-047.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `045` Compile a one-sentence why and a longer finder (Deep Why, Gargle Blaster, high)
- `046` Draft archetype, positioning, and three story lengths (Heart of Gold, Gargle Blaster, high)
- `047` Fold competitor cards into the brand notes (Heart of Gold, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
