---
id: "251d"
kind: build
phase: mostly-harmless
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: []
time_cap_min: 75
title: "Surface design-library errors; pick knowledge packs relevant to the brief"
---

# 251d. Design-library errors are visible; packs match the brief (time box 75 min)

## Evidence
- `packages/engine/src/guide/site-build.ts:1893-1957` `attachDesignSelection(library, brief)` dynamically imports `knowledge/src/design-library.ts`, calls `loadDesignEntries`, `loadDesignIndex`, `selectDesignEntries` for hero/story/gallery/footer, and ends in `catch { return library; }`: a broken/missing design library or a throwing selector silently yields prompts with no picks and no packs (`build-plan/evidence-run11/LIBRARY-AUDIT.md`).
- `freshPackNotes()` (:1959) reads `packages/knowledge/packs/*/SKILL.md` (25 packs, 12 with `checked:`), sorts by name, and `design-language.ts` `libraryLines()` uses the first 2 non-stale excerpts (280 chars) in EVERY prompt: alphabetical, not relevant.

## Coordination note
A parallel chain (branch `fix-250`, prompt 250d) is fixing the same catch. To keep a later merge easy, use the same shape: write `.hitchhiker/<the same build/plan dir writeLibrarySections uses, ~:721-734>/library-error.txt` with the message, log through the existing engine logger (ai.ndjson-style `appendAiOutcome` or the build log; not bare console spam), and mark `artDirection: "none"` on the returned library. Keep your change inside `attachDesignSelection`/`freshPackNotes` and their direct callers/types.

## Spec
1. On any error in `attachDesignSelection` (import, load, index, select): keep going (prompts still written, build/plan not stopped), write `library-error.txt`, log it visibly (task e.g. `design-library`, outcome `error`, message), and return the library flagged so that each prompt's `## Design language` block carries one line: `No art direction: the design library failed to load (see library-error.txt).` and the desk plan/build view can show a warning (add the flag to whatever plan/build status object the desk already reads; if wiring the desk text is more than ~30 lines, add the flag + engine test and note the desk follow-up).
2. Do not swallow other errors on that path either: a pack read error is logged once and skipped, not silently ignored.
3. `freshPackNotes(brief)`: score packs by relevance to the brief (pack name, frontmatter `description`/`tags`/`when` if present, and body keywords vs brief words, style world, moods, and the section types being built). Return them ranked, ties by name; stale packs still excluded from excerpts. `libraryLines()` then takes the top 2 relevant ones (and none if nothing scores above 0, rather than two unrelated ones; note the choice).

## Acceptance criteria and tests (`packages/engine/test/design-library-errors-251d.test.ts`)
- A loader/selector that throws (inject the module/loader or point the knowledge root at a temp dir with a broken entry): plan preparation still writes prompts, `library-error.txt` exists with the message, an error outcome is logged, the prompt contains the "No art direction" line, and the returned flag is set. Fails on d529dde5 (silent).
- Healthy library: no error file, no "No art direction" line (no false alarm).
- Packs: a temp packs dir with `alpha-unrelated` (checked, about e.g. fintech dashboards) and `zz-hospitality-calm` (checked, about calm hospitality/real estate): a calm hospitality brief gets `zz-hospitality-calm` first; alphabetical order no longer wins. Deterministic on ties.
- Existing site-build/design-language tests stay green.

## Commit
```
fix(engine): surface design-library errors and pick packs for the brief (251d)
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
