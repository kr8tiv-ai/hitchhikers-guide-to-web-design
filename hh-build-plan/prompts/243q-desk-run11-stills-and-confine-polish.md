---
id: 243q
phase: so-long
slice: Run 11 Stills Progress, Dot-Folder & Shell Regex Confinement, and Direction Font Persistence
title: Surface section-stills progress and exit cleanly, deny home dot-folders, ignore regex/route strings in shell path audit, filter .playwright-mcp, and preserve picked direction across prepareSiteBuild
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
depends_on: [243p]
files_modified:
  - packages/engine/src/guide/site-build.ts
  - packages/engine/src/guide/site-confine.ts
  - packages/engine/src/spec/site-rules.ts
  - packages/engine/src/brand/directions.ts
  - packages/engine/src/brand/kit-from-interview.ts
  - packages/engine/src/spec/design-outputs.ts
  - packages/app/src/drive-markup.ts
  - packages/app/src/server/section-stills-hook.ts
  - packages/engine/test/site-build-043.test.ts
  - packages/engine/test/desk-run11-243l.test.ts
  - packages/app/test/dashboard.test.ts
  - packages/app/test/section-stills-hook-241c.test.ts
requirements: [REQ-F-26, REQ-F-40, REQ-N-02]
protected:
  - hh-build-plan/
  - docs/
review_after: false
max_turns: 45
---

<objective>
Close five open Run 11 bugs (`BUG-102`, `BUG-103`, `BUG-104`, `BUG-105`, `BUG-106`) discovered during the live 121-prompt `site-c` (`Paradise Found`) build:
- **BUG-102 (S4 - `.playwright-mcp` artifacts in `filesWritten`):** When a build prompt uses the `@playwright/mcp` browser (e.g., Prompt `004`), `.playwright-mcp/console-*.log` and `.playwright-mcp/page-*.yml` inside the project folder are picked up by `snapshot` (`packages/engine/src/guide/site-build.ts`) and rendered in `filesWritten` on `/hh-dashboard` (`packages/app/src/drive-markup.ts`). Skip `.playwright-mcp` in `SKIP_DIRS` and filter `(^|\/)\.playwright-mcp(\/|$)` in `isTransientTempFile`.
- **BUG-103 (S3 - Non-blocking outside-read warning on user-home dot-folders like `.agents`, `.claude`, `.cursor`):** When `coversProject` is true for `os.homedir()` (because the project lives under `C:/Users/<user>/Desktop/...`), `homeDenyRules` (`packages/engine/src/guide/site-confine.ts`) only denies `Tool(C:/Users/<user>)` without `/**`, leaving `C:/Users/<user>/.agents/**`, `.claude/**`, and `.cursor/**` uncovered by `--deny`. Add `${tool}(${homeSlash}/${dotDir}/**)` deny rules for `[".agents", ".claude", ".cursor"]` when the project is outside those dot-folders, and instruct `SITE_RULES` not to read user-home dot-folders.
- **BUG-104 (S3 - No UI status indicator on `/hh-dashboard` while `maybeRunSectionStills` runs, and Windows child process tree hold in `section-stills-hook.ts` and `site-build.ts`):** Stamp `build-run.json` (`writeRun` / `readRunFile`) with `"Generating section concept stills before the next build step."` while `maybeRunSectionStills` executes `runner(projectDir)`, and in `spawnGrok` (`packages/app/src/server/section-stills-hook.ts`) and `spawnLiveBuild` (`packages/engine/src/guide/site-build.ts`) kill the Windows process tree (`taskkill /pid <pid> /T /F`) when stopping or after `"exit"` grace so MCP or `pnpm dev` child processes spawned by `grok.exe` cannot hold stdio pipes open.
- **BUG-105 (S4 - Picked direction and resolved font families overwritten when `prepareSiteBuild` runs and omitted from `.hitchhiker/assets/slots.json`):** In `writeBrandKit` (`packages/engine/src/brand/kit-from-interview.ts`), preserve an existing `readDirectionDeal(projectDir)` instead of overwriting `.hitchhiker/directions.json` with `pickedId: null`, and re-apply `applyPickedDirection` when `deal.pickedId !== null`. In `writeDesignMd` (`packages/engine/src/spec/design-outputs.ts`), default omitted `fonts` from the picked direction on disk and always call `syncResolvedFamilies(projectDir, chosen.display, chosen.body, rhythm.fontWeight)`. In `applyPickedDirection` and `syncResolvedFamilies` (`packages/engine/src/brand/directions.ts`), also rewrite `.hitchhiker/assets/slots.json` (`slots[].prompt`) with `rewriteStyleText` so concept still prompts carry the resolved `Families: ...` sentence.
- **BUG-106 (S2 - False-positive `auditOutsideAccess` failure on Prompt `027` when `run_terminal_command` runs `node -e` with regex literals `/.../g`, `/investment/i.test(html)`, route strings `"/farms"`, and JS arrow functions `m => m[1]`):** In `packages/engine/src/guide/site-confine.ts`, `shellPaths(command)` runs `quoted` and `posix` regexes across raw `run_terminal_command` strings without stripping escaped quotes (`\"`), matching `/g)].map(m => m[1]); const sections = [...html.matchAll(/data-section=\`, `/farms\`, and `/investment/i.test(html))` as POSIX root paths, and `shellWrites(command, filePath)` treats `>` inside JS arrow functions (`=>`) as shell output redirection `>`. Fix `shellPaths` and `shellWrites` so escaped quotes, JS regex literals, URL route strings, CLI switches, and JS arrow functions (`=>`) are never misclassified as outside filesystem reads or writes.
</objective>

<context>
RULES:
- TypeScript strict, Node >= 22, ESM.
- TDD: add or update unit tests in `packages/engine/test/site-build-043.test.ts`, `packages/engine/test/desk-run11-243l.test.ts`, `packages/app/test/dashboard.test.ts`, and `packages/app/test/section-stills-hook-241c.test.ts`.
- Never touch protected paths (`hh-build-plan/`, `docs/`).
- No `!` or em-dash in user-facing copy or `SITE_RULES`.
- `SITE_RULES` is written into `.hitchhiker/prompts/<id>.md` and scanned by `design-language-239.test.ts` and `ban-scan-239.test.ts`, so `SITE_RULES` must NOT contain `/Users/`, `/home/`, `[A-Za-z]:[\\/]`, `!`, or em-dashes.
</context>

<read_first>
@packages/engine/src/guide/site-build.ts
@packages/engine/src/guide/site-confine.ts
@packages/engine/src/spec/site-rules.ts
@packages/engine/src/brand/directions.ts
@packages/engine/src/brand/kit-from-interview.ts
@packages/engine/src/spec/design-outputs.ts
@packages/app/src/drive-markup.ts
@packages/app/src/server/section-stills-hook.ts
@packages/engine/test/site-build-043.test.ts
@packages/engine/test/desk-run11-243l.test.ts
@packages/app/test/dashboard.test.ts
@packages/app/test/section-stills-hook-241c.test.ts
</read_first>

<task>
TASK: Close BUG-102, BUG-103, BUG-104, BUG-105, and BUG-106 with root-cause fixes and unit tests.

Steps:
1. **BUG-102 - Filter `.playwright-mcp` artifacts out of `filesWritten` (`packages/engine/src/guide/site-build.ts`, `packages/app/src/drive-markup.ts`):**
   - In `packages/engine/src/guide/site-build.ts`, add `".playwright-mcp"` to `SKIP_DIRS` so `snapshot` never walks `.playwright-mcp/`.
   - In `isTransientTempFile` in both `packages/engine/src/guide/site-build.ts` and `packages/app/src/drive-markup.ts`, also return `true` when `/(^|\/)\.playwright-mcp(\/|$)/i.test(normalized)` matches so any `.playwright-mcp/*` entries already recorded in `build-run.json` are filtered out on merge and render.

2. **BUG-103 - Deny user-home skill/config dot-folders when project is under `os.homedir()` (`packages/engine/src/guide/site-confine.ts`, `packages/engine/src/spec/site-rules.ts`):**
   - In `denyRootTree` (`packages/engine/src/guide/site-confine.ts`), when `coversProject` is `true` for a root (such as `os.homedir()`), iterate over `const HOME_DOT_DIRS = [".agents", ".claude", ".cursor"] as const;`. For each `dotDir`, form `const dotSlash = `${rootSlash}/${dotDir}`;` and if no project in `projects` is inside `dotSlash`, push `${tool}(${dotSlash}/**)` for every `tool` in `TOOLS`.
   - In `SITE_RULES` (`packages/engine/src/spec/site-rules.ts`), include dot-folder guidance in the final workspace sentence (without `/Users/`, `/home/`, drive letters, `!`, or em-dashes):
     `"The workspace is this folder only: use relative paths, do not read or list the parent folder, sibling projects, dot-folders such as .agents or .claude, or other drives, keep any temporary or commit-message files inside .hitchhiker/tmp or pass git commit -m directly, never write to OS temp folders such as AppData/Local/Temp or /tmp, and if something is missing, say so in the report and keep going."`

3. **BUG-106 - Ignore regex literals, route strings, escaped quotes, and JS arrow functions in `shellPaths` and `shellWrites` (`packages/engine/src/guide/site-confine.ts`):**
   - In `shellPaths(command)` (`packages/engine/src/guide/site-confine.ts`):
     - First replace escaped quotes `\\["']` with spaces (`const cleaned = command.replace(/\\["']/g, " ");`) before running path extraction regexes so `\"...\"` inside `node -e "..."` never bridges across quotes.
     - For any candidate starting with `/` (and not `~/`):
       - Reject candidates containing regex/code characters `[()[\]{}*?+^$\\;:]`.
       - Reject candidates that look like regex literals with flags or method calls (`/^\/[^/]+\/[dgimsuvy]*(?:\.[A-Za-z_$][\w$]*)*$/`).
       - Require the first segment after `/` to be a real POSIX/MSYS filesystem root (`/^\/(?:tmp|var|Users|home|etc|usr|opt|mnt|private|Volumes|root|workspace|srv|run|dev|proc|sys|bin|sbin|lib|lib64|boot|media|work|projects|app|data|c|d|e)(?:\/|$)/i`) so single-segment web routes like `"/farms"` or `"/visit"` and regex literals like `/investment/i` or `/data-section/g` are never treated as root filesystem paths.
     - For any candidate (drive, relative, `~/`, or `/`), also reject candidates containing `[()[\]{}*?+^$;]`.
   - In `shellWrites(command, filePath)` (`packages/engine/src/guide/site-confine.ts`):
     - Strip JS arrow functions `=>` (and `>=`, `->`, `2>&1`) before checking for shell redirection (`const noArrows = command.replace(/=>|->|>=|[0-9]*>&[0-9]*/g, "  ");`) so `m => m[1]` is never mistaken for shell output redirection `>`.

4. **BUG-104 - Stamp `build-run.json` during `maybeRunSectionStills` and kill Windows child process trees (`packages/engine/src/guide/site-build.ts`, `packages/app/src/server/section-stills-hook.ts`):**
   - In `maybeRunSectionStills` (`packages/engine/src/guide/site-build.ts`), before awaiting `runner(projectDir)`, read `const currentRun = readRunFile(projectDir);`. If `currentRun !== null`, call `writeRun(projectDir, { ...currentRun, reason: "Generating section concept stills before the next build step." });` and in a `finally` block restore `writeRun(projectDir, currentRun);` (if `readRunFile(projectDir)?.promptId === currentRun.promptId`).
   - In `spawnLiveBuild` (`packages/engine/src/guide/site-build.ts`), in `stop: () => { ... }`, when `(launch.platform ?? process.platform) === "win32" && child.pid !== undefined`, also invoke `spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true })` (wrapped in `try/catch`) before `child.kill()` so stopping a prompt child after stream `"end"` (`BUILD_EXIT_GRACE_MS`) also terminates any orphaned `pnpm dev` grandchildren holding stdio pipes.
   - In `spawnGrok` (`packages/app/src/server/section-stills-hook.ts`), settle when `child` emits `"close"`, OR when `child` emits `"exit"` followed by a short 500ms stdio drain timer (so grandchildren inheriting stdio pipes cannot hold `spawnGrok` open for 120s). When killing on timeout or after `"exit"` grace, terminate the process tree on Windows (`spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true })` in addition to `child.kill("SIGKILL")`).

5. **BUG-105 - Preserve picked direction across `writeBrandKit` / `writeDesignMd` and sync `.hitchhiker/assets/slots.json` (`packages/engine/src/brand/kit-from-interview.ts`, `packages/engine/src/spec/design-outputs.ts`, `packages/engine/src/brand/directions.ts`):**
   - In `writeBrandKit` (`packages/engine/src/brand/kit-from-interview.ts`), check `const existing = readDirectionDeal(projectDir);` first and use `const deal = existing !== null && existing.directions.length > 0 ? existing : dealDirections(designLibraryRoot(), projectDir);`. After writing `BRAND.md`, `brand.ts`, and `saveDirectionDeal(projectDir, deal)`, if `deal.pickedId !== null`, call `applyPickedDirection(projectDir, deal)` so a previously picked direction is never clobbered when `prepareSiteBuild` or `writePromptFiles` runs.
   - In `writeDesignMd` (`packages/engine/src/spec/design-outputs.ts`), if `fonts` is `undefined`, look up the picked direction via `readDirectionDeal(projectDir)` (`pickedFontsFromDeal(projectDir)`). Pass `effectiveFonts` to `renderDesignMd` and `fontChoice(brief, answers, effectiveFonts)`. Always call `syncResolvedFamilies(projectDir, chosen.display, chosen.body, rhythm.fontWeight)` after writing `DESIGN.md` so `BRAND.md`, `src/data/brand.ts`, `.hitchhiker/prompts/*.md`, and `.hitchhiker/assets/slots.json` stay synchronized with `DESIGN.md`.
   - In `applyPickedDirection` and `syncResolvedFamilies` (`packages/engine/src/brand/directions.ts`), call `rewriteSlotStyles(projectDir, families, wins)` which reads `.hitchhiker/assets/slots.json` if present, rewrites each `slot.prompt` string with `rewriteStyleText(slot.prompt, families, wins)`, and writes `.hitchhiker/assets/slots.json` back when changed.

6. **Unit tests:**
   - Update `packages/engine/test/site-build-043.test.ts` to verify:
     - `.playwright-mcp` filtering (`BUG-102`),
     - `.agents`/`.claude`/`.cursor` `--deny` rules when the project is under `os.homedir()` (`BUG-103`),
     - `build-run.json` reason stamping during `maybeRunSectionStills` (`BUG-104`),
     - `auditOutsideAccess` does NOT flag `run_terminal_command` running `node --input-type=module -e` with regex literals (`/data-component=\"([^\"]+)\"/g`, `/data-section=\"([^\"]+)\"/g`, `/href=\"(\/farms[^\"]*)\"/g`, `/investment/i.test(html)`), route strings (`data-path=\"/farms\"`), and arrow functions (`m => m[1]`) (`BUG-106`).
   - Update `packages/engine/test/desk-run11-243l.test.ts` to verify that picking a direction, running `writeSectionStillPlan` + `writeBrandKit` + `writeDesignMd(dir, brief, answers)` (as `prepareSiteBuild` does) preserves `pickedId` in `.hitchhiker/directions.json`, keeps the resolved families in `DESIGN.md`, `BRAND.md`, and `src/data/brand.ts`, and updates `.hitchhiker/assets/slots.json` prompts with the resolved `Families: ...` sentence (`BUG-105`).
   - Update `packages/app/test/dashboard.test.ts` to verify `.playwright-mcp/*` entries are filtered out of `queueBodyHtml` (`BUG-102`).
   - Update `packages/app/test/section-stills-hook-241c.test.ts` to verify `generateSectionStills` still passes all hook tests cleanly (`BUG-104`).
</task>

<must_haves>
truths:
- `.playwright-mcp` directory and `.playwright-mcp/*` paths are excluded from `snapshot`, `filesWritten`, and `/hh-dashboard` rendering.
- `buildConfinementArgs` denies `~/.agents/**`, `~/.claude/**`, and `~/.cursor/**` even when the project is inside `os.homedir()`.
- `auditOutsideAccess` ignores JavaScript regex literals (`/data-section=.../g`, `/investment/i.test(html)`), escaped quotes (`\"`), URL route strings (`"/farms"`), and arrow functions (`=>`) inside `run_terminal_command`.
- `maybeRunSectionStills` stamps a visible `reason` in `build-run.json` while generating stills and restores it afterward, and `spawnGrok` / `spawnLiveBuild` do not hang on open grandchild stdio pipes.
- `writeBrandKit` and `writeDesignMd` preserve a picked direction from `.hitchhiker/directions.json`, and `syncResolvedFamilies` / `applyPickedDirection` update `.hitchhiker/assets/slots.json` (`slots[].prompt`) with the resolved `Families: ...` sentence.
artifacts:
- packages/engine/src/guide/site-build.ts
- packages/engine/src/guide/site-confine.ts
- packages/engine/src/spec/site-rules.ts
- packages/engine/src/brand/directions.ts
- packages/engine/src/brand/kit-from-interview.ts
- packages/engine/src/spec/design-outputs.ts
- packages/app/src/drive-markup.ts
- packages/app/src/server/section-stills-hook.ts
prohibitions:
- Do not modify `hh-build-plan/` or `docs/`.
- Do not break `design-language-239.test.ts` or `ban-scan-239.test.ts`.
</must_haves>

<verify>
Run `pnpm --filter @hitchhiker/engine test` and `pnpm --filter @hitchhiker/app test` and `pnpm typecheck` and `pnpm lint`.
</verify>

<report_back>
At most 150 words. Name the files changed and the tests that passed.
</report_back>

<commit>
fix(engine,app): polish stills progress, confine regex/dot-folders, and sync direction fonts (243q)
</commit>
