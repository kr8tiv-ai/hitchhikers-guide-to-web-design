# Release v0.1.0

A human walks this list before anyone tags `v0.1.0`. A release is a checklist, not an automatic publish. This page does not tag a commit, does not upload a package, and does not deploy a site.

Do not npm publish. Do not git push. Do not deploy. `npm publish` and `git push` are not steps.

The publishable package is `hitchhikers-guide` in `packages/cli`, version `0.1.0`. `hh --version` prints `0.1.0`. The private workspace root stays `0.0.0`. Alpha is the honest status. The package is not on npm until the human steps at the bottom get Matt's explicit yes.

PASS_WITH_KNOWN_ISSUES may ship for v0.1. A BLOCKER never does. The ship gate stays closed while any result is a BLOCKER, while the report is missing, or while the report was saved for a different commit.

Spacing is FIX when more than 10% of the measured boxes use an off-scale margin or padding. That rule is covered by `packages/qa/test/spacing-gate-243.test.ts`.

Hostinger is the suggested host. Hostinger does not run without yes. Always ask the person before any real deploy. This page is not that yes.

The npm tarball budget is 25 MB. The compressed `.tgz` has to stay at or under `25 * 1024 * 1024` bytes. Dependencies that npm installs afterwards are not counted inside that cap.

Run one test file at a time, from the repo root:

```
node --experimental-strip-types --test <file>
```

A Playwright spec, when you mean that one file only:

```
pnpm --filter @hitchhiker/app exec playwright test e2e/<file>
```

Do not run the full Playwright suite from this page. `HH_LIVE` stays opt-in and is not run here. Do not start or stop anything on port 4175. Live host adapters stay behind injected fakes. Do not call a host while you tick these boxes.

## Spec 01. Quality gates

One gate registry, `runAllGates`, a `GATES.json` report tied to a commit, and the orchestrator `shipGate`. Phase 6 does not open while the report is missing, stale, or blocked. A pass with known issues may ship for this version. A blocker may not.

- [ ] `packages/qa/test/verdict.test.ts`
- [ ] `packages/qa/test/pillars.test.ts`
- [ ] `packages/qa/test/type-gate.test.ts`
- [ ] `packages/qa/test/device-matrix.test.ts`
- [ ] `packages/qa/test/reduced-motion.test.ts`
- [ ] `packages/qa/test/palette-proportion-241.test.ts`
- [ ] `packages/qa/test/weight-gate.test.ts`
- [ ] `packages/qa/test/lighthouse-gate.test.ts`
- [ ] `packages/qa/test/review-runners-241.test.ts`
- [ ] `packages/qa/test/live-gates.test.ts`
- [ ] `packages/orchestrator/test/fixture-run.test.ts`
- [ ] `packages/orchestrator/test/runner.test.ts`
- [ ] `packages/orchestrator/test/progress.test.ts`
- [ ] `packages/qa/test/gate-registry-243.test.ts`
- [ ] `packages/qa/test/spacing-gate-243.test.ts`
- [ ] `packages/orchestrator/test/ship-gate-243.test.ts`
- [ ] `packages/app/e2e/gate-card-243f.spec.ts`

The last file is the desk card. Run it alone. The card shows a plain reason and a fix button that only asks. Yes on that card does not change the site.

## Spec 02. Elevate loop

The loop stops on its rules. A pick that turns a gate red is reverted, and HEAD matches the commit from before that pick. Each accepted pick is one commit on the Drive queue. An empty pick list commits nothing. After the loop, `GATES.json` still matches HEAD, so the ship gate stays valid.

- [ ] `packages/qa/test/elevate-loop.test.ts`
- [ ] `packages/qa/test/elevate-run.test.ts`
- [ ] `packages/qa/test/elevate.test.ts`
- [ ] `packages/qa/test/beauty-gate-239.test.ts`
- [ ] `packages/qa/test/defect-log-241h.test.ts`
- [ ] `packages/qa/test/juror-floor-241h.test.ts`
- [ ] `packages/cli/test/elevate-review-241l.test.ts`
- [ ] `packages/orchestrator/test/schedule.test.ts`
- [ ] `packages/orchestrator/test/queue-file.test.ts`
- [ ] `packages/qa/test/elevate-rounds-243.test.ts`
- [ ] `packages/app/e2e/reveals.spec.ts`

`reveals.spec.ts` is the optional desk reveal. Run it only when you meant to touch that card, and run no other Playwright file beside it.

## Spec 03. Deploy

`hh so-long` can build a local preview and write a zip, with no network and no keychain. A red or stale `GATES.json` exits non-zero, names the reason in plain language, and calls no adapter. Declining the yes writes nothing. The four host adapters are reached through the dispatcher with injected clients. A site that needs a server is refused on Netlify and Cloudflare with the existing message. `HH_LIVE` stays opt-in and is not run by these tests.

- [ ] `packages/deploy/test/real-adapters.test.ts`
- [ ] `packages/deploy/test/post-check.test.ts`
- [ ] `packages/deploy/test/launch-kit.test.ts`
- [ ] `packages/deploy/test/launch-wired-241k.test.ts`
- [ ] `packages/deploy/test/hostinger.test.ts`
- [ ] `packages/deploy/test/vercel.test.ts`
- [ ] `packages/deploy/test/netlify.test.ts`
- [ ] `packages/deploy/test/cloudflare.test.ts`
- [ ] `packages/cli/test/unknown-command.test.ts`
- [ ] `packages/cli/test/hh-bin.test.ts`
- [ ] `packages/deploy/test/dispatch-243.test.ts`
- [ ] `packages/deploy/test/preview-243.test.ts`
- [ ] `packages/cli/test/so-long-243.test.ts`

## Sample and the ship gate

`samples/towel-day.hhproject` is the Mostly Towels sample the desk can open. It is a project file, with no secrets and no path from another machine. The desk offers it on an empty project. Shipping the CLI copies it under `dist/shipped/samples/`.

- [ ] `samples/towel-day.hhproject`
- [ ] `packages/engine/test/sample-project.test.ts`

The fixture that reaches the ship gate is `packages/orchestrator/test/fixture-run.test.ts`, also listed under Spec 01. A passing fixture review reports the ship gate clear. A blocker ends in ESCALATE and the ship gate stays closed. That run uses injected gate results. It does not load the towel sample as the site under test, it does not call a host, and it does not run `HH_LIVE`. Opening the sample on the desk is not, by itself, a ship-gate pass. `packages/orchestrator/test/ship-gate-243.test.ts` is the direct check that a missing report, a stale commit, or a blocker keeps launch closed.

## Also on this version

These are the pack and the release workflow. They are not Specs 01 to 03. They are part of telling the truth about `0.1.0`.

- [ ] `packages/cli/test/pack-243.test.ts`
- [ ] `packages/engine/test/release-workflow.test.ts`

The pack smoke installs a tarball in a temporary folder and does not publish. `hh --version` from that install prints the version in the packed manifest, which is `0.1.0` once this tree is packed. The release workflow test reads `.github/workflows/release.yml` and checks that an ordinary push does not publish, and that publish waits for the pack smoke.

## Human steps that need Matt's explicit yes

Do not npm publish. Do not git push. Do not deploy. `npm publish` and `git push` are not steps.

Two acts stay outside this page, and outside every build session:

- The `v0.1.0` tag. A person creates it. This repo's workflow does not create one. It needs Matt's explicit yes.
- The registry upload of `hitchhikers-guide` at `0.1.0`. [`.github/workflows/release.yml`](../.github/workflows/release.yml) can perform it later, after CI and the pack smoke, and only from a hand start that types `publish` or from that tag. It needs Matt's explicit yes. This checklist is not that yes.

A ticked test above is evidence. It is not permission to tag or to upload. When the tests you meant to run are green, stop.
