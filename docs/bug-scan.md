# Bug scan

Prompt 177. The scan ran on Windows. CLI commands used a temporary directory and a temporary `HOME` / `USERPROFILE`. No live model call. `hh improve` ran only with `--dry-run`.

## Inventory

Taken from the code, not from memory.

### CLI commands

`IMPLEMENTED_COMMANDS` in `packages/cli/src/commands-table.ts`, which is the `dispatchImplemented` switch in `packages/cli/src/main.ts`:

- `hh install`
- `hh app`
- `hh assets`
- `hh tools`
- `hh mostly-harmless`
- `hh elevate`
- `hh progress`
- `hh pause`
- `hh resume`
- `hh doctor`
- `hh improve`

Bare `hh` is rewritten to `hh app` by `cliEntryArgs` before dispatch. `hh --help` and `hh -h` print `hh doctor [--project <dir>]` and exit 2.

`hh settings`, `hh brand`, `hh approve`, `hh drive`, and `hh interview` are not subcommands. Settings, brand, approve, and drive are desk routes. Interview is the desk interview engine (`openInterview`). Skill-only slash commands come from `skillOnlySlashCommands()` (a user-invocable skill whose body says it is not implemented):

- `/hh-new`
- `/hh-dont-panic`
- `/hh-import`
- `/hh-babel-fish`
- `/hh-logo`
- `/hh-deep-thought`
- `/hh-drive`
- `/hh-review`
- `/hh-fix`
- `/hh-so-long`
- `/hh-undo`
- `/hh-budget`
- `/hh-settings`
- `/hh-help`

### Desk screens

`listAppRoutes()` in `packages/app/src/polish.ts`:

| Path | States walked |
| --- | --- |
| `/` | question |
| `/gallery` | walk, empty |
| `/motion` | preview |
| `/brand` | empty, kit (`brand-kit.json` on the live route) |
| `/approve` | empty (live `GET /approve`). The gate document is `renderApproval` in `packages/app/src/approval.ts`. `GET /approve` does not serve that document, so the scan fulfilled it the way `polish.spec.ts` does. |
| `/hh-dashboard` | empty, queue, error |
| `/before-jump` | open, clear. Separate server: `startBeforeJumpServer` in `packages/app/src/before-jump/cards.ts`. |
| `/missing` | error. There is no `/missing` route. Unknown paths render the missing plate with HTTP 404. The scan opened `/missing`. |

Also walked, from `handleGet` in `packages/app/src/server/routes.ts` and not listed by `listAppRoutes()`:

| Path | State |
| --- | --- |
| `/settings` | default plate |

Widths: 375 and 1440. Axe impact counted: serious and critical. Gallery links to `example.com` were not fetched.

### Hooks

`.git/hooks` contains only `*.sample` files. No `.husky`, no `.githooks`, no `lefthook.yml`. Package scripts are `test` (and app `e2e`, `write-html`). A scratch commit in a temporary repo with `core.hooksPath` pointed at this repo's `.git/hooks` exited 0 and printed no hook output.

### Paths

`packages/cli`, `packages/engine`, and `packages/app` source use `node:path` and `node:os`. No `process.env.HOME`, no `/tmp`, and no `~/`. `homeIndexPath` and the gallery cache use `os.homedir()`. Temporary directories use `os.tmpdir()`. `.gitattributes` sets `* text=auto eol=lf` and CRLF for `cmd`, `bat`, and `ps1`.

`upsertHomeProject` keys the home index by the exact project path string. That is the contract in `packages/engine/src/home-index.ts`. It was not changed. On Windows, two spellings of the same folder that differ only by case are still one directory; the index keeps the string the caller passed.

`hh doctor` and `hh install` were run against a directory named `Night stall café`. The brand write-back test uses that same directory name.

## CLI sweep

Temporary home. API key variables were removed from the child environment. Exit codes:

| Command | Result |
| --- | --- |
| `settings`, `brand`, `approve`, `drive`, `interview`, `nope` | Exit 2. Stdout empty. Stderr is the command table. No stack trace. No doctor report. |
| `doctor`, `doctor --project` (café path) | Exit 0. Node, git, and grok reported. No login. |
| `doctor --nope`, `doctor --project` (no value) | Exit 2. Help line. No stack. |
| `install` (no project), `install --bogus` | Exit 2. Usage. |
| `install --project` (café path) | Exit 0. `Copied 30 files.` |
| `app --help` | Exit 0. Usage. |
| `app --bogus`, `app --project` (no value) | Exit 1. Usage on stdout. No stack. Exit 1 is the existing app parser contract. |
| `app --no-open --port 0 --project` (temp) | Exit held the process after printing `http://127.0.0.1:<port>/`. Killed. It does not daemonize. |
| `assets` with no command, `--bogus`, `plan` without `--project` | Exit 2. Usage. |
| `assets plan` and `assets run` on an empty project, no `--yes` | Exit 1. Nothing spent. |
| `tools` with no command, `--nope`, `search` without `--feature` | Exit 2. Search did not call the registry or a model. |
| `mostly-harmless` without `--project`, and with `--yes` | Exit 2. `--yes` is rejected. |
| `mostly-harmless --project` (temp) | Exit 1. Blocked report. No model. |
| `elevate` without `--project`, `--bogus` | Exit 2. |
| `elevate --project` | Exit 2. `Elevate does not run without --yes.` |
| `elevate --yes --project` | Exit 0. `No planned items.` `Nothing was written.` |
| `progress`, `pause`, `resume` on a project with no state, and missing flags | Exit 1. Usage or `No project state yet.` No stack. |
| `improve`, `improve --bogus`, `improve --dry-run` with no program | Exit 2. Refusal. No grok process. |
| `improve --dry-run --program improve/program.md` | Exit 0. Plan printed. HEAD was not moved. |

`hh interview` is the unknown-command row above. The cassette interview is `packages/engine/test/guide-live.test.ts` (`ten Towel and Tea turns push twice, suggest four cards, and approve the brief`) and `packages/app/e2e/live-guide.spec.ts`. Both use `packages/engine/test/cassettes/guide/turns.json`. No paid call.

## Findings

| id | area | steps | expected | actual | severity | status | commit or reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BS-001 | engine write-back | `BRAND.md` saved with CRLF. Answer a logo line with logo approval off. | One `## Logo` section. Purpose kept. File rewritten as LF. | The heading regex required `\n`, so write-back appended a second Logo section. | high | fixed | `packages/engine/test/before-jump-hook.test.ts` (`writeBack replaces a brand section when BRAND.md uses CRLF`). `unixNewlines` in `upsertSection`. Commit message below. |
| BS-002 | engine write-back | `DEPLOY.md` saved with CRLF. Write the email field. | Host, domain, and DNS kept. | `readDeploy` left `\r` on each line, failed the field regex, and rewrote the file as `deployTarget: undecided` with domain and DNS blank. | high | fixed | Same test file (`writeBack keeps deploy fields when DEPLOY.md uses CRLF`). `unixNewlines` in `readDeploy`. |
| BS-003 | before-jump | Approved `BRAND.md` with a blank line under `## Purpose`, LF or CRLF. Answer a legal card. | The contradiction payload includes `Keep purpose.` | `sectionExcerpts` used `[\s\S]*?(?=^## \|$)` with the `m` flag. `$` matched the blank line, so the excerpt was always empty. | high | fixed | Same test file (`a CRLF brand file still supplies section excerpts`). Line split in `sectionExcerpts`. `readBrand` still strips CR. |
| BS-004 | desk dashboard | Open `/hh-dashboard` with a review row whose id contains `002`. Follow the verdict link. | The review path is visible. The desk does not 404. | The markup linked `reviews/002-REVIEW.md`. The browser resolved that onto the desk, which returned 404. The desk does not serve project review files. | medium | fixed | `packages/app/test/dashboard.test.ts` (`a numbered review names its file and does not link the desk at it`). `verdictsHtml` prints the path as text. `packages/app/e2e/bug-scan.spec.ts` walks the queue and checks same-origin links. |

Already covered, no product change:

- Unknown commands exit 2 with the command table and no stack: `packages/cli/test/unknown-command.test.ts`. This scan added `settings`, `brand`, `approve`, and `interview` to the manual run. The assertion was already true.
- `STATE.md`, `interview/tree.yaml`, `improve/program.md`, and skill frontmatter already normalize CRLF.
- `renderTemplate` already strips `\r\n` before scaffold fills a template.
- Elevate still refuses to apply without `--yes`.

Not fixed:

| id | area | reason |
| --- | --- | --- |
| BS-005 | root scripts | `pnpm lint` and `pnpm typecheck` are not scripts. `docs/ci.md` says the local commands are `pnpm -r run --if-present lint` and `pnpm exec tsc -b`. The prompt's verification list disagrees with that doc. No root scripts were added. No package defines `lint`, so the documented lint command is a no-op. |

Desk result after the fixes: `packages/app/e2e/bug-scan.spec.ts` passed. At 375 and 1440 the walked screens had no page errors, no unexpected console errors, no failed requests, no broken same-origin links, no positive tabindex, focus moved forward with a solid outline, and axe reported no serious or critical violations. The dashboard error document (HTTP 500) and the missing page (HTTP 404) are the intentional states and were not counted as failed asset requests.

Commit: `fix(app): deep bug scan fixes and docs/bug-scan.md findings`
