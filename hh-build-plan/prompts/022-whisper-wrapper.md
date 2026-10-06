---
id: "022"
kind: build
phase: dont-panic
slice: Sub-Etha
title: "Wrap whisper.cpp for local push-to-talk"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["009"]
files: ["packages/voice/src/whisper.ts", "packages/voice/src/index.ts", "packages/voice/test/whisper.test.ts", "packages/voice/README.md", "NOTICE"]
requirements: ["HH-VOICE-01"]
review_checkpoint_embedded: false
---

# 022. Wrap whisper.cpp for local push-to-talk

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

Transcribe a local audio file by spawning whisper.cpp when the user has installed it. Ship no model weights in git. If the binary or the model is missing, return a typed error the UI can show, and do not fall over to a paid API.
Add hh voice setup: with the user's explicit yes, download the official whisper.cpp release binary for this OS and the base.en (default) or small model from the official model card URL, verify the checksum, store under os.homedir()/.hitchhiker/voice/, and record licences in NOTICE. Never download without a yes. Tests inject the downloader.

## Why this prompt exists

Push-to-talk is a locked input. The default path is free and local. Bundling weights we have not audited, or silently calling xAI, would break both the license story and the $0 default.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 4 (voice) and section 16
- hh-build-plan/RESEARCH-ADDENDUM.md notes on whisper.cpp MIT
- packages/engine/src/config.ts for VoiceEngine

## Files to create or change

- packages/voice/src/whisper.ts
- packages/voice/src/index.ts
- packages/voice/test/whisper.test.ts
- packages/voice/README.md
- NOTICE

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

whisper.cpp is MIT, copyright ggml, as recorded in the addendum. This package does not vendor the upstream repo. It looks for an executable path in WHISPER_CPP_BIN, then beside the platform names `whisper-cli` or `main` on PATH. The model path comes from WHISPER_CPP_MODEL. Document in README that the user downloads a model themselves and that this prompt does not pick a weight file. transcribe({ wavPath, bin, model }) returns `{ text, engine: 'local' }`. Spawn with shell false, no interpolated user strings in a shell. Arguments are an array: the bin, `-m`, model, `-f`, wavPath, `-nt`, `--no-timestamps` if supported. If you are unsure of the flag, put the args in one function buildArgs and test that function, and try `--output-txt` only if the README you write cites the flag as optional. Timeout 60 seconds. Kill the child on timeout. Non-zero exit throws WhisperError with stderr trimmed to 500 chars and no env dump. Accept wav only. Reject a path that is not a file. Do not accept URLs. Platform notes in README: Windows, macOS, Linux. No Homebrew requirement. The test uses a fake bin: a small node script passed as bin that writes `hello from the mic` to stdout and exits 0. A second fake exits 1. Do not download anything in the test.

## Interfaces and data shapes

```ts
export interface TranscribeRequest {
  wavPath: string;
  bin: string;
  model: string;
  timeoutMs?: number;
}

export interface Transcript {
  text: string;
  engine: "local";
}

export class WhisperError extends Error {
  code: "MISSING_BIN" | "MISSING_MODEL" | "BAD_AUDIO" | "FAILED" | "TIMEOUT";
}

export function transcribe(req: TranscribeRequest): Promise<Transcript>;
export function buildArgs(req: TranscribeRequest): string[];
```

## Steps

1. Implement buildArgs as a pure function. The test asserts shell metacharacters in a filename stay a single argv entry conceptually: buildArgs does not join into a string.

2. transcribe checks existsSync on bin and model and wav. Missing bin throws MISSING_BIN. It does not spawn.

3. Use spawn, not exec. Collect stdout. On code 0, trim and return. On timeout, kill the process group as best you can cross-platform: child.kill('SIGKILL') is acceptable, and the error code is TIMEOUT.

4. Refuse wavPath that starts with `http:` or `https:`. Refuse model paths inside the repo's packages/ directory so a weight cannot be committed and silently used from the package. Allow an absolute path outside the repo.

5. The fake-bin test writes a temp .mjs that prints a fixed line and exits 0. Pass it as bin. Node can be the bin if buildArgs is bypassed. So structure transcribe to accept an optional argv override only in tests via a `runner` injection: `run(bin, args) => Promise<{code, stdout, stderr}>`. Default runner spawns. The test injects. This is cleaner than a fake binary. Do that.

6. A runner that returns code 1 throws FAILED and does not include the full env.

7. README states: not bundled, MIT upstream, set the two env vars, $0, no audio leaves the machine.

8. NOTICE gains a line: optional local binary whisper.cpp, MIT, not distributed with this repo.

9. Export transcribe from the voice index. Engine voiceEngine `local` is the only engine this package calls.

## Edge cases

- Empty stdout with code 0 throws FAILED, because a silent success looks like a dropped mic.
- Paths with spaces are safe because args are an array.
- A 0-byte wav throws BAD_AUDIO before spawn.

## Acceptance criteria

- [ ] Injection test returns the fake transcript and engine local.
- [ ] Missing bin throws MISSING_BIN and does not call the runner.
- [ ] README says weights are not in git.
- [ ] No fetch and no xAI host string in the package.

## must_haves

truths:

- Local transcription does not bundle weights.
- The child is spawned without a shell.
- Failure is a typed error, not a paid fallback.

artifacts:

- packages/voice/src/whisper.ts
- packages/voice/README.md

key_links:

- whisper.test.ts injects a runner and asserts buildArgs is unused for shell joining.
- README names WHISPER_CPP_BIN and WHISPER_CPP_MODEL.

prohibitions:

- Do not commit a .bin weight or a ggml file.
- Do not call api.x.ai from this package.
- Do not require Homebrew, apt, or winget.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/voice test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/022.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(voice): add a local whisper.cpp wrapper
```
