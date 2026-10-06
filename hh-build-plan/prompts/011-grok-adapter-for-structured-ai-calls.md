---
id: "011"
kind: build
phase: dont-panic
slice: The Guide
title: "Grok adapter for structured AI calls"
tier: Forty-Two
effort: xhigh
model: grok-4.7
depends_on: ["009", "006"]
files: ["packages/engine/src/ai/think.ts", "packages/engine/src/ai/grok-cli.ts", "packages/engine/src/ai/cassette.ts", "packages/engine/src/ai/schema-validate.ts", "packages/engine/src/ai/redact.ts", "packages/engine/src/ai/index.ts", "packages/engine/src/config.ts", "packages/engine/test/ai-think.test.ts", "packages/engine/test/ai-cassette.test.ts", "packages/engine/test/ai-live.test.ts", "packages/engine/test/cassettes/README.md", "packages/engine/src/index.ts"]
requirements: ["HH-AI-01"]
review_checkpoint_embedded: true
---

# 011. Grok adapter for structured AI calls

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

Build one audited client for every AI call the Guide makes: `think({ task, schema, model, effort, input, images? })`. It runs Grok through the installed Grok Build CLI in headless mode (`grok -p` with `--json-schema` for structured output, or `--output-format streaming-json` when a stream is needed), validates the result against the JSON schema with one repair retry, logs tokens and time without secrets, and supports cassette record and replay so CI never needs a live model. Model and effort come from config (default grok-4.7). An opt-in live smoke test runs when HH_LIVE=1.

## Why this prompt exists

Matt's plan review found the interview, brand modules, reviewer, and Elevate were scripted functions with no model in the loop. This adapter is the single seam that makes them live. One audited place for argv, permissions, schema checks, logging, and cassettes is safer and cheaper than every module spawning grok its own way.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/sources/xai/cli_headless-scripting.md and context/sources/xai/cli_reference.md (exact flags; grok 1.0.46 lists -p, -m, --reasoning-effort/--effort, --json-schema, --output-format, --prompt-file, --prompt-json, --max-turns, --tools, --disallowed-tools, --permission-mode, --sandbox)
- context/sources/xai/features_permissions.md
- packages/cli/src/doctor.ts and packages/cli/src/session-probe.ts (009)
- packages/engine/src/config.ts (006)
- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 11 and 20
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/engine/src/ai/think.ts
- packages/engine/src/ai/grok-cli.ts
- packages/engine/src/ai/cassette.ts
- packages/engine/src/ai/schema-validate.ts
- packages/engine/src/ai/redact.ts
- packages/engine/src/ai/index.ts
- packages/engine/src/config.ts
- packages/engine/test/ai-think.test.ts
- packages/engine/test/ai-cassette.test.ts
- packages/engine/test/ai-live.test.ts
- packages/engine/test/cassettes/README.md
- packages/engine/src/index.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

think() never edits files: a think call is a pure question. grok-cli.ts builds argv: `-p` (or `--prompt-file` for prompts over 24 KB, or `--prompt-json` when images are attached as content blocks), `-m <model>`, `--effort <effort>`, `--json-schema <schema>` when a schema is given, `--max-turns 1` unless the task says otherwise, and a read-only tool policy (prefer `--tools` with an empty or read-only list, or `--permission-mode plan`; use only flags that `grok --help` on this machine lists, and record which in the doctor output). It spawns with an injected spawn function, cwd set to a scratch directory under the project's .hitchhiker/tmp, and a timeout from config. The Grok login is whatever the user's Grok Build CLI already uses; the adapter never reads tokens or credential files and never sets GROK_HOME.

schema-validate.ts is a small JSON-schema subset validator (type, properties, required, enum, items, minItems, maxItems, maxLength, pattern) or ajv (MIT) if you prefer; record the choice in NOTICE. On a validation failure, think() sends one repair turn with the validation errors and the bad output; a second failure throws ThinkSchemaError with both outputs attached (redacted).

cassette.ts: key = sha256 of { task, model, effort, schema, input, image hashes }. Mode from env: HH_CASSETTE=replay (default in tests: a missing cassette throws CassetteMissError with the key), record (live call, then write packages/<pkg>/test/cassettes/<task>/<key>.json), or off (live). Cassettes store the parsed result, token counts, and duration, never environment values.

Logging: append one NDJSON line per call to <project>/.hitchhiker/logs/ai.ndjson with task, model, effort, durationMs, inputTokens, outputTokens (when the stream reports them), cassette hit or miss, and outcome. redact.ts removes anything shaped like an API key, bearer token, or email before logging.

config.ts gains `ai: { model: string; effort: { default: "medium" | "high" | "xhigh"; [task: string]: string }; timeoutMs: number }` with model default grok-4.7. The ACP client (013, next prompt) adds session reuse for the live chat on top of this adapter.

## Interfaces and data shapes

```ts
export type Effort = "medium" | "high" | "xhigh";
export interface ThinkRequest<T> { task: string; schema?: JsonSchema; input: string; images?: string[]; model?: string; effort?: Effort; maxTurns?: number }
export interface ThinkResult<T> { value: T; raw: string; inputTokens?: number; outputTokens?: number; durationMs: number; cassette: "hit" | "recorded" | "live" }
export function think<T>(req: ThinkRequest<T>, deps?: { spawnImpl?: SpawnLike; env?: NodeJS.ProcessEnv; projectDir?: string; config?: GuideConfig }): Promise<ThinkResult<T>>;
export function buildGrokArgv(req: ThinkRequest<unknown>, cfg: GuideConfig, flags: Set<string>): string[];
export function validateJson(value: unknown, schema: JsonSchema): string[];
export function redact(text: string): string;
```

## Steps

1. Extend config.ts with the ai block and defaults; update its tests.

2. Write buildGrokArgv. Tests: model and effort come from config, a schema adds --json-schema, a 30 KB prompt switches to --prompt-file, images switch to --prompt-json, and argv never contains a flag missing from the provided flags set.

3. Write the spawn wrapper with timeout and parsing for both json and streaming-json output; parse token usage when present.

4. Write validateJson and the one-repair-retry loop. Tests with a fake spawn: bad then good output succeeds with two calls; bad then bad throws ThinkSchemaError.

5. Write cassette.ts with replay, record, and off modes. Tests: replay hit returns without spawning; replay miss throws with the key; record writes a file without env values.

6. Write redact.ts and the NDJSON logger. A test logs a call whose input contains a fake xai- key and asserts the log line does not contain it.

7. Write ai-live.test.ts that is skipped unless HH_LIVE=1, then calls think with a two-field schema and asserts the shape. Document the command in cassettes/README.md.

8. Export think and helpers from packages/engine/src/index.ts.

## Edge cases

- grok not on PATH: throw GrokMissingError with the doctor hint.
- Grok usage limit or auth errors in stderr: throw GrokUnavailableError with the message, never retry in a loop.
- Timeout: kill the child process tree and throw ThinkTimeoutError.
- Windows: spawn grok.cmd or grok.exe via PATHEXT; never via a shell string.

## Acceptance criteria

- [ ] think() returns schema-valid values or throws a typed error after one repair.
- [ ] Replay tests pass offline with no grok installed.
- [ ] The live smoke is documented and runs only with HH_LIVE=1.
- [ ] Model and effort come from config; logs carry no secrets.

## must_haves

truths:

- Every AI call in the Guide goes through one adapter.
- CI never needs a live model.
- A think call cannot edit files.

artifacts:

- packages/engine/src/ai/think.ts
- packages/engine/src/ai/grok-cli.ts
- packages/engine/src/ai/cassette.ts

key_links:

- buildGrokArgv reads flags recorded by the 009 doctor probe.
- 047, 051, 088, 090, 092, 142, and 148 call think().

prohibitions:

- Do not read Grok credential files or set GROK_HOME.
- Do not call the xAI HTTP API from here; Imagine has its own client.
- Do not log prompts' secrets or raw environment values.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
pnpm exec tsc -b --pretty false
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/011.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(ai): one audited Grok adapter with schemas, cassettes, and redaction
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `012-review-009-011.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `009` Add the hh binary and /hh-doctor probes (Towel Check, Gargle Blaster, high)
- `010` Design the Guide's own brand and design system (Don't Panic Desk, Forty-Two, xhigh)
- `011` Grok adapter for structured AI calls (The Guide, Forty-Two, xhigh)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
