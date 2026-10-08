# 003. Scaffolded STATE.md cannot be loaded

Status: **applied** in the post-159 pass

## Miss

v2 §4 and §19 put Guide state in `.hitchhiker/`, not `.planning/`. Both writers use `.hitchhiker/`. They do not agree on the file.

- `packages/engine/src/state.ts` `loadState` requires headings `Phase`, `Slice`, `Prompt id`, `Last good commit`, `Blockers`, `Next action`, and `Updated at`. A file that exists and lacks one throws `STATE.md is missing heading`.
- `packages/engine/src/spec/scaffold.ts` `fillState` writes the ported GSD template (`## Current Position`, `Phase: 3 of 6`, and so on). `scaffoldProject` refuses `.planning`.
- `packages/engine/src/interview.ts` `openInterview` calls `loadState` and does not catch that throw.

Review 071 scaffolded a temp project and `loadState` threw. That is still the code. A fresh scaffold cannot open the interview.

## Fix

Pick one reader. Either teach `loadState` to accept the ported template and map it onto `GuideState`, or have `scaffoldProject` also write the short heading document `saveState` already emits. Keep the GSD template on disk if a prompt still requires it. Keep `.hitchhiker/` and keep the lock.

Tests that must stay green: the scaffold test that forbids `.planning`, and the state round-trip test. Add one test that `openInterview` on a directory `scaffoldProject` just wrote does not throw.

## Why this pass did not do it

The two shapes were locked by different prompts. Choosing one is an architecture change. This pass does not improvise it.
