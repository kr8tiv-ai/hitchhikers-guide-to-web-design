# 005. Sharp platform packages pass with an LGPL side

Status: **proposed**. Not applied. Do not remove `sharp` in this prompt.

## Miss

The licence rule is MIT-compatible only. An `AND` expression fails when any side is outside the allow list. `Apache-2.0 AND LGPL-3.0-or-later` is that case.

`packages/qa/src/licenses.ts` lets that expression pass only when the package name starts with `@img/sharp-`. Any other name fails. A lone LGPL identifier fails. NOTICE names the exception. Review 158 left it because dropping sharp is a library swap.

This once-over ran `auditDeps` on `pnpm licenses list --json`. Result: `ok: true`, 331 packages, `problems: []`. The gate runs. The exception is why the sharp rows are inside that pass.

## Fix

Decide in a later prompt. Options are a documented exception that stays name-bound, or a replacement that does not pull LGPL. Do not widen the exception to other names. Do not mark LGPL as allowed in general.

## Why this pass did not do it

Removing sharp changes image optimization across the starters. That is a library swap, which this pass does not improvise.
