---
id: "035"
kind: build
phase: dont-panic
slice: The Guide
title: "Run the Guide live: persona, pushback, grounded Suggest, brief loop"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["011", "013", "018", "019", "021", "029", "031", "034"]
files: ["packages/engine/src/guide/live-turn.ts", "packages/engine/src/guide/suggest.ts", "packages/engine/src/guide/pushback-judge.ts", "packages/engine/src/guide/mirror.ts", "packages/engine/src/guide/brief-loop.ts", "packages/engine/src/guide/validators.ts", "packages/engine/src/guide/schemas.ts", "packages/engine/test/guide-live.test.ts", "packages/engine/test/guide-validators.test.ts", "packages/engine/test/cassettes/guide/README.md", "packages/app/src/server/routes.ts", "packages/app/e2e/live-guide.spec.ts"]
requirements: ["HH-AI-02", "HH-INT-05"]
review_checkpoint_embedded: true
---

# 035. Run the Guide live: persona, pushback, grounded Suggest, brief loop

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

Make the interview live. Each turn sends the persona skill (021), the current tree id and its ask, the known facts, and the depth mode to Grok through the 017 adapter; the Guide's reply is text only, one question at a time. Pushback is judged by the model (with 019's phrase list as a floor), at most twice per id before SOFT. Suggest returns 2 to 4 options grounded in uploads, answers, crawl notes, and industry, and for taste ids it adds 2 Godly plus 2 Awwwards cards from the curated pack (029). The Guide mirrors back a three-line summary about every eight questions. At the end, Grok drafts the Site Brief and runs a "What did I get wrong?" loop until the user approves it. Validators enforce banned words, no invented proof, and the one-question rule.

## Why this prompt exists

This is the product's heart. Matt wants the interview to feel like a conversation with the greatest brand agency on the planet, not a form. 018 and 019 built the state machine and the floor; this prompt puts Grok in the chair, with guardrails that keep it honest.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- CONTEXT-PACKAGE.md (v1) sections 3, 6, and 8 (interview, persona, tree)
- context/matt-answers.md Q1, Q6, Q7, Q8, Q9, Q11, Q38
- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 3, 6, and 8
- packages/grok-plugin/skills/guide-persona/SKILL.md (021)
- packages/engine/src/interview.ts (018) and the pushback module (019)
- packages/engine/src/ai/think.ts (017) and packages/orchestrator/src/acp.ts (013)
- packages/crawler/src/galleries.ts (029)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/engine/src/guide/live-turn.ts
- packages/engine/src/guide/suggest.ts
- packages/engine/src/guide/pushback-judge.ts
- packages/engine/src/guide/mirror.ts
- packages/engine/src/guide/brief-loop.ts
- packages/engine/src/guide/validators.ts
- packages/engine/src/guide/schemas.ts
- packages/engine/test/guide-live.test.ts
- packages/engine/test/guide-validators.test.ts
- packages/engine/test/cassettes/guide/README.md
- packages/app/src/server/routes.ts
- packages/app/e2e/live-guide.spec.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

live-turn.ts exports runTurn(session, userInput) which: (1) applies the deterministic engine (018) to record the answer; (2) asks pushback-judge whether the answer is vague (model judgement via think with schema { vague: boolean, quote: string, sharperChoice: string }, OR'd with 019's phrase list; at most two pushes per id, counts persist in state); (3) on accept, picks the next id from the engine; (4) asks Grok for the Guide's message for that id (schema { message: string, explanationLevel: "beginner" | "pro", joke: boolean }) with the persona skill as system context and the known facts; (5) runs validators on the message. For the conversational feel, use the ACP session (013) when available so the persona stays warm across turns, falling back to stateless think calls.

suggest.ts: suggest(questionId, facts) returns 2 to 4 options, each { label, why, source } where source is an upload, an answer id, a crawl note, or an industry pattern; for taste ids (DP-5.x, visual references) it also returns 4 gallery cards via suggestReferences (2 Godly, 2 Awwwards, excluding already shown). Options citing facts that do not exist are dropped by validators.

mirror.ts: every 8 accepted answers, a three-line "here is what I heard"; at module end, a field summary. brief-loop.ts: draft the Site Brief (schema matching the brief fields from 017) via think at xhigh, render it, accept corrections in free text, re-draft only the corrected fields, loop until approve. validators.ts: no exclamation marks, banned words list, exactly one question mark-terminated ask per message, no invented testimonials, awards, or numbers (reuse lintClaims from 058 if present, else a local stub with a TODO naming 058), reply language matches the user's language.

Express mode: ids not shown are written ASSUMED with the tree default and flagged for Before-we-jump (D-004). Deep is the default.

## Interfaces and data shapes

```ts
export interface GuideSession { projectDir: string; depth: "express" | "standard" | "deep"; language: string; pushes: Record<string, number> }
export function runTurn(s: GuideSession, input: { kind: "answer" | "suggest" | "skip"; text?: string }, deps: { think: typeof think; acp?: AcpClient }): Promise<{ message: string; questionId: string | null; status: "asked" | "pushed" | "soft" | "done"; cards?: GalleryEntry[] }>;
export function suggest(questionId: string, facts: Facts, deps: { think: typeof think }): Promise<Array<{ label: string; why: string; source: string }>>;
export function validateGuideMessage(msg: string, ctx: { language: string; facts: Facts }): string[];
export function briefLoop(s: GuideSession, deps: { think: typeof think }): AsyncGenerator<{ draft: SiteBrief; approved: boolean }>;
```

## Steps

1. Write schemas.ts for every think task used here (guide-message, pushback-judge, suggest, mirror, brief-draft, brief-revise).

2. Write validators.ts with one test per rule.

3. Write pushback-judge.ts: model verdict OR phrase floor, at most two pushes; test soft, soft, soft gives two pushes and SOFT.

4. Write suggest.ts with grounding checks and gallery cards for taste ids.

5. Write mirror.ts with the every-eight cadence and module-end summary.

6. Write live-turn.ts and wire it as the TurnHandler in packages/app/src/server/routes.ts.

7. Write brief-loop.ts with partial re-draft of corrected fields.

8. Record cassettes for a ten-turn Towel & Tea conversation (HH_CASSETTE=record HH_LIVE=1) if grok is available; otherwise hand-write cassettes that match the schemas and say so in the summary.

9. Write guide-live.test.ts replaying those cassettes: 10 turns including one double pushback, one Suggest with 4 cards, and brief approval.

10. Write the Playwright e2e that runs the same replay through the real browser desk at 375.

## Edge cases

- Grok unavailable mid-interview: the desk shows a calm message, falls back to the deterministic engine's ask, and the session stays resumable.
- The model returns two questions in one message: validator rejects it and the turn re-asks once, then falls back to the tree ask.
- Non-English answers: the Guide replies in that language; ids and files stay in English.
- A Suggest option citing an upload that does not exist is dropped.

## Acceptance criteria

- [ ] Cassette-based e2e of 10 turns passes, including one double pushback, one Suggest with 4 cards, and brief approval.
- [ ] Pushback is at most two per id, then SOFT.
- [ ] Every Guide message passes the validators.
- [ ] The desk uses the live handler by default and falls back cleanly.

## must_haves

truths:

- Grok is live in the interview through the 017 adapter.
- Pushback holds the line twice, then accepts as SOFT.
- Suggest is grounded in the user's own material.
- The Site Brief is approved by the user, not assumed.

artifacts:

- packages/engine/src/guide/live-turn.ts
- packages/engine/src/guide/suggest.ts
- packages/engine/src/guide/brief-loop.ts
- packages/engine/src/guide/validators.ts

key_links:

- routes.ts TurnHandler calls runTurn.
- runTurn records answers through the 018 engine so state and resume stay deterministic.

prohibitions:

- Do not let the model skip or invent tree ids.
- Do not invent testimonials, awards, or metrics.
- Do not push back more than twice on one id.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
pnpm --filter @hitchhiker/app test
pnpm --filter @hitchhiker/app exec playwright test e2e/live-guide.spec.ts
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/035.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(guide): run the interview live on Grok with pushback, Suggest, and the brief loop
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `036-review-033-035.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `033` Show phase progress and resume from the home index (Don't Panic Desk, Gargle Blaster, high)
- `034` Serve the companion app locally (Don't Panic Desk, Heart of Gold, high)
- `035` Run the Guide live: persona, pushback, grounded Suggest, brief loop (The Guide, Forty-Two, xhigh)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
