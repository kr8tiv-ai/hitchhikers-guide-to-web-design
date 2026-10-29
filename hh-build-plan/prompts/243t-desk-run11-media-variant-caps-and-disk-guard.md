# 243t - Desk Run 11: Cap Media Variants, Guard Free Disk Space, Clean Partial Outputs, and Dedupe Encodes

## Context

During Run 11 on `site-c`, Prompt `115` (elevate pass for imagery) failed with `Error: No space left on device` while writing `public/media/<name>/<name>-{1280,1920,2560}.{avif,webp}`. `C:` free space dropped from about 5 GB to 0.34 GB and the machine became unreachable for hours (`BUG-113`, `S2`). The variant writers are `packages/templates/astro-default/scripts/optimize-media.ts` and `packages/templates/next-app/scripts/optimize-media.ts` (`IMAGE_WIDTHS`, sharp `avif`/`webp` `toFile`, plus scroll-video ffmpeg encodes) and `packages/assets/src/section-generate.ts` (`RESPONSIVE_WIDTHS = [640, 1280, 1920, 2560]`, `formats: ["avif", "webp"]`). Nothing caps the number or size of variants, checks free disk space, removes partial files after a failure, or skips duplicate work.

## Deliverables

1. **Shared media budget** (new module, e.g. `packages/assets/src/media-budget.ts`, re-used by both template `optimize-media.ts` scripts and `section-generate.ts`):
   - `MAX_VARIANT_WIDTH = 1920` (drop 2560), at most 3 widths per image (default `[640, 1280, 1920]`), never upscale past the source width, and skip widths within 10% of each other.
   - Per-image budget (default 8 variants) and per-run budget (default 400 MB total bytes written); configurable through `.hitchhiker/config.json` `media.maxVariantsPerImage`, `media.maxRunBytes`, `media.maxWidth`.
   - Any variant larger than its source (or larger than 1.5 MB) is discarded and the smaller format is kept.
2. **Free-space guard**: before each encode batch and before each `toFile`/ffmpeg output, call `fs.statfs` (fallback: skip guard with a warning if unsupported) on the output directory. If free space is below `max(2 GB, 3 × estimated batch bytes)`, stop encoding and throw/return a clear error: `Not enough free disk space to write media variants: <free> free on <volume>, need <required>. Free space and retry.` The build runner must surface this as a normal prompt failure reason (not `ENOSPC`).
3. **Partial-output cleanup**: write each variant to `<file>.partial` (or a temp name in the same directory), rename on success, and on any error (including `ENOSPC`) delete the partial file and any variants of the current image written in this run. Also remove leftover `*.partial` files at the start of a run.
4. **Dedupe**: keep a manifest (e.g. `public/media/.variants.json`) keyed by source content hash + width + format + quality; skip encodes whose output already exists with a matching key, and reuse identical sources (same hash) instead of re-encoding.
5. **Engine surfacing**: in `packages/engine/src/guide/site-build.ts`, when a prompt log contains `ENOSPC` / `No space left on device`, set the failure reason to the clear free-space message above and prune `.hitchhiker/tmp` (existing `pruneProjectTmpDir`).

## Tests

Add `packages/engine/test/desk-run11-243t.test.ts` (and/or `packages/assets/test/media-budget.test.ts`) covering: width capping (no 2560, no upscaling, max 3 widths); per-image and per-run budget enforcement; the free-space guard returns the clear message with a stubbed `statfs`; a simulated `ENOSPC` from the encoder leaves no `.partial` or half-written variants; a second run with unchanged sources performs zero encodes (dedupe); and the engine maps `No space left on device` to the clear failure reason.

## Verification Gates

Run from the repository root:
- `node --experimental-strip-types --test packages/engine/test/desk-run11-243t.test.ts`
- the new assets test file, if added
- `pnpm typecheck`
- `pnpm lint`

## Commit

`fix(assets): cap media variants, guard free disk space, clean partial outputs, and dedupe encodes (243t)`