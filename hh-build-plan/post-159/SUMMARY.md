# Post-159 fix pass: summary

The once-over after prompt 159 (662a363) left fix prompts 001–010 in `hh-build-plan/once-over/` (report: `REPORT.md`). This file tracks the post-159 pass that applies them. Times are CR (UTC-6).

## Applied

| Fix | Commit | What |
| --- | --- | --- |
| 001 post-check title | 662a363 | Applied inside the once-over itself. |
| (ci) | 9c4d622 | libvips licence exception bound to `@img/sharp-libvips-*`; live-guide replay restored (`document.createElement` receiver). |
| 002 research MIT fallback | 342bd18 | Research docs strike the withdrawn GSAP fallback and avoid-Theatre advice; doc test added. |
| 003 scaffold STATE vs loadState | ee0ecf3 | `loadState` reads the scaffolded GSD STATE.md, so `openInterview` survives a fresh scaffold. |
| 009 STT rate on settings | e9c6b41 | `/hh-settings` skill prints both `quoteStt` labels ($0.10/h rest, $0.20/h streaming) before xAI STT can be enabled; whisper.cpp stays default; no new route. Test: `packages/voice/test/settings-rate.test.ts`. |
| 007 doctor auth probe | e869196 | `hh doctor` reads `grok --help` for a bare auth-status flag; grok 1.0.46 has none, so doctor prints `auth: no non-interactive status flag in grok --help` instead of guessing. Never runs `grok login`. Tests in `packages/cli/test/doctor.test.ts`. |

## Remaining

- 004 CREDITS.json has two shapes (one parser for both).
- 005 sharp LGPL `AND` exception (decision: keep the name-bound exception or swap sharp). Needs Matt's call; not a code-only fix.
- 006 brand approval on the desk (`/brand` POST to `applyStatus` / `redoSection`).
- 008 state lock filename (`state.lock` vs v2 `STATE.md.lock`).
- 010 `hh` bin on Windows (`pnpm -w exec hh` resolves to `hh.exe`, Windows HTML Help).

## Log

- 2026-10-08 08:31: ee0ecf3 confirmed on origin/main; CI, Audit and E2E green on it.
- 2026-10-08 08:33–08:41: fix 009 run through Grok Build (grok-4.7, effort high). Committed e9c6b41. `pnpm exec tsc -b` exit 0; voice and grok-plugin tests exit 0 with HH_CASSETTE=replay. Pushed.
- 2026-10-08 08:42–09:04: fix 007 run through Grok Build (grok-4.7, effort high). Committed e869196. `tsc -b` exit 0; cli tests 61/61 with HH_CASSETTE=replay. Live `hh doctor` reports the missing status flag honestly. Pushed.
