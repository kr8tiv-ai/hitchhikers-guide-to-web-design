# Post-159 fix pass: summary

The once-over after prompt 159 (662a363) left fix prompts 001–010 in `hh-build-plan/once-over/` (report: `REPORT.md`). This file tracks the post-159 pass that applies them. Times are CR (UTC-6).

## Applied

| Fix | Commit | What |
| --- | --- | --- |
| 001 post-check title | 662a363 | Applied inside the once-over itself. |
| (ci) | 9c4d622 | libvips licence exception bound to `@img/sharp-libvips-*`; live-guide replay restored (`document.createElement` receiver). |
| 002 research MIT fallback | 342bd18 | Research docs strike the withdrawn GSAP fallback and avoid-Theatre advice; doc test added. |
| 003 scaffold STATE vs loadState | ee0ecf3 | `loadState` reads the scaffolded GSD STATE.md, so `openInterview` survives a fresh scaffold. |
| 004 CREDITS.json shapes | d6b7483 | One CREDITS.json parser for the 3D array, entries, and assets shapes. |
| 005 sharp LGPL AND | — | Closed: Matt decided no change needed (Oct 8); sharp stays as-is with the name-bound `@img/sharp-*` exception. |
| 006 brand approval on the desk | 241681b | `/brand` desk persists approve and redo through `applyStatus` / `redoSection`; CSRF on `POST /api/brand`. |
| 007 doctor auth probe | e869196 | `hh doctor` reads `grok --help` for a bare auth-status flag; grok 1.0.46 has none, so doctor prints `auth: no non-interactive status flag in grok --help` instead of guessing. Never runs `grok login`. |
| 008 state lock filename | 65d3bdd | Engine lock named `STATE.md.lock` as v2 says. Follow-up test: c04e938 (`test(orchestrator): expect STATE.md.lock in the queue source`). |
| 009 STT rate on settings | e9c6b41 | `/hh-settings` skill prints both `quoteStt` labels ($0.10/h rest, $0.20/h streaming) before xAI STT can be enabled; whisper.cpp stays default. |
| 010 hh bin on Windows | 1c5d85a / e15dd28 | Root renamed so workspace links `hh` before System32 `hh.exe`; docs mark applied. |

## Remaining

None. Post-159 once-over fixes 001–010 are applied or closed.

## Log

- 2026-10-08 08:31: ee0ecf3 confirmed on origin/main; CI, Audit and E2E green on it.
- 2026-10-08 08:33–08:41: fix 009 run through Grok Build (grok-4.7, effort high). Committed e9c6b41. `pnpm exec tsc -b` exit 0; voice and grok-plugin tests exit 0 with HH_CASSETTE=replay. Pushed.
- 2026-10-08 08:42–09:04: fix 007 run through Grok Build (grok-4.7, effort high). Committed e869196. `tsc -b` exit 0; cli tests 61/61 with HH_CASSETTE=replay. Live `hh doctor` reports the missing status flag honestly. Pushed.
- 2026-10-08 (earlier): 002 (342bd18), 003 (ee0ecf3), 010 (1c5d85a + e15dd28) already on origin/main.
- 2026-10-08 ~09:26–09:41: fix 004 committed d6b7483 and pushed.
- 2026-10-08 ~20:48–20:55: fix 008 committed 65d3bdd and pushed. CI red only on orchestrator test still expecting `/state\.lock/`.
- 2026-10-08 ~22:19: test fix c04e938 updates queue-file.test.ts to expect `/STATE\.md\.lock/`; `tsc -b` and orchestrator tests (237 pass) green; pushed.
- 2026-10-08 22:20–22:41: fix 006 run through Grok Build (grok-4.7, effort high). Committed 241681b. `tsc -b` exit 0; app 129/129 and engine 603 pass / 1 skipped with HH_CASSETTE=replay. Pushed.
- 2026-10-08: 005 closed by Matt — no sharp swap; keep the name-bound LGPL exception.
- 2026-10-08 ~22:45: this SUMMARY updated to reflect applied 002–004, 006–010, closed 005, and test follow-up c04e938.
