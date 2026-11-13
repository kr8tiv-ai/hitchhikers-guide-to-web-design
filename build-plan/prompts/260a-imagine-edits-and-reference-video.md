---
id: 260a
title: Imagine client - multi-reference image edits and reference-to-video, through every provider
kind: build
effort: xhigh
model: grok-4.7
depends_on: none
---

# 260a - Imagine client - multi-reference image edits and reference-to-video, through every provider

Read `build-plan/IMAGINE-FIRST-SPEC.md` first. It is the contract for this chain and lists the verified xAI endpoints. Confirm every claim about existing code by reading it; if the code differs from this prompt, adapt, prefer wiring existing code over new code, and say so in the commit body.

## Goal
Comps must be generated WITH the brand references and the already-approved comps as real image inputs, not as paths in prompt text. Add the verified edits and reference-to-video calls to the existing client and provider chain.

## Must haves
1. `packages/assets/src/imagine-http.ts`: `editImage(req, deps)` posting to `/v1/images/edits` (`IMAGE_EDITS_PATH`). One source sends `image: { type: "image_url", url }`; 2 to 5 sources send `images: [...]`. More than 5, zero, or a non-http(s)/non-`data:image/` url is a validation error before any fetch. Optional `aspect_ratio` (same allow-list), `n`, `resolution`, `quality` exactly as `generateImage`. Same retry, redaction and response reading (`data[].url` / `data[].b64_json`).
2. `startVideo` accepts `referenceImages?: string[]` (max 5, same url rules) sent as `reference_images: [{ url }]`. `image` and `referenceImages` together is a validation error.
3. A helper `fileToDataUri(path)` (png/jpeg/webp only, size cap, no other types) used by callers to send local files.
4. `MediaProvider` (section-generate.ts) gains optional `editImage`. `apiMediaProvider` implements it with the client. `grokCliProvider` implements it by passing the absolute reference file paths in its instruction lines ("Use these reference images as image inputs: ...") and still saving to the dest path. `browserHandsBackProvider` hands back. `chainProvider` falls through providers that lack `editImage` to the next one, and if none supports it, falls back to `generateImage` with the reference paths described in text, recording a note that references were text-only.
5. `prices.ts` / `media-budget.ts`: an edit is quoted as output price plus one input image price per source at the same model rate (the docs say inputs are billed); no new model ids.
6. No key ever appears in a request body, a note, a log line or an error.

## Files
`packages/assets/src/imagine-http.ts`, `section-generate.ts`, `prices.ts`, `media-budget.ts`, `index.ts`, tests in `packages/assets/test/imagine-edits-260a.test.ts`.

## Non-goals
No comp logic, no desk UI, no live calls.

## Tests (failing first)
- one source posts `image`, three sources post `images` in order, six sources and a `file://` url throw before fetch;
- `aspect_ratio` passes through, unsupported aspect throws;
- reference-to-video posts `reference_images` and polls as before; `image` + `referenceImages` throws;
- 429 then 200 retries; an error body containing the key is not in the thrown message;
- chain: api provider used for edits when enabled; grok-cli edit puts the absolute paths in the instruction; no edit-capable provider falls back to generate with a text-only note;
- edit quote = output + inputs.

## Verification

Run from the repository root with `HH_CASSETTE=replay`:
- `pnpm typecheck`
- `pnpm lint`
- the tests of every package you touched (assets), for example `pnpm --filter @hitchhiker/engine test`
If a fixture trips a check, fix the fixture, never weaken the check. No network, no paid API call, no real Grok call, no browser download in tests (Playwright Chromium is already in `~/.cache/ms-playwright`; e2e only where stated). Never `--no-verify`, never push, never merge, never deploy, never `hh brief --approve`, never kill a process you did not start. Commit your work with the message below when the checks pass.

## Commit

```
feat: imagine client (260a)
```
