# 243u - Desk Run 11: No Visible TODO, Write the Spanish Copy, No Build Narration or Metadata in the Site, Commit Every Generated File

## Context

Desk Run 11 finished all 121 build prompts on `site-c` (Paradise Found, brief in `site-c/.hitchhiker/SITE-BRIEF.md`). The built `dist` fails a visitor-level review:

- `BUG-114` (S1): 135-296 literal `TODO` strings per page in `dist` HTML, about 69 visible on the home page. The brief says "English first, Spanish second. The whole site is in both", yet no Spanish was written: every nav link and text node carries `data-copy-es="TODO"` and the EN/ES toggle swaps text for the literal word `TODO`. Owner facts not given in the interview (WhatsApp number, named lawyer, farm price, road access, caretaker fields) render as `TODO` in visible copy.
- `BUG-115` (S1): implementation narration leaks into visitor copy, e.g. "Scripts are off, so this email stays...", "This control does not mark it read", "Spanish lines that are not written yet show as TODO", and `PUBLIC_...` environment variable names.
- `BUG-116` (S2): files the site imports (`src/data/brand.ts`, `src/data/pictures.ts`, `DESIGN.md`) were left untracked after the build; the build's commits do not include files it created.
- `BUG-117` (S2): internal build metadata ships in public HTML: `data-component="src/components/..."`, `data-job="Show on every page: ..."`, `data-launch-check="..."`, and planning instructions such as "Hold the terms page, and state that..." appear in generated public text (for example the llms.txt-style page index).

Root causes in the engine:
- `packages/engine/src/spec/site-rules.ts` (`SITE_RULES`): "A missing fact is still a TODO in copy."
- `packages/engine/src/spec/design-language.ts:267` and `packages/engine/src/guide/site-build.ts:2351`: "A missing fact stays a TODO in copy."
- `packages/engine/src/spec/site-prompts.ts:1220`: the copy elevate pass title "Leave a TODO where a fact is missing."
- No prompt requires the second language from the brief (`brief-plan.ts` detects the `EN-ES toggle` feature but no prompt writes the translations), no rule bans build narration, env names or plan metadata in shipped output, and no post-prompt step checks that every file the prompt created is committed.

## Deliverables

1. **Missing-fact rule**: replace every "missing fact is/stays a TODO in copy" rule with: a missing fact is never invented and never shown as TODO, placeholder or brackets to visitors; the element is hidden, or shows a graceful owner-neutral state ("Ask us" linking to the inquiry form, "Price on request" only when the brief allows it), and the gap is recorded in `.hitchhiker/MISSING-FACTS.md` (fact, page, element) for the owner. Retitle the copy elevate pass accordingly. Keep the no-invented-facts rule intact.
2. **Second language**: when the brief or plan names a second language (EN-ES toggle, "whole site is in both", or similar), the copy prompt(s) must write complete, natural translations for every visible string, nav label, button, form label, error, alt text and meta description, and the toggle must never output TODO or empty text. Default-language rules from the brief (for example "the caretaker sign-up opens in Spanish by default") are honored. Add this to the generated copy prompt bodies in `site-prompts.ts` (and the elevate pass), not as a one-off for site-c.
3. **No narration or metadata in shipped output**: add a `SITE_RULES` line and a QA gate check: visible copy speaks to the visitor only; no text about scripts, controls, implementation, build steps, prompts, TODO, env variable names (`PUBLIC_*`, `import.meta.env`), file paths, or planning instructions. Plan metadata attributes (`data-job`, `data-launch-check`, `data-component` with source paths, and similar) are not rendered in production builds (dev-only or stripped).
4. **Engine visible-copy gate**: after each build prompt that edits pages (and in the final QA/launch gate), the engine scans built `dist/**/*.html` (or rendered pages) and fails the prompt with a clear reason listing file and snippet when visible text or `data-copy-*` / `alt` / `title` / `content` attributes contain `TODO`, `TBD`, `lorem`, `PUBLIC_[A-Z_]+`, or narration patterns ("Scripts are off", "not written yet", "does not mark it", "this control"), or when production HTML contains `data-job=` / `data-launch-check=`. Keep the patterns in one exported list with tests. Do not flag code comments or non-HTML files.
5. **Commit everything a prompt creates**: after a prompt reports success, the engine runs `git status --porcelain` in the project; any untracked or modified file outside ignored paths (`.hitchhiker/tmp`, `node_modules`, `dist`, `.astro`, caches) means the prompt is not done: the engine commits them under the prompt's commit (or a follow-up `chore(site): commit generated files (<prompt id>)`) and records it in the run log. Make sure project state files that should be ignored are in the site template `.gitignore` instead of being left untracked.

## Tests

Add `packages/engine/test/desk-run11-243u.test.ts` covering: no rule string in `SITE_RULES`, design-language or site-build fallback mentions leaving a TODO; copy prompts for a brief with "English first, Spanish second" require full Spanish copy and forbid TODO in the toggle; the visible-copy gate flags `data-copy-es="TODO"`, visible TODO, `PUBLIC_FOO`, "Spanish lines that are not written yet show as TODO", and `data-job=` in a fixture, and passes a clean fixture plus a page whose only TODO is inside an HTML comment or script; the commit-everything step commits an untracked `src/data/brand.ts` in a temp git repo and ignores `.hitchhiker/tmp` and `dist`. Update existing tests that asserted the old TODO wording, without loosening any other assertion.

## Verification Gates

Run from the repository root:
- `node --experimental-strip-types --test packages/engine/test/desk-run11-243u.test.ts`
- `pnpm typecheck`
- `pnpm lint`

## Commit

`fix(engine): never show TODO to visitors, write the second-language copy, strip build narration and plan metadata, and commit every generated file (243u)`