# The Hitchhiker's Guide to Web Design

A local, spec-driven guide. It interviews you, writes the brand and the plan, and drives Grok 4.7 through that plan on your machine. Repository: [github.com/kr8tiv-ai/hitchhikers-guide-to-web-design](https://github.com/kr8tiv-ai/hitchhikers-guide-to-web-design).

## Don't Panic

Don't Panic. The work is a conversation you can pause, a spec you can read, and a build that checks itself. You approve the brief, the brand, and the prompts before code is written. Deploy waits for a yes. The short page for the interview is [docs/dont-panic.md](docs/dont-panic.md).

## Quick start

The desk needs this clone because `hh app` and `hh install` resolve the sibling `packages/app` and `packages/grok-plugin`, and the install prompt copies skills into `.grok` from that plugin.

1. Node >=22.18
2. `corepack enable`
3. `corepack prepare pnpm@10.32.1 --activate`
4. `pnpm install`
5. `pnpm exec hh doctor`
6. `pnpm exec hh app --project <dir> --no-open`

`npx hitchhikers-guide` is not yet published on npm and returns 404 today. It is only a future note.

## What this is not

This is not a hosted builder, not a drag-and-drop editor, not a template store, and not a paid SaaS. Grok Build runs on your SuperGrok plan. Imagine, 3D generation, and the X API bill the caller's own key, and only after a budget answer and a yes for that batch.

## The six phases

1. Don't Panic, the interview. You approve the site brief.
2. Babel Fish, the brand. You approve the kit.
3. Deep Thought, the plan. The PRD, the specs, and the prompt package, approved before the build.
4. Improbability Drive, the build. One prompt, one job, one commit.
5. Mostly Harmless, the gates and the jury. The Elevate command can run again after you pick what to apply.
6. So Long and Thanks for All the Fish, the launch. Deploy and the launch kit, after a yes.

A skip writes a marked assumption. A required field cannot ship blank.

## Commands

The list is the one in `packages/grok-plugin`. A slash name is a skill. The `hh` column is filled only where the CLI implements that subcommand.

| Slash | hh | Does |
|---|---|---|
| `/hh-new` | skill only | Project, `.hitchhiker/`, home index. |
| `/hh-dont-panic` | skill only | Start or resume the interview. |
| `/hh-import` | skill only | Brand guide, URL, or assets. |
| `/hh-babel-fish` | skill only | Brand phase, for approval. |
| `/hh-logo` | skill only | Logo pipeline. Ask before Imagine spend. |
| `/hh-assets` | `hh assets` | Imagine and 3D under the cap. `run` needs a yes. |
| `/hh-deep-thought` | skill only | PRD, specs, and prompts. |
| `/hh-drive` | skill only | Run the queue when you type it. |
| `/hh-review` | skill only | Review the current build. |
| `/hh-fix` | skill only | One specified fix. |
| `/hh-mostly-harmless` | `hh mostly-harmless` | Gates and jury. The CLI rejects `--yes`. |
| `/hh-elevate` | `hh elevate` | One Elevate round. A pick needs the user's yes. |
| `/hh-so-long` | skill only | Deploy and launch kit after a yes. |
| `/hh-progress` | `hh progress` | Phase, slice, prompt, next action. |
| `/hh-pause` | `hh pause` | Save the next action. |
| `/hh-resume` | `hh resume` | Where to continue. |
| `/hh-undo` | skill only | Revert the last prompt commit when you type it. |
| `/hh-budget` | skill only | Spend caps. |
| `/hh-settings` | skill only | Model, effort, voice, deploy, depth. |
| `/hh-doctor` | `hh doctor` | Node, git, grok, session id, effort. Warns if playwright, whisper, or pdftotext is missing. No auth result. |
| `/hh-dashboard` | `hh app` | Local dashboard. |
| `/hh-help` | skill only | Which commands `hh` can run today. |
| | `hh install` | Copy skills into `.grok`. |
| | `hh tools` | Search or install. Install needs a yes. |
| | `hh improve` | Bounded loop on an improve branch. A human merges. [docs/improve.md](docs/improve.md). |

## Motion

GSAP is the base, with ScrollTrigger, SplitText, and the other free plugins. The toolkit also ships Three.js, raw WebGL and GLSL via OGL or WebGL2, Motion, anime.js, Theatre.js core (`@theatre/core` only), Lenis, CSS scroll-driven animations, and vanilla JS. The picker chooses per effect, for the craft of that moment: CSS for a light reveal, GSAP for sequenced scroll and text splits, Three.js for a 3D scene, OGL or WebGL2 for a shader, Theatre.js core for a cinematic timeline, Motion or anime.js for a gesture or a small timeline, and vanilla JS when the effect should stay small. Generated sites import only what they use.

## Develop

Node 22 and pnpm. The root `pnpm test` script runs `pnpm -r test`, so `pnpm test` and `pnpm -w test` run every workspace package that ships a test script. Run one package with `pnpm --filter @hitchhiker/engine test`.

## Credits

The method credits Matt Haynes's AntiHero guides at [antihero.community](https://antihero.community). The guides are named here and are not pasted. Spec files follow [open-gsd/gsd-core](https://github.com/open-gsd/gsd-core). `vendor/gsd-core` is templates. It is not a runtime dependency. Every third-party licence is recorded in [NOTICE](NOTICE).

## License

[MIT](LICENSE).
