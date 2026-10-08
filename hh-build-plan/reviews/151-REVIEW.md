# 151 Review — prompts 148, 149, 150

Verdict: **PASS**

Reviewed: 2026-10-08. Fresh session. No fix commits. No new feature. Prompt 152 is not started.

Each must-have truth below has a test name and a file line. The CLI, plugin, and engine test commands exited 0. This checkpoint does not close So Long and Thanks for All the Fish (`phase_end: false`).

## History

Three build commits sit on `e606219` (review 147), in order, one per prompt. The messages match the commit lines. They are not a squash. History was not rewritten. At review start `main` was ahead of `origin/main` by these three commits, so they were not published. This session does not push.

| Order | Commit | Parent | Message | Role |
| --- | --- | --- | --- | --- |
| 1 | `90db41b` | `e606219` | `feat(cli): install Guide skills into .grok` | prompt 148, matches the commit line |
| 2 | `7e87870` | `90db41b` | `feat(plugin): the full /hh command set as Grok Build skills` | prompt 149, matches the commit line |
| 3 | `6169628` | `7e87870` | `docs: add the Guide README` | prompt 150, matches the commit line |

HEAD at review start was `6169628`. The working tree was clean. `.hitchhiker-dev/summaries` is absent, so the commit bodies are the summaries. No package was added. `@theatre/studio` is absent. No TypeScript `any` in `install.ts` or `commands.ts`.

## File lists

From `e606219` to `6169628` the diff is the three prompts, plus two files prompt 148's file list omitted and its own text required:

- 148 listed: `packages/cli/package.json`, `packages/cli/src/install.ts`, `packages/cli/test/install.test.ts`
- 148 also changed `packages/cli/src/main.ts` (step 7: wire `hh install`) and added `packages/grok-plugin/.grok-plugin/plugin.json` (context: a manifest so `grok plugin install` can validate). Commit `90db41b` names both. They are the wiring the prompt asked for, not a new feature.
- 149: the 22 `skills/hh-*/SKILL.md` files, five `agents/*.md`, `hooks/hh-deny.json`, `rules/hh-rules.md`, `src/commands.ts`, `test/commands.test.ts`, `package.json` (the test script replaces `process.exit(0)`)
- 150: `README.md`, `docs/dont-panic.md`, `packages/engine/test/readme.test.ts`

Nothing else. Nothing was reverted.

## 148 Package the CLI so npx and hh install work

### Truths

- Install is a local copy. `installSkills` reads files under `sourceDir` and writes them under `projectDir/.grok` (`packages/cli/src/install.ts` lines 203–298). The module imports `node:fs/promises` and `node:path` only. The comment at lines 198–201 states the copy does not publish and does not contact the network. Test `installSkills copies markdown into hh- skill folders and keeps the relative path` (`packages/cli/test/install.test.ts` line 38) requires six files under `.grok/skills/hh-*`, `.grok/agents/hh-guide.md`, `.grok/hooks/hh-deny.json`, and `.grok/rules/hh-voice.md`, and requires `skip.txt` to stay out. Test `a skill that resolves outside the source directory is not copied` (line 67) links a folder outside the source and requires `copied === 1` and no `SECRET`. Test `a destination that realpaths outside the project throws and writes nothing` (line 90) requires the refusal and an empty outside tree. Test `a second install overwrites the hh- folder and leaves a sibling skill alone` (line 114) requires `other-skill.txt` unchanged and `stale.md` removed. Test `a missing source throws and an empty source copies nothing` (line 138) requires the kept skill and the sibling after `copied === 0`. Test `install does not call fetch and the package is publishable as hh` (line 192) requires `install.ts` to contain no `fetch(` and no `npm publish`. Test `the install parser requires --project and hh install copies the Guide skill` (line 160) runs `runInstall` against `packages/grok-plugin`, requires `hh-guide-persona/SKILL.md` to contain `You are the Guide`, and requires `other-skill.txt` to survive.

- The bin name is hh. `packages/cli/package.json` lines 14–16 set `"bin": { "hh": "./src/main.ts" }`. The same test (install.test.ts line 192) requires `name` `hitchhikers-guide`, `private` false, `bin.hh` `./src/main.ts`, a repository URL containing `kr8tiv-ai/hitchhikers-guide-to-web-design`, and `files` containing `src` or `dist`. `cliEntryArgs([])` is `["app"]` (`packages/cli/src/main.ts` lines 363–366), and `runCli` sends `install` to `runInstall` (line 373).

### Key link

`hh install` copies `packages/grok-plugin`. `pluginSourceDir()` resolves `../../grok-plugin` from the CLI source (`install.ts` lines 23–25). `runInstall` uses that default (`install.ts` lines 338–340). The parser test above copies the real Guide persona skill into the temp project.

### Also checked

`parseInstallArgs(["--publish"])` throws (`install.test.ts` line 164). A missing `--project` exits 2 and the usage line has no `!` (lines 166–169). Names that already start with `hh-` are not doubled (test line 38, `hhName` at `install.ts` lines 52–57). The manifest is `{ "name": "hitchhikers-guide" }` (`packages/grok-plugin/.grok-plugin/plugin.json`). Test `the plugin manifest names hitchhikers-guide` (install.test.ts line 218) requires that name and, because `grok` is on PATH, `grok plugin validate` exiting 0. `files` was the only `package.json` change in `90db41b`. The publish name, `private: false`, and bin `hh` were already set by prompt 001.

## 149 Grok Build plugin command set

### Truths

- Every Guide command is reachable as a Grok Build skill. `SKILL_NAMES` lists the 22 slash commands from v2 §18 (`packages/grok-plugin/src/commands.ts` lines 28–51). Each has `packages/grok-plugin/skills/<name>/SKILL.md` with `user-invocable: true`. Test `skill directories are the 22 commands plus the guide persona` (`packages/grok-plugin/test/commands.test.ts` line 189) requires those directory names and the pre-existing `guide-persona`. Test `every skill has valid frontmatter and the four side effects are model-disabled` (line 199) requires `validateSkill` to return no errors and `user-invocable` to be the literal `true`. Test `grok inspect lists the installed skills` (line 431) installs into a trusted temp project with `hh install` and requires `grok inspect --json` to list every `SKILL_NAMES` entry with `userInvocable: true`. That test passed in this session. It did not skip.

- Side-effecting commands only run when the user invokes them. `SIDE_EFFECT_SKILLS` is `hh-drive`, `hh-so-long`, `hh-assets`, `hh-undo` (`commands.ts` lines 54–59). `validateSkill` requires `disable-model-invocation: true` and the sentence `Run this only when the user typed the slash command.` for those four, and rejects that flag on the others (lines 179–186). The four skill files set the flag. `hh-drive` is the pattern (`packages/grok-plugin/skills/hh-drive/SKILL.md` lines 1–8). The same frontmatter test asserts the flag matches `SIDE_EFFECT_SKILLS` and nothing else. Grok's skill field `disable-model-invocation` means slash command only. Test `validateSkill rejects broken frontmatter` (commands.test.ts line 259) removes the flag from `hh-undo` and requires the error `disable-model-invocation must be true`.

- The deny list is enforced by a hook as well as the orchestrator. `evaluateCommand` in `packages/orchestrator/src/policy.ts` lines 21–40 denies git push, `git remote add`, `gh repo create`, deploy commands, a filesystem-root delete, and a project-root delete before a process starts. `DENY_PHRASES` is lines 67–74. `matchDelete` is lines 422–433. `packages/grok-plugin/hooks/hh-deny.json` is a `PreToolUse` command hook whose matcher is `Bash|Read|run_terminal_command|read_file`. The script prints `{ "decision": "deny", "reason": "..." }`. Test `the deny hook blocks push, deploy, root deletes, and credential reads` (commands.test.ts line 301) spawns that script and requires deny for `git push`, `git push origin main`, `bash -lc "git push"`, `git remote add`, `gh repo create`, `vercel --prod`, `npx wrangler deploy`, `hostinger deploy`, `rm -rf /`, `rm -rf .`, a path outside the project, `rm -rf C:\` on Windows, and `cat .env.local`. It requires allow for `git commit -m "do not push"`, `git status`, `netlify dev`, and an in-project delete. Read of `.env`, `keys/site.pem`, `.hitchhiker/config.json`, and `id_ed25519` is deny. Test `hh install copies skills, agents, the deny hook, and the rules` (line 394) requires the copied hook bytes to match the source file.

### Key links

`COMMANDS` mirrors the CLI. `cliSubcommandsFromSource` reads `===` / `!==` checks in `packages/cli/src/main.ts` (`commands.ts` lines 61 and 94–100). Test `COMMANDS matches the hh CLI subcommands` (commands.test.ts line 241) requires the parsed names to equal `COMMANDS`, with one row each. The ten rows are `install`, `app`, `assets`, `tools`, `mostly-harmless`, `elevate`, `progress`, `pause`, `resume`, and `doctor` (`commands.ts` lines 14–25). `assets` is the only CLI row with `sideEffect: true`. `install` and `tools` have an empty `skillDir` because v2 §18 does not give them a slash name.

`hh install` copies the plugin. The install test above checks `hh-new`, `hh-guide-persona`, `agents/hh-guide.md`, `hooks/hh-deny.json`, and `rules/hh-rules.md`, and requires no doubled `hh-hh-new`.

### Also checked

Fourteen skills have no CLI subcommand yet. Prompt 149's edge case says to say so and point at `/hh-help`. `validateSkill` requires the sentence `This command is not implemented in the hh CLI yet. Use /hh-help.` for those names (`commands.ts` lines 82 and 202–204). `hh-assets` is implemented and its body names `hh assets plan`, `run`, `diy`, and `import`, with `--yes` only after the user says yes (`skills/hh-assets/SKILL.md`). Every skill body includes `Never push.`, `Never deploy.`, and `Never spend without the user's yes.`

Agents are `guide.md`, `deep-thought.md`, `zaphod.md`, `marvin.md`, and `eddie.md`. Test `agents name a role, the tools they may use, and the handoff` (commands.test.ts line 285) requires frontmatter keys `name`, `description`, and `tools`, plus the headings `Role`, `Tools allowed`, and `Handoff`, and the never-push sentence. `tools` is a documented agent field in the installed Grok 1.0.46 subagent guide. The vendored `features_subagents.md` excerpt does not list it. Commit `7e87870` records that.

`rules/hh-rules.md` is the Q2 rule set: voice input with a text reply, local speech recognition as the default, Grok Voice only after the user accepts the rate, no novel quotes, the banned-word list, the four slash commands only when the user types them, and no push, deploy, or spend without a yes.

The hook's `env` field is absent from the short copy in `context/sources/xai/features_hooks.md`. The installed guide (`~/.grok/docs/user-guide/10-hooks.md`, "Hooks in Config Files") lists handler fields `type`, `command`, `url`, `timeout`, and `env`. The implementation follows that guide. The script is inside the JSON because the installer copies `.json` from `hooks/` and the package is `"type": "module"`. The script is 15,950 characters. The test runs it through `node -e` with `HH_DENY_HOOK` set, which is the same command string the hook file declares.

Package-licence denies stay on `evaluateCommand`'s `matchPackage` path. Prompt 149's parenthetical for the hook is git push, deploy commands, deletes outside the project, and credential reads. The hook covers those. `policy.ts` denies a filesystem root and the project root. It does not deny an outside-project delete or a credential read. Those two are the hook's additions from this prompt. Widening `policy.ts` is outside these prompts' file lists, so this review leaves it.

## 150 Write the README in the Guide's voice

### Truths

- The public introduction matches the locked decisions. `README.md` says the Guide is a local spec-driven app (line 3), names the six phases (lines 21–28), and says what it is not: hosted builder, drag-and-drop editor, template store, paid SaaS (line 19). Imagine, 3D generation, and the X API bill the caller's own key after a budget answer and a yes (line 19). That sentence does not say SuperGrok pays Imagine. The Motion section (line 65) names GSAP with ScrollTrigger and SplitText as the base, Three.js, raw WebGL and GLSL via OGL or WebGL2, Motion, anime.js, Theatre.js core (`@theatre/core` only), Lenis, CSS scroll-driven animations, and vanilla JS, and says the picker chooses per effect. Generated sites import only what they use. That matches D-001 and D-008. The word `fallback` is absent. Develop (line 69) names Node 22, pnpm, and `pnpm -w test`, and says the root script is not wired. Credits (line 73) name Matt Haynes's AntiHero guides at antihero.community and open-gsd/gsd-core, say `vendor/gsd-core` is templates and not a runtime dependency, and point at NOTICE. License (line 77) is MIT. The repository link is `https://github.com/kr8tiv-ai/hitchhikers-guide-to-web-design`. Test `assertReadme reads README.md from disk` (`packages/engine/test/readme.test.ts` line 101) reads `README.md` from the repo root and requires those phrases, a word count under 900, no email, no `fallback`, no `imagine is free`, no `free with supergrok`, every `COMMANDS` cli name as `hh <name>`, every `SKILL_NAMES` entry as `/<name>`, and a yes on the `hh elevate` row. This session counted 825 words.

- It does not quote the novel. The README uses the product name and the locked phase names. The only `Don't Panic.` with a period is line 7. There is no `Don't Panic!`, no dialogue, and no cover line pasted as prose. `assertReadme` throws on `Don't Panic!`, on any `!`, on `autistic`, `autism`, and `spectrum`, on an em dash, and on a second `Don't Panic.` (`readme.test.ts` lines 21–52). Test `assertReadme throws on the banned strings` (line 183) requires each of those throws. The disk test requires exactly one `don't panic.` in `README.md`. `docs/dont-panic.md` is 84 words, passes `assertReadme`, and points at `hh doctor`, `/hh-dont-panic`, and the interview. Test `docs/dont-panic.md points at hh doctor and the interview` (line 198) requires that, and requires the page to be shorter than the README.

### Key link

`assertReadme` is called on the bytes of `README.md` (`readme.test.ts` lines 9 and 101–104). A string that never touches the file cannot satisfy that test.

### Also checked

The commands table fills the `hh` column only for real subcommands. `hh doctor` matches `formatDoctor` (`packages/cli/src/doctor.ts` lines 54–68): node, git, grok, session-id, effort, and warnings for missing playwright, whisper, and pdftotext. The formatter has no auth line. `hh mostly-harmless` rejects `--yes` (`packages/cli/src/main.ts` line 200). `hh elevate` requires a yes. `hh install` is described as a copy into `.grok`, and the README says the install prompt implements the copy.

Prompt 150 says to add a root test script when `pnpm -w test` is unwired, and its file list does not include the root `package.json`. The root manifest has no `scripts.test`. The README states that, and names `pnpm --filter @hitchhiker/engine test`. This review leaves the root manifest alone. The file list wins over the extra sentence. The public text matches the repo.

A scan of `README.md` and `docs/dont-panic.md` found no exclamation mark, no em dash, and none of unlock, seamless, revolutionize, empower, game-changer, delve, leverage, synergy, robust, cutting-edge, journey, tapestry, landscape, lorem, or indigo.

## UI

Prompts 148, 149, and 150 change no file under `packages/app/`. The diff from `e606219` to `6169628` is the CLI, the plugin, `README.md`, and `docs/dont-panic.md`. No screen was added or restyled. This review did not open a browser and did not take 375 or 1440 screenshots. No visual pass is claimed.

## Live model calls

This group adds no model call. `install.ts`, `commands.ts`, and the skill bodies do not import `packages/engine/src/ai/` and do not call `think`. No prompt here left a scripted stub where Matt asked for a live call. The engine suite still skips `live smoke returns a two-field object` unless `HH_LIVE=1`. That skip is the 011 adapter's own gate. It is unchanged by these three prompts.

## Notes

- `pnpm --filter @hitchhiker/cli test` prints `No projects matched the filters` and exits 0. The CLI package name is `hitchhikers-guide`, which prompt 001 locked and prompt 148 repeats. An empty filter is not a test run. This review ran `pnpm --filter ./packages/cli test` and got 59 passes.

- `grok inspect --json` from the repo root exits 0. This run saw `projectTrusted: true`, 158 skills, and zero names starting with `hh-`. The skills are not copied into this repo's `.grok/skills`. Prompt 149 step 5 says to install into a temp project first. Test `grok inspect lists the installed skills` does that and passed.

- The vendored hooks excerpt omits `env`. Grok 1.0.46 documents it. The hook uses it. See the 149 section above.

## Commands

Run from the repo root on `6169628`, before this docs commit:

- `pnpm --filter @hitchhiker/cli test` exited 0 and matched no package. See the note above.
- `pnpm --filter ./packages/cli test` exited 0. 59 tests, 59 pass, 0 fail, 0 skipped.
- `pnpm --filter @hitchhiker/grok-plugin test` exited 0. 9 tests, 9 pass, 0 fail, 0 skipped. The inspect test ran. It did not skip.
- `grok inspect --json` exited 0. It does not list the `/hh-*` skills at this repo root. The temp-project test does.
- `pnpm --filter @hitchhiker/engine test` exited 0. 593 tests, 592 pass, 1 skipped (`live smoke returns a two-field object`, `HH_LIVE` unset). The three README tests passed.

No prompt in this group defers its test runner to a later prompt.

## Scope

No source change in this session. No fix commit. No push, no remote, no deploy. Prompt 152 is not started.
