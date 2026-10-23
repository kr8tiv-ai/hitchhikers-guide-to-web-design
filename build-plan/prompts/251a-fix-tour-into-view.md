---
id: "251a"
kind: build
phase: mostly-harmless
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: []
time_cap_min: 75
title: "BUG-067: the first-run tour is in view and focused after Create project and after Replay tour"
---

# 251a. Tour card in view and focused (BUG-067, S3) (time box 75 min)

## Evidence (Desk Tester run 11, main d529dde5, 1440x900, headed Chromium)
`build-plan/evidence-run11/BUGS.md`, `out-004.txt`, `cmd-004.js`:
- Splash > Enter the Guide > fill name + dir > **Create project**. The page reloads to the splash at `scrollY 0`. The `[data-tour]` plate's bounding box is `y=2392.7, h=434` (far below the 900 px fold). `document.activeElement` is `BODY`.
- Desk menu > **Replay tour** (`renderReplayControl`, `packages/app/src/tour.ts:82`, posts `tour=replay` to `/api/tour`): after the reload the plate is still at `y=2392`, the page did not scroll, focus stays on `BODY`.
- Esc with body focus closes the tour: PASS (keep it passing).

## Code to start from
- `packages/app/src/client/tour.ts`: `mountTour`, `revealTour(doc, behavior)` (uses `scrollIntoView({block:"nearest"})`), `handleTourKey`.
- `packages/app/src/tour.ts` (server render of the plate, `data-tour`, `tabindex="0"`, `renderReplayControl`).
- `packages/app/src/client/desk.ts` (find where `mountTour`/`revealTour` are or are not called on load, and how the splash cover `[data-splash-cover]` and its dismissal interact), `packages/app/src/server/routes.ts` (`/api/tour` replay handler near :4113, project-create redirect), `packages/app/src/server/project-desk.ts`.
- Find the root cause first: is `revealTour` never called on these two paths, called while the splash still covers the page, called before layout, or is the plate rendered at the end of the document? Write what you find in the report.

## Spec
1. After **Create project** the person lands on the desk with the tour plate open, scrolled into view (its top inside the viewport) and focused (`document.activeElement` is the `[data-tour]` plate or its heading/first control). If the splash is shown again after Create project, either do not re-show it for a person who has already pressed Enter the Guide in this browser session (preferred), or reveal and focus the plate the moment the splash is dismissed. Note which you chose.
2. After **Replay tour** the plate is open, scrolled into view, and focused, with no extra click.
3. Reveal uses `block: "start"` or `"center"` (not only `"nearest"` from far away), respects `prefers-reduced-motion` (auto vs smooth), and must not steal focus from a field the person is typing in, from an open `dialog`, or from a listening mic.
4. Do not break: Esc closes the tour (body focus), arrows move steps, Skip/Done persist `tour=seen`, the 242e/242g splash Escape rules.

## Acceptance criteria and tests (name new files `*-251a.test.ts` in `packages/app/test/`)
- Unit (node:test with the fake `TourDocument`/`TourNode` style already used in app tests): a "page load after Create project" entry point (whatever function you wire) calls `scrollIntoView` with `block` `start` or `center` on `[data-tour]` and calls `focus()` on it; with a focused textarea or `dialog[open]` it does not move focus.
- Unit: the Replay path (the load after `/api/tour` `tour=replay`, e.g. a flag/hash/query the server adds to the redirect or the render) reveals and focuses the plate.
- Unit: splash path: with `[data-splash-cover]` present nothing is revealed; on dismissal the plate is revealed and focused (or the server does not re-render the splash after Create project; assert whichever you implemented at the route/render level).
- Server/route test: the Create project response/redirect and the Replay response carry whatever marker the client uses (so the behavior is not left to chance).
- Existing tour, splash and Escape tests stay green. New tests fail before the fix.

## Commit
```
fix(app): bring the tour into view and focus it after Create project and Replay tour (251a)
```

## Rules (all 251 fixes)
- Work only inside `C:\Users\lucid\Desktop\hh-fix251-wt` (branch `fix-251`, base `d529dde5`). Never read-write, check out, or run anything in `C:\Users\lucid\Desktop\hh-fix-wt`, `C:\Users\lucid\Desktop\hh-library-wt`, `C:\Users\lucid\Desktop\hh-fix250-wt`, `C:\Users\lucid\Desktop\hh-fix250b-wt`, `C:\Users\lucid\Desktop\kr8tiv-ai-wt`, `C:\Users\lucid\hh-desk-*`, `C:\Users\lucid\Desktop\desk-e2e-run11` or the main checkout. The run 11 evidence you need is copied into `build-plan/evidence-run11/` (read only). Never run `git worktree`, `git checkout <other branch>`, `git reset --hard`, `git clean`, `git push`, or anything with `--force` or `--no-verify`.
- Spec first, test first: write the new test(s) from the Acceptance criteria below, run them, and confirm they FAIL on the current code for the reason in this prompt. Then fix, and confirm they pass. Quote the failing assertion (one or two lines) in your final report.
- Do not loosen, skip, delete, retry-wrap or env-guard any existing test. Do not touch `vendor/`, `.hh-driver/` or `build-plan/`. Only add to README.md; never shorten it.
- Never start or stop anything on ports 4175, 4188 or 4210 (a desk test is running on 4175). Never run the full Playwright suite. Never run `hh brief --approve`, publish, or deploy. Do not run a real Grok build or a live Grok interview call; tests use fakes or `HH_CASSETTE=replay`.
- Verify with `$env:HH_CASSETTE='replay'`: the touched package tests (`pnpm --filter ./packages/<name> test`), `pnpm --filter @hitchhiker/qa test`, `pnpm exec tsc -b --pretty false`, and `pnpm lint`. All must be green before you commit.
- Use PowerShell syntax (`;`, not `&&`). Nobody can answer questions: make the reasonable choice, note it in your report, keep going.
- One commit with the exact message in the Commit section (the `(251x)` tag is how the driver finds it). Leave the tree clean. Do not push; the driver never pushes. Pushing to `main` needs Matt's explicit yes.
- Line numbers are for `d529dde5`; re-find the code if it moved.
