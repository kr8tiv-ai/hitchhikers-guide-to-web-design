---
id: 243p
phase: so-long
slice: Run 11 Temp Confinement and Dashboard Polish
title: Confine build child temp dirs inside the project and polish build-run dashboard and commit slots
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
depends_on: [243o]
files_modified:
  - packages/engine/src/guide/site-build.ts
  - packages/engine/src/guide/site-confine.ts
  - packages/engine/src/spec/site-rules.ts
  - packages/engine/src/spec/design-language.ts
  - packages/app/src/drive-markup.ts
  - packages/engine/test/site-build-043.test.ts
  - packages/app/test/dashboard.test.ts
requirements: [REQ-F-26, REQ-F-40, REQ-N-02]
protected:
  - hh-build-plan/
  - docs/
review_after: false
max_turns: 40
---

<objective>
Close five Run 11 bugs discovered during the live 121-prompt `site-c` build:
- **BUG-101 (S2 — Queue Blocker):** Prompt `003` wrote `src/styles/tokens.css` and committed, then failed post-run `auditOutsideAccess` because PowerShell/Grok CLI wrote a scratch commit-message file to `$env:TEMP` (`C:\Users\lucid\AppData\Local\Temp\site-c-commit-003.txt`). Confine child process temp directories (`TMP`, `TEMP`, `TMPDIR`) inside `<projectDir>/.hitchhiker/tmp`, add OS temp directory deny rules in `homeDenyRules` (using the same `coversProject` guard as `os.homedir()`), and update `SITE_RULES` to instruct keeping any temporary or commit-message files inside `.hitchhiker/tmp` (or using `git commit -m`).
- **BUG-097 (S3):** Render the live `section[data-region="build-run"]` panel (`${tail}`) near the top of `#drive-queue-body` in `queueBodyHtml` (right after `${banner}`, above `<div class="hh-table-wrap">`) so the active prompt status, live log, and files written are visible near the top of `/hh-dashboard` without scrolling past 121 queue rows.
- **BUG-098 (S4):** Filter transient Grok CLI atomic-write temp files (`.grok-write-*.tmp`) out of `filesWritten` in `site-build.ts` and `drive-markup.ts` while preserving normal cross-prompt `filesWritten` accumulation.
- **BUG-099 (S4):** Filter raw base64 chunks (unbroken base64 lines `>= 40` chars from image `Read` output) out of `visibleLines` in `site-build.ts` and `shownLines` in `drive-markup.ts`.
- **BUG-100 (S4):** When `sectionIdOf(prompt)` is empty in `fillSlots` (`packages/engine/src/spec/design-language.ts`), fall back `{{section}}` to a clean lowercase label derived from `prompt.title` (while keeping `{{element}}` as `"the section"`) so non-section prompts get meaningful `<commit>feat(site): ...</commit>` messages instead of `feat(site): the section`.
</objective>

<context>
RULES:
- TypeScript strict, Node >= 22, ESM.
- TDD: add or update unit tests in `packages/engine/test/site-build-043.test.ts` and `packages/app/test/dashboard.test.ts`.
- Never touch protected paths (`hh-build-plan/`, `docs/`).
- No `!` or em-dash (`—`) in user-facing copy or `SITE_RULES`.
- `SITE_RULES` is written into `.hitchhiker/prompts/<id>.md` and scanned by `design-language-239.test.ts` and `ban-scan-239.test.ts`, so `SITE_RULES` must NOT contain `/Users/`, `/home/`, `[A-Za-z]:[\\/]`, `!`, or `—`.
</context>

<read_first>
@packages/engine/src/guide/site-build.ts
@packages/engine/src/guide/site-confine.ts
@packages/engine/src/spec/site-rules.ts
@packages/engine/src/spec/design-language.ts
@packages/app/src/drive-markup.ts
@packages/engine/test/site-build-043.test.ts
@packages/app/test/dashboard.test.ts
</read_first>

<task>
TASK: Close BUG-101, BUG-097, BUG-098, BUG-099, and BUG-100 with root-cause fixes and unit tests.

Steps:
1. **BUG-101 — Temp directory confinement (`packages/engine/src/guide/site-build.ts`, `packages/engine/src/guide/site-confine.ts`, `packages/engine/src/spec/site-rules.ts`):**
   - In `spawnLiveBuild` (`packages/engine/src/guide/site-build.ts`), compute `const tmpDir = path.join(request.cwd, ".hitchhiker", "tmp");`, ensure it exists (`try { mkdirSync(tmpDir, { recursive: true }); } catch { /* ignore */ }`), and pass `{ ...env, TMP: tmpDir, TEMP: tmpDir, TMPDIR: tmpDir }` to `launchProcess` so any child shell/Node/git `$env:TEMP` or `os.tmpdir()` writes stay inside `<projectDir>/.hitchhiker/tmp`.
   - Also in `snapshot` (`packages/engine/src/guide/site-build.ts`), skip `.hitchhiker` as it already does (since `entry === ".hitchhiker"` is already ignored in `walk`), so files inside `.hitchhiker/tmp` will never pollute `filesWritten`.
   - In `homeDenyRules` (`packages/engine/src/guide/site-confine.ts`), in addition to `os.homedir()`, also check `os.tmpdir()` (when `os.tmpdir().trim() !== ""` and its normalized slash path differs from `home`). Apply the exact same `coversProject` guard used for `home`:
     - Always push `Tool(${tmpSlash})` for `CONFINED_TOOLS`.
     - Only when `!coversTmp` (i.e. none of `projects` is inside `tmpSlash`, which is true for real projects on Desktop/Documents and false for `mkdtempSync(os.tmpdir())` unit test projects), also push `Tool(${tmpSlash}/**)` for `CONFINED_TOOLS`.
   - In `SITE_RULES` (`packages/engine/src/spec/site-rules.ts`), update the final workspace confinement sentence (without using `!`, `—`, `/Users/`, `/home/`, or drive letters like `C:\`) to:
     `"The workspace is this folder only: use relative paths, do not read or list the parent folder, sibling projects, or other drives, keep any temporary or commit-message files inside .hitchhiker/tmp or pass git commit -m directly, never write to OS temp folders such as AppData/Local/Temp or /tmp, and if something is missing, say so in the report and keep going."`

2. **BUG-098 — Filter transient `.grok-write-*.tmp` files out of `filesWritten` (`packages/engine/src/guide/site-build.ts`, `packages/app/src/drive-markup.ts`):**
   - Add a helper `isTransientTempFile(relPath: string): boolean` matching `/(^|\/)\.grok-write-[^/]*$/i.test(relPath.replace(/\\/g, "/"))`.
   - Filter out transient `.grok-write-*` files in `snapshot` / `diffSnapshots` / `mergeFiles` in `packages/engine/src/guide/site-build.ts` and when rendering `run.filesWritten` in `runPanel` (`packages/app/src/drive-markup.ts`). Keep cross-prompt `mergeFiles(previous?.filesWritten ?? [], run.filesWritten)` intact so existing `site-build-034.test.ts` assertions continue to pass.

3. **BUG-099 — Filter raw base64 chunks out of `visibleLines` / `shownLines` (`packages/engine/src/guide/site-build.ts`, `packages/app/src/drive-markup.ts`):**
   - In `visibleLines` (`packages/engine/src/guide/site-build.ts`) and `shownLines` (`packages/app/src/drive-markup.ts`), filter out lines whose trimmed text is an unbroken base64 chunk of length `>= 40` (`/^[A-Za-z0-9+/=]{40,}$/.test(trimmed)`).

4. **BUG-097 — Place `section[data-region="build-run"]` near the top of `#drive-queue-body` (`packages/app/src/drive-markup.ts`):**
   - In `queueBodyHtml` (`packages/app/src/drive-markup.ts`), render `${tail}` immediately after `${banner}` and BEFORE `<div class="hh-table-wrap">` (instead of after `</div>`), so `section[data-region="build-run"]` sits at the top of the queue panel above the 121-row table.

5. **BUG-100 — Meaningful `{{section}}` fallback in `fillSlots` (`packages/engine/src/spec/design-language.ts`):**
   - In `fillSlots` (`packages/engine/src/spec/design-language.ts`), keep `const element = section === "" ? "the section" : section;` for `{{element}}`, and compute `const sectionSlot = section !== "" ? section : fallbackSectionSlot(prompt);` for `.replaceAll("{{section}}", sectionSlot)`, where `fallbackSectionSlot(prompt)` returns `prompt.title.trim().replace(/\.+$/, "").toLowerCase() || "the section"`.

6. **Unit tests (`packages/engine/test/site-build-043.test.ts` and `packages/app/test/dashboard.test.ts`):**
   - In `packages/engine/test/site-build-043.test.ts`, add assertions testing:
     - `SITE_RULES` mentions `.hitchhiker/tmp` and `git commit -m`.
     - `buildConfinementArgs("C:/Users/lucid/Desktop/site-c")` includes a `--disallowedTools` rule blocking `os.tmpdir()` `/**` when the project is outside `os.tmpdir()`, while a project inside `os.tmpdir()` is NOT blocked by `/**`.
     - Transient `.grok-write-*.tmp` files and raw base64 lines (`>= 40` chars) are excluded from `build-run.json` (`filesWritten` and `lastLines`).
   - In `packages/app/test/dashboard.test.ts`, add a test verifying that in `queueBodyHtml(items, run)`:
     - `data-region="build-run"` appears before `<table class="hh-table"`.
     - `.grok-write-*.tmp` entries in `run.filesWritten` and raw base64 lines in `run.lastLines` are filtered out of the rendered HTML.
</task>

<must_haves>
truths:
- `spawnLiveBuild` creates `<projectDir>/.hitchhiker/tmp` and sets `TMP`, `TEMP`, and `TMPDIR` to that directory in the spawned child environment.
- `homeDenyRules` denies `os.tmpdir()` `/**` when the project is outside `os.tmpdir()`, and preserves allow-access when the project is inside `os.tmpdir()`.
- `SITE_RULES` instructs keeping temp/commit files in `.hitchhiker/tmp` or using `git commit -m` without breaking `design-language-239.test.ts` or `ban-scan-239.test.ts`.
- `queueBodyHtml` places `${tail}` (`section[data-region="build-run"]`) before `<div class="hh-table-wrap">`.
- `.grok-write-*.tmp` files are filtered out of `filesWritten` and raw base64 lines (`>= 40` chars) are filtered out of `lastLines` / `shownLines`.
- Non-section prompts replace `{{section}}` with the lowercased prompt title instead of `"the section"`.
artifacts:
- packages/engine/src/guide/site-build.ts
- packages/engine/src/guide/site-confine.ts
- packages/engine/src/spec/site-rules.ts
- packages/engine/src/spec/design-language.ts
- packages/app/src/drive-markup.ts
- packages/engine/test/site-build-043.test.ts
- packages/app/test/dashboard.test.ts
prohibitions:
- Do not modify `hh-build-plan/` or `docs/`.
- Do not break cross-prompt `filesWritten` merging in `writeRun` (`site-build-034.test.ts`).
</must_haves>

<verify>
Run `pnpm --filter @hitchhiker/engine test` and `pnpm --filter @hitchhiker/app test` and `pnpm typecheck` and `pnpm lint`.
</verify>

<report_back>
At most 150 words. Name the files changed and the tests that passed.
</report_back>

<commit>
fix(engine,app): confine build child temp dirs and polish build-run dashboard (243p)
</commit>