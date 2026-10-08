# 001. Post-check title group

Status: **applied** in this once-over.

## Miss

`pnpm exec tsc -b` is the typecheck step in `.github/workflows/ci.yml`. Before this pass it exited 2 on `packages/deploy/src/post-check.ts`. `noUncheckedIndexedAccess` types `match[1]` as `string | undefined` after a successful exec. Review 158 recorded the same diagnostic and left it, because that checkpoint did not own the file.

v2 §12 requires a completed deploy to be checked. A typecheck gate that cannot pass is a gate that cannot run.

## Fix

`titleText` returns an empty string when the capture group is missing, then trims a present title. Behavior for a real `<title>` is unchanged.

## Proof

`packages/deploy/test/post-check.test.ts` test `a multiline title is collapsed and still counts`.

`pnpm --filter @hitchhiker/deploy test` exited 0 (121 pass). `pnpm exec tsc -b --pretty false` exited 0.
