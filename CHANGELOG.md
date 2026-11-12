# Changelog

All notable changes to the Hitchhiker's Guide are written here.
The publishable package is `hitchhikers-guide` in `packages/cli`.
`hh --version` reads that file.
The private workspace root stays at `0.0.0` and is not the package npm would receive.

This file does not publish. Do not npm publish. Do not git push. Creating the `v0.1.0` tag is not a step in this file. The tag and the registry upload need Matt's explicit yes.

## Unreleased

### Added

- [docs/imagine-first.md](docs/imagine-first.md) describes the sketch flow: draw, pick, change, approve, motion clips, build to the approved sketch, and the compare that can pause the queue. It lists the files, the `design.comps`, `design.motionRefs`, and `design.compare` defaults, the provider order, and the API-path cost of one 5-page site.
- `hh doctor` names the Imagine path that would draw comps. The default sentence is the Grok sign-in. A key in `XAI_API_KEY` or the OS keychain adds that the API is ready, and the key is not printed.
- [docs/secrets.md](docs/secrets.md) says where that key lives, and that the desk settings checkbox does not turn the API path on. The switch is `"api": true` in `.hitchhiker/assets/media.json`.

## 0.1.0

Alpha, prepared 2026-10-22. The local desk, the six phases, the quality gates, Elevate, and launch-behind-a-yes are in the tree. The CLI can be packed on this computer. It is not on npm until a person publishes it.

### Added

- `packages/cli` is `0.1.0`. `hh --version` prints `0.1.0`, then a newline, with no leading `v`.
- This changelog.
- [docs/RELEASE-v0.1.md](docs/RELEASE-v0.1.md), the checklist for Specs 01, 02, and 03. It names each acceptance test by file. It also names the two human steps, the `v0.1.0` tag and the registry upload, and both need Matt's explicit yes.
- The README status is alpha. [Try it](README.md#try-it) names `npx hitchhikers-guide` as the package entry, and says the registry copy is still waiting. The clone command `node scripts/start.mjs` is the door that opens today.

### Unchanged on purpose

- The 242f hero at the top of the README (the picture, `docs/assets/hero.gif`, and `docs/assets/hero.png`) is the same picture.
- The root `package.json` stays private at `0.0.0`.
- No tag was created. No registry upload was run. No site was deployed.

### Not in this version

- The registry upload for `0.1.0` has not happened.
- The `v0.1.0` tag does not exist yet.
- Cloud mode, and the other items still open on the roadmap.

## 0.0.0

Everything before this alpha: the private workspace, and the CLI while its own version field was still `0.0.0`. Those commits are the history. They are not a release.
