# 243w - Desk Run 11: Scope the Per-Prompt Visible-Copy Gate to What the Prompt Owns, and Refresh Stale Rule Text in Not-Yet-Passed Prompts

## Context

243u added a visible-copy gate (`packages/engine/src/spec/visible-copy.ts`, called from `enforcePromptClose` in `packages/engine/src/guide/site-build.ts`). Desk Run 11 then re-ran the 15 copy prompts of project `site-c` (Paradise Found) in order with regenerated prompt text.

- `BUG-119` (S1): the first re-run, prompt 026 (`REQ-COPY-hero`, `Files: src/components/SectionHero.astro`), wrote a clean hero (0 TODO in `SectionHero.astro`) but failed with `Visible copy failed. dist/about/index.html: ... TODO ...`. Every hit is on pages and components owned by later prompts (029-116) that have not run yet. `enforcePromptClose` scans the whole of `dist` for every page-editing prompt, so in an ordered run (and in a fresh build, where later sections are still scaffolds) the first copy prompt always fails on text it does not own, and the run can never pass. The 40-hit cap (`HIT_CAP`) also hides which hits are new.
- `BUG-118` (S2): prompt files in `<project>/.hitchhiker/prompts/NNN.md` are written once at brief approval (`draftBriefPlan` / `prepareSiteBuild` in `site-build.ts` reuse existing prompt files), so a project planned before an engine fix keeps the old shared rule text forever; retrying a prompt in the desk reruns the stale text (Run Eleven C's copy prompts still said "If a fact is missing, mark it TODO" after 243u).

## Deliverables

1. **Per-prompt gate scoped to the prompt (BUG-119)**. In `enforcePromptClose`:
   - Before the prompt's Grok session starts, record a baseline of visible-copy hit counts per `(html file, pattern id)` over `dist` (uncapped counting; add an exported `countVisibleCopy(root)` beside `scanVisibleCopy` that returns counts and does not stop at `HIT_CAP`). Store it with the run state so a retried prompt takes a fresh baseline.
   - After the prompt, a non-QA/launch prompt fails only when (a) some `(file, pattern)` count went up versus the baseline (report those files with snippets), or (b) a source file the prompt owns (the `Files:` line of its `## Task`, plus files in its changed-file list under `src/`) contains a visible-copy pattern in visitor text or a `data-copy-*` / `alt` / `title` / `content` attribute value. Ignore code comments, frontmatter code fences, and `<script>`/`<style>` bodies, the same way the HTML scan does. Reuse the single `VISIBLE_COPY_PATTERNS` list; do not create a second list.
   - Prompts that match `QA_OR_LAUNCH` (QA gate, jury, prelaunch, launch, post-deploy, deploy, once-over) keep the full-site scan: any hit anywhere fails.
   - When `dist` has no baseline (did not exist before the prompt), treat the baseline as empty for owned files only and do not fail a non-QA prompt for pages outside its owned files; say so in the run log line.
   - The failure reason must say which hits are new or which owned file holds them, so a retry knows what to fix.
2. **Refresh stale rule text on retry and resume (BUG-118)**. When the desk retries a prompt, or resumes a run whose remaining prompts were written by an older engine, regenerate the shared, engine-owned parts of that prompt file (the rule block from `SITE_RULES`, the `Acceptance:` rule lines, the design-language preamble) from the current engine while keeping the prompt's own task text, files list, requirement ids, and any owner edits outside the engine-owned blocks. Only prompts that have not passed are refreshed; passed prompts are never rewritten. Write the old file to `.hitchhiker/prompts/.prev/NNN.md` first and log the refresh. If a prompt's engine-owned blocks cannot be located reliably, leave it unchanged and log why rather than guessing.

## Tests

Add `packages/engine/test/desk-run11-243w.test.ts` covering, with temp fixtures:
- a copy prompt whose owned component is clean passes even though another page in `dist` still has `TODO` from before the prompt;
- the same prompt fails when it adds a new `TODO` to any page (count goes up), and the reason names that page;
- it fails when its owned `.astro` file has `data-copy-es="TODO"` or visible `TODO`, and passes when the only TODO in that file is in a code comment or script;
- a QA/launch prompt still fails on any pre-existing hit anywhere in `dist`;
- `countVisibleCopy` counts past 40 hits;
- retrying a not-yet-passed prompt whose file holds the old "If a fact is missing, mark it TODO" rule rewrites only the engine-owned block to the current rule, keeps task text and files, and saves `.prev/NNN.md`; a passed prompt is not touched.
Keep `desk-run11-243u.test.ts` passing without loosening any assertion.

## Verification Gates

Run from the repository root:
- `node --experimental-strip-types --test packages/engine/test/desk-run11-243w.test.ts packages/engine/test/desk-run11-243u.test.ts`
- `pnpm typecheck`
- `pnpm lint`

## Commit

`fix(engine): scope the per-prompt visible-copy gate to new hits and owned files, and refresh stale engine rule text in prompts that have not passed (243w)`