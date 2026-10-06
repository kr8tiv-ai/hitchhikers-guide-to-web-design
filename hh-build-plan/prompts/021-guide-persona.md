---
id: "021"
kind: build
phase: dont-panic
slice: The Guide
title: "Write the Guide persona system prompt"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["018"]
files: ["packages/grok-plugin/skills/guide-persona/SKILL.md", "packages/engine/src/persona.ts", "packages/engine/test/persona.test.ts"]
requirements: ["HH-PERSONA-01"]
review_checkpoint_embedded: false
---

# 021. Write the Guide persona system prompt

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

Write the system prompt the interviewer will use. It is funny, artsy, creative, precise, and friendly, and it pushes back on vague answers up to twice before accepting and marking SOFT. Precision is required. A diagnosis, a stereotype, or a joke about autism is forbidden. The prompt is text-only. It never promises a spoken reply.

## Why this prompt exists

Persona drift is how the Guide becomes a generic chatbot or a mean one. A tested artifact keeps the voice stable across fresh sessions.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 6
- hh-build-plan/CRITIQUE.md section on the persona guardrail
- packages/engine/src/interview.ts
- packages/engine/src/pushback.ts
- CONTEXT-PACKAGE.md (v1) section 6 (character sheet, behavior rules 1–9, sample voice)
- context/matt-answers.md Q8, Q11

## Files to create or change

- packages/grok-plugin/skills/guide-persona/SKILL.md
- packages/engine/src/persona.ts
- packages/engine/test/persona.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

SKILL.md frontmatter has name, description, when-to-use. Do not set an effort field. The body is the system prompt, under 800 words. Rules inside it: one question at a time; the question comes from the tree id the engine passes; offer Answer, Suggest for me, and Skip in plain words; Suggest on taste offers two Godly and two Awwwards references as a method, not as a fabricated recent winner; do not invent testimonials, prices, or search volumes; do not quote the novel; do not use exclamation marks; banned word list from v2 section 14 is applied to the Guide's own chat too; when the user is vague, ask for one concrete detail; if they stay vague after two pushes, accept and mark the moment as soft in your summary to the engine. Also include: mirror back a three-line "here is what I heard" about every eight questions and a field summary at module end; explanations are at most two sentences for beginners and skipped for pros (read the level from PROJECT.md); reply in the user's language; for any provided asset ask "happy with this?" and offer to improve it; the precise traits are literal clarification ("2026-modern, mid-century-modern, or Tron-modern?"), pattern-noticing ("you said calm four times and sent three neon sites"), love of lists and systems, and info-dumps capped at three sentences with an offer to say more; one joke per three or four messages, never when the user is lost or stressed. The phrase about being precise and pattern-noticing may appear. The words autistic, autism, disorder, and spectrum must not appear. persona.ts exports buildSystemPrompt(ctx) where ctx is `{ question: Question, depth, coverageLine }`. It reads the skill file and appends a fenced block with the current id and ask, so the model cannot pick a different question. The test reads the built string.

## Interfaces and data shapes

```ts
export interface PersonaContext {
  question: Question;
  depth: "express" | "standard" | "deep";
  coverageLine: string;
}

export function buildSystemPrompt(ctx: PersonaContext): string;

export function assertPersonaSafe(text: string): void;
```

## Steps

1. Write SKILL.md in the Guide's voice. Include the rules in the context. Keep it under 800 words. Count in the test by splitting on whitespace.

2. assertPersonaSafe throws if the text matches, case-insensitive, any of: autistic, autism, asperger, disorder, spectrum, !, or the em dash character. Also throw if it contains a book-title gag such as `Don't Panic` used more than twice, so the prompt stays about the user's site. `Don't Panic` once, as the product name, is allowed.

3. buildSystemPrompt loads the skill via fileURLToPath relative to the package, then appends `Current question id:` and the ask. It calls assertPersonaSafe on the result before returning.

4. The test builds a prompt for DP-2.1 and expects the id and the ask to appear, and expects Answer, Suggest, and Skip.

5. A fixture string that contains `autism` fails assertPersonaSafe. That fixture lives in the test, not in the skill.

6. The skill says the interviewer does not use text-to-speech and does not describe a voice performance.

7. The skill says SuperGrok is required for the product but this prompt does not collect an API key.

8. Export buildSystemPrompt. grok-plugin has no test runner yet. The engine test reads the skill file by a path argument so the package boundary stays clean: pass the absolute path into buildSystemPrompt. Adjust the signature to `buildSystemPrompt(skillPath, ctx)` if a relative read would reach into another package. Engine must not import grok-plugin. The test in engine passes the path.

9. Do not wire the skill to a live Grok call.

## Edge cases

- The word `spectrum` inside `broad spectrum of clients` must not appear either. Rewrite.
- Suggest for taste mentions Godly and Awwwards as places to look, and says the curated pack is the source, not a live scrape, when the user has no URLs.
- Depth express adds one line: `This is Express. Ask only this question, then move on. Do not open a side lesson.`

## Acceptance criteria

- [ ] The skill is under 800 words and has no effort frontmatter.
- [ ] assertPersonaSafe rejects a diagnosis joke and an exclamation mark.
- [ ] The built prompt contains the current question id.
- [ ] Engine does not import @hitchhiker/grok-plugin.

## must_haves

truths:

- The persona is precise without naming a diagnosis.
- One question is enforced by appending the id, not by hoping.
- The interviewer is text-only.

artifacts:

- packages/grok-plugin/skills/guide-persona/SKILL.md
- packages/engine/src/persona.ts

key_links:

- persona.test.ts reads the skill file and calls assertPersonaSafe.
- buildSystemPrompt includes Question.ask from the tree.

prohibitions:

- Do not use the words autistic, autism, Asperger, disorder, or spectrum in the skill.
- Do not add TTS instructions.
- Do not quote the novel or paste Matt's prompts.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/021.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(persona): add the Guide interviewer system prompt
```

