# 012 Review — prompts 009, 010, 011

Verdict: **PASS**

Reviewed: 2026-10-06. Fresh session. No fix commits. No source changes in this review.

HEAD reviewed: `b0c21d3` (`feat(ai): one audited Grok adapter with schemas, cassettes, and redaction`).

This verdict is the nine must-have truths below, each with a test name or a file line, plus the verification commands. It is not a general impression of the tree.

## History

Three build commits, in order, on top of `34235d7`. Messages match the prompt commit lines. They are not squashed. History was not rewritten.

| Order | Commit | Message | Prompt commit line |
| --- | --- | --- | --- |
| 1 | `c0eeb5f` | `feat(cli): add hh doctor and session-id probe` | same |
| 2 | `0bcd205` | `feat(design): the Guide's own Don't Panic design system and comps` | same |
| 3 | `b0c21d3` | `feat(ai): one audited Grok adapter with schemas, cassettes, and redaction` | same |

## 009 Add the hh binary and /hh-doctor probes

### Truths

- Session-id mode is probed, not assumed. `classifyHelp` in `packages/cli/src/session-probe.ts` is pure. A paragraph counts only when it spells `--session-id` or a standalone `-s`. `sessionStorage` is stripped before the search. UUID and a nearby `name` together, or neither signal, stay `unknown`. `doctor` in `packages/cli/src/doctor.ts` starts at `unknown`, runs `grok --help` only after a version or `where.exe` hit, and passes stdout plus stderr into `classifyHelp`. A missing binary pushes `session probe skipped` and does not call `--help`. `defaultConfig().sessionIdMode` remains `"unknown"`. Tests: `uuid-only help maps to uuid`, `alias-only help maps to alias`, `help that mentions both uuid and a session name maps to unknown`, `session inside sessionStorage is not evidence`, `a missing grok is a warning and the probe is skipped` (asserts `grok --help` was not called), `doctor --project writes uuid or alias and leaves unknown untouched`. On this machine, `node --experimental-strip-types packages/cli/src/main.ts doctor` printed `session-id: uuid` and `effort: present` from the installed `grok 1.0.46` help, and exited 0.
- A missing grok binary is a warning. The same doctor test requires exit code 0, `grokOnPath === false`, the line `grok: not on PATH`, and warnings for playwright, whisper, and pdftotext. `formatDoctor` adds no exclamation mark. Exit 1 is only `nodeOk === false`. Test `an old node version exits 1` and test `nodeIsSupported accepts major 22 and above` cover that. Test `doctor does not require whisper, playwright, or pdftotext` reads `doctor.ts` and `main.ts` and requires no import of those tools and no `api.x.ai`. The live run here warned for whisper and pdftotext and still exited 0. Playwright is on this PATH, so that line was absent, which matches "report them when absent."
- Config writes go through the state lock. `saveConfig` in `packages/engine/src/config.ts` runs `parseConfig` first, creates `.hitchhiker`, then `withStateLock` and `replaceViaTemp` onto `config.json`. `persistSessionMode` calls `saveConfig` only for `uuid` or `alias`. `unknown` returns before any write. Test `saveConfig round-trips and uses the lock` writes a config, requires the temp file and `state.lock` to be gone, then holds `state.lock` with `process.pid` and requires `LockHeld` with the file bytes unchanged. Test `doctor --project writes uuid or alias and leaves unknown untouched` requires no `.hitchhiker` directory when the probe stays `unknown`, including the both-signals fixture.

### Also checked

- `packages/cli/package.json` bin is `hh` → `./src/main.ts`. `main.ts` starts with `#!/usr/bin/env node`. `parseArgs` accepts only `hh doctor` and `hh doctor --project <dir>`. Anything else returns exit 2 and the one-line help. Test `hh doctor is the only successful command`.
- Spawns use `spawnSync` with `shell: false` and a 10 second timeout. Version and `--help` only. The missing-grok test requires no `--always-approve` and no `grok -p`.
- `classifyHelp` and `saveConfig` are exported from the cli and engine barrels. The cli tests import `saveConfig` from `@hitchhiker/engine`.
- The prompt's verification filter is `pnpm --filter @hitchhiker/cli`. Prompt 001 locked the published name `hitchhikers-guide`. That filter matches no package. pnpm still exits 0. The tests ran as `pnpm --filter hitchhikers-guide test` (17 passed). Renaming the package would undo 001. Recorded, not changed.

## 010 Design the Guide's own brand and design system

### Truths

- The Guide has its own deliberate identity and design system before any screen exists. `packages/app/src/design/` holds tokens, type, components, motion, voice, the outlined wordmark, and `README.md`. The README names three directions (Field Manual, Desk Lamp, Signal Flare) and picks Desk Lamp: Bricolage Grotesque and Literata, venetian on warm paper by day, brass on a warm black by night. `packages/app/src/index.ts` is still only `PACKAGE_NAME`. There is no app screen yet. The three comps are static HTML that link only `tokens.css`, `type.css`, and `components.css`. Test `wordmark is outlined paths with a title` requires a `<path` and `<title>Don't Panic</title>`. Test `fonts are self-hosted woff2 with an OFL` requires the five woff2 files, both OFL texts, and no `fonts.googleapis.com` or `fonts.gstatic.com` in the CSS. Test `comps stay clear of slop, banned words, and indigo` scans the three comps.
- Every token passes WCAG AA where it carries text. Test `text pairs clear WCAG AA in both themes` requires ink, muted, success, warning, and danger on surface, and accent-ink on accent, at 4.5:1 or higher in light and dark, and the focus ring at 3:1 against surface. Kickers and the Running state use accent as text. A separate check of `contrastRatio` in this review measured accent on surface at 6.90 light and 8.69 dark. The brand-kit swatch pairs (paper, ink, venetian, brass, field) measured 7.40 to 15.41. All clear 4.5:1.
- Motion respects prefers-reduced-motion. `prefersReducedMotion` in `packages/app/src/design/motion.ts` reads `prefers-reduced-motion: reduce`. `enter`, `confirmPulse`, `mapProgress`, and `toast` settle the element and return `Promise.resolve()` before the dynamic `import("gsap")`. There is no top-level `from "gsap"`. Test `reduced motion resolves immediately and skips GSAP` stubs `matchMedia` to match, calls all four functions (one `enter` with a 4000 ms delay), and requires the wall time under 50 ms. Test `missing matchMedia does not pretend the user asked for less motion` requires `false`. CSS at `components.css` lines 723–729 sets `animation: none` and `transition: none` on buttons, votes, and `.hh-rise` under `prefers-reduced-motion: reduce`. The entrance animation is declared only under `no-preference`. No Lenis import in `packages/app`.

### Also checked

- Buttons and votes set `min-width: 44px` and `min-height: 44px`. Test `buttons keep a 44px target` requires that text in `components.css`. Focus uses `:focus-visible` and `--color-focus`.
- `tokens.css` and `tokens.ts` are locked together by test `tokens.css matches tokens.ts`.
- Question card, example-site card, Guide map, status line, approval row, dashboard table, empty state, and error state are in `components.css` and used by the comps. Desk shows DP-1.1 with Answer, Suggest for me, and Skip, plus a long German sentence with `lang="de"` and `overflow-wrap: break-word`.
- GSAP 3.15.0 is pinned on `@hitchhiker/app`. The registry `license` field is `Standard 'no charge' license`. NOTICE records the name, the registry URL, the repository `https://github.com/greensock/GSAP`, and that the string is not GPL and not AGPL. D-001 and prompt 010 require GSAP. The short MIT-compatible list in the prompt does not name this licence. D-001 wins. The library was not swapped. `@playwright/test` 1.63.0 is Apache-2.0 and `opentype.js` 2.0.0 is MIT, both devDependencies, both in NOTICE. Fonts are SIL OFL-1.1, self-hosted, listed in NOTICE and `public/fonts/OFL.md`.

### UI at 375 and 1440

I looked at the committed PNGs, then re-ran the screenshot script. Byte sizes matched the files already in git, and the script printed no `OVERFLOW` line.

Looked at, both themes: desk, dashboard, and brand-kit at 375 and at 1440 (also 768, which the script writes).

Desk Lamp holds up. Warm paper `#f3ebdd`, a 7 px venetian spine, DON'T PANIC in a large friendly grotesque with a real apostrophe, Literata for the interview. Night is a warm black with brass buttons and brass labels. It is a designed dark, not an inverted day. At 375 the German question wraps inside the card, the three votes stay on one row, and the map stacks in two columns. At 1440 the interview sits in a measure next to the map, and the rest of the paper stays empty on purpose. The dashboard stacks its table under labels at 375 and becomes a real table at 1440, with an empty escalations state and one paused type-check. The brand kit shows the wordmark, the type pair, five material swatches, and Approve / Redo.

No indigo-on-gray Tailwind defaults, no magnetic buttons, no purple gradient, no lorem, no exclamation marks, and the word elevate is not in the comps. Copy is plain and a little dry. This is the Guide's own system. It is not a book cover and not an AntiHero page.

## 011 Grok adapter for structured AI calls

### Truths

- Every AI call in the Guide goes through one adapter. `think` in `packages/engine/src/ai/think.ts` is the only function that builds a model prompt. It is exported from `packages/engine/src/ai/index.ts` and from `packages/engine/src/index.ts`. A repo search of `packages/**/*.ts` finds no `api.x.ai` call and no other `grok -p` spawn. `hh doctor` spawns `grok` for `--version` and `--help` only. Prompts 047, 051, 088, 090, 092, 142, and 148 are not in the tree yet, so nothing in this group left a scripted stub where a later prompt will call `think`. The live smoke in `ai-live.test.ts` calls `think` with a two-field schema and is skipped unless `HH_LIVE=1`.
- CI never needs a live model. Test `replay hit returns the cassette and does not spawn` and test `replay miss throws CassetteMissError with the key and does not spawn` inject `HH_CASSETTE=replay` and a spawn that fails the test if called. Test `live smoke returns a two-field object` is skipped unless `HH_LIVE === "1"`. This engine run skipped it. The unit workflow from prompt 005 still sets `HH_CASSETTE=replay` (`ci-workflows.test.ts`, `stepEnv(..., "HH_CASSETTE") === "replay"`). `packages/engine/test/cassettes/README.md` documents replay, record, off, and the live command.
- A think call cannot edit files. `planGrokCall` adds `--permission-mode plan` and `--tools read_file,grep,list_dir` when those flags are in the set passed in. `READ_ONLY_TOOLS` is that list. The child cwd is `.hitchhiker/tmp/think-<uuid>`, removed in a `finally`. Test `model and effort come from config, and a schema adds --json-schema` requires `--permission-mode` `plan`, `--tools` `read_file,grep,list_dir`, `--max-turns` `1`, and no `--always-approve`. The adapter writes a prompt file only inside that scratch directory, plus the redacted NDJSON log and, in record mode, a cassette. It does not assign `GROK_HOME`. Test `the log drops an xai- key, an email, and env values` requires the spawned env to lack `GROK_HOME` and the log line to lack the fake key.

### Also checked

- Test `a bad answer then a good answer is one repair and two calls` and test `two bad answers throw ThinkSchemaError and stop` cover the one repair. Test `usage limit and auth errors throw once and do not repair` and test `a timeout throws ThinkTimeoutError and does not repair` cover the no-loop cases. Test `grok missing on PATH throws GrokMissingError with the doctor hint` requires the message `Run hh doctor`.
- Test `a 30 KB prompt switches to --prompt-file`, test `images switch to --prompt-json content blocks`, and test `argv never contains a flag missing from the provided flags set` match step 2. Test `flagsFromHelp keeps only flags the help text names` rejects `--always-approve`.
- Test `ai block defaults to grok-4.7 and accepts a task effort` and test `ai rejects unknown keys, a low effort, and a timeout outside range` cover the config block. Model default is `grok-4.7`, effort default `medium`, timeout 120000.
- Schema validation is the hand-rolled subset in `schema-validate.ts` (type, properties, required, enum, items, minItems, maxItems, maxLength, pattern). No ajv. NOTICE was left unchanged for that reason, which matches "record the choice if you add ajv."
- Test `record writes the result and leaves env values out of the file` plants `HH_SENTINEL` and requires the cassette JSON to omit it.
- Windows: `resolveGrokCommand` walks PATH and PATHEXT. `spawnGrok` runs a `.cmd` or `.bat` through `cmd.exe /d /s /c` with quoted arguments, `shell: false`. Test `a Windows batch shim receives the prompt as an argument` ran on this machine and passed. Test `timeout kills the child process tree` passed.

## File list

`git diff --name-only 34235d7..HEAD`:

- Prompt 009 list, plus `packages/cli/src/index.ts` (step 9, export `classifyHelp`) and `packages/engine/src/config.ts` (the prompt allows `saveConfig` there).
- Prompt 010 list, plus the woff2 files, both OFL.txt files, the 18 PNGs, and `pnpm-lock.yaml`. The prompt requires those fonts and the screenshots when each PNG is under 400 KB. The largest here is `desk-1440-dark.png` at 278940 bytes.
- Prompt 011 list, plus `packages/engine/test/config.test.ts` (step 1 says update the config tests), `packages/engine/src/boundaries.ts`, and `packages/engine/test/boundaries.test.ts`.

The boundary change is not a new feature. Prompt 003 required every dependency to be `workspace:*`. Prompt 010 pinned `gsap` at `3.15.0`. `allowExternal: ["gsap"]` on `@hitchhiker/app` lets that pin through, and the test requires the pinned name to be exactly the allow list and not `workspace:*`. Dev dependencies (`@playwright/test`, `opentype.js`) are outside that check. Nothing else gained an external dependency.

No extra feature. Nothing to revert. No client site, no new remote, no `@theatre/studio`.

## Live Grok

The only model seam in this group is `think`. It takes a schema, validates, repairs once, and can replay a cassette. The live test does not run unless `HH_LIVE=1`. Doctor does not send a prompt. No scripted stub was left in place of a live call.

`buildGrokArgv(req, cfg, flags)` takes the flag set as an argument, which is the signature in prompt 011. `think` fills that set by parsing `grok --help` when the caller does not pass one. Doctor stores `effortFlag` and `sessionIdMode`, not the full flag set, and prompt 011's file list does not include `doctor.ts`. The read-only policy is still applied whenever `--tools` and `--permission-mode` are in the set, and the tests require a flag that is absent from the set to be omitted. That is the prompt's own rule. It is not a failed truth.

## Authority

No conflict with `context/matt-answers.md` or `DECISIONS.md` that these commits got wrong. D-001 requires GSAP in the app's own motion layer, on native scroll, with reduced motion. That is what `motion.ts` does. The package name `hitchhikers-guide` stays as prompt 001 locked it. Prompt 009's filter string `@hitchhiker/cli` disagrees with that name. The implementation followed 001.

## Notes for later prompts

These are not failed truths.

- Unset `HH_CASSETTE` is a live call (`cassetteMode` returns `off`). CI sets `replay`. The engine tests that call `think` pass the mode in `deps.env`. A future test that forgets the env would try the installed CLI.
- If a machine's `grok --help` lists neither `--tools` nor `--permission-mode`, `planGrokCall` omits both, because the prompt forbids flags the help does not list. The scratch directory is still deleted afterward. On grok 1.0.46 the help lists both, and the full-flag test locks the read-only argv.
- `packages/engine/src/boundaries.ts` now has `allowExternal`. Later pinned packages need the same field or the boundary test fails.
- The screenshot script prints `OVERFLOW` and still exits 0. This run printed none.
- `pnpm --filter @hitchhiker/cli test` matches nothing and exits 0. Use `pnpm --filter hitchhikers-guide test`.

## Verification

Run from the repo root on 2026-10-06. Each exited 0.

| Command | Result |
| --- | --- |
| `Test-Path hh-build-plan/reviews/012-REVIEW.md` | True after this file is written. |
| `pnpm --filter @hitchhiker/cli test` | Exit 0. No project matched. See the note above. |
| `pnpm --filter hitchhikers-guide test` | 17 passed, 0 failed. This is the 009 suite. |
| `pnpm --filter @hitchhiker/engine test` | 68 passed, 0 failed, 1 skipped (`live smoke returns a two-field object`). |
| `pnpm install` | Already up to date. Lockfile unchanged. |
| `pnpm --filter @hitchhiker/app test` | 9 passed, 0 failed. |
| `pnpm --filter @hitchhiker/app exec node --experimental-strip-types scripts/screenshot-comps.ts` | Exit 0. 18 PNGs, no `OVERFLOW`, sizes unchanged from git. |
| `pnpm exec tsc -b --pretty false` | Exit 0. No diagnostics. |

Node printed `NO_COLOR` / `FORCE_COLOR` warnings. They did not fail the runs.

`node --experimental-strip-types packages/cli/src/main.ts doctor` on this Windows machine exited 0: node 24.13.1 ok, git ok, grok 1.0.46 on PATH, session-id uuid, effort present, whisper and pdftotext not installed.

## Scope

No new feature. No fix commit. Prompt 013 was not started. Nothing was pushed, deployed, or published.
