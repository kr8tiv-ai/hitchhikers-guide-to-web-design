# 052 Review — prompts 049, 050, 051

Verdict: **PASS**

Reviewed: 2026-10-06. Fresh session. No fix commits. No new feature.

HEAD reviewed: `0202271` (`feat(brand): compile VOICE.md and five taglines`).

The 049, 050, and 051 must-have truths hold. Each one below has a test name and a file line. This verdict is those truths, plus the acceptance checks in each prompt. `phase_end` is false, so this checkpoint does not close Babel Fish.

## History

Three build commits, in order, on top of `c88f667`. Messages match the prompt commit lines. They are separate commits. History was not rewritten. Those three were local only: `main` was three commits ahead of `origin/main` before this review commit. The driver pushes. This session does not.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `6060a49` | `c88f667` | `feat(brand): add contrast-safe palettes and type pairs` | same, prompt 049 |
| 2 | `0d68f4e` | `6060a49` | `feat(brand): add imagery rules and prompt stubs` | same, prompt 050 |
| 3 | `0202271` | `0d68f4e` | `feat(brand): compile VOICE.md and five taglines` | same, prompt 051 |

## 049 Build palettes, type pairs, and contrast tokens

### Truths

- Contrast is enforced in the compiler. `contrastRatio` in `packages/engine/src/brand/tokens.ts` (lines 98–104) uses the WCAG 2.2 sRGB coefficients, threshold 0.04045, and exponent 2.4. `passes` (lines 107–110) treats body as 4.5 and large text as 3. `draftFrom` (lines 278–279) drops a candidate whose ink-on-paper is under 4.5. `pushUnique` (line 294) drops one again before it is stored. `nameDrafts` (line 307) skips a draft that fails the same check. Test `black on white is 21 and the ratio is symmetric` requires a ratio within 0.001 of 21, including the 3-digit form. Test `#777777 on white is below 4.5 for body text` requires the ratio under 4.5 and `passes(..., "body")` false. Test `every proposed palette clears 4.5 and skips the indigo violet denylist` runs eleven seeds, including null, both denylist hexes, and `#abc`, and requires length 1 to 3, `ratioBody` equal to `contrastRatio(ink, paper)`, and `ratioBody` at least 4.5. A review probe of a gray ramp (`#777777`, `#888888`, `#aaaaaa`, `#cccccc`), both denylist hexes, black, white, `#c4512c`, `#f4f0e6`, and a null seed, across four vibes, found zero ink-on-paper pairs under 4.5.

- Type is two families or one. `pickType` (lines 147–160) returns one family, or the first two mentions. A third mention adds the warning `dropped extra family`. The return type is `[string, string] | [string]`. Test `pickType keeps at most two families and warns when a third is named` requires length 2, families `Bebas Neue` and `Barlow`, and that warning for `Bebas Neue, Barlow, and Inter`, including a shouted spelling. The same test requires `Helvetica` and `Garamond` from three custom names, and a one-element array from `Use Helvetica`. Test `an unnamed answer chooses one of the six pairings and does not fetch fonts` requires every sampled answer to have length 1 or 2.

- Font files are not downloaded here. The same unnamed-answer test reads `tokens.ts` and requires the source to omit `fetch(`, `fonts.googleapis`, `fonts.gstatic`, `fontshare.com`, `http`, and `.woff`, `.woff2`, `.ttf`, and `.otf`. The license string on the returned pair is `Google Fonts or Fontshare. Confirm the license at install.` (`TYPE_LICENSE`, line 33). `git diff --name-only c88f667..HEAD` lists no font file.

### Also checked

- A mid-gray seed is kept as the signal on the high-contrast fallback, and it is never the ink. Test `a mid-gray seed cannot be body ink, so the high-contrast fallback is included` requires paper `#f4f0e6`, ink `#1c1915`, signal `#777777`, and body `passes`. The probe measured that fallback signal at 3.94 to 1, which clears large text and misses body text. See Notes.
- `#4f46e5` and `#7c3aed` are `DENY_HEX` (line 31). The denylist test requires both hexes absent from paper, ink, signal, and the rendered CSS for an indigo seed and a violet seed.
- `renderCssVars` emits `--paper`, `--ink`, and `--signal` with the 60, 30, and 10 comments. Test `renderCssVars emits paper, ink, and signal with no gradient` requires those variables and rejects a gradient string.
- 3-digit hex expands. Invalid hex throws `TokenError`. Test `3-digit hex expands and invalid hex throws`.
- The six pairings in `TYPE_PAIRINGS` (lines 36–43) match the DP-1.5 suggest line in `interview/tree.yaml` and the v2 module 1 list, in the same order. An empty answer returns Bebas Neue and Barlow from that list.
- `proposePalettes` takes `seedHex` from the caller. Test `a passing seed is kept, and a failing seed is the signal rather than the ink` requires `#c4512c` and `#1f6f5b` to appear when passed, and requires a null seed with vibe `cool forest night` to use `#1f6f5b`. That is the DP-1.2 seed when the caller passes it. This module does not read the interview tree.

## 050 Write imagery rules and Imagine prompt stubs

### Truths

- Imagery stubs do not call Imagine. `buildImagery` in `packages/engine/src/brand/imagery.ts` (lines 72–84) builds strings and returns them. The module has no `fetch(`, no `node:http`, and no URL. Test `the module does not fetch and it checks every stub before return` reads the source and requires those absences, plus the absence of `axios` and `grok-imagine-video`. The imagery tests call `buildImagery` and assert on the returned strings.

- Faces are not in the default stub list. `IMAGERY_ROTATION` (lines 34–40) is `place`, `material`, `tool`, `hand-without-a-face`, and `detail`. `isFaceSubject` (lines 123–126) refuses `portrait` and a subject that contains the word `face`, and it leaves `hand-without-a-face` alone. Test `the default rotation is five stills and none of them is a face` requires that rotation, ids `img-01` through `img-05`, and subject `face` absent. Test `an empty rotation throws and a face subject is refused` requires `ImageryError` with `face stub is not allowed` when `face` is passed. Each stub ends with `no faces`. The hand scene says the head is out of frame.

- The still model is not swapped for video because the budget said cinematic. `STILL_MODEL` is `grok-imagine-image` (line 29). `STILL_RESOLUTION` is `1k` (line 32). `makeStub` (lines 139–144) writes those two fields on every stub. Test `cinematic and 1080 budget words keep the still model and the 1k size` passes vibe `cinematic dusk, budget mentions 1080` and requires model `grok-imagine-image`, resolution `1k`, no `video` in the model id, and no `1080p`, `720p`, or `480p` in the resolution. Each prompt contains `Still photograph, not a clip.`

### Also checked

- Stubs are five by default, inside the required three to six. Each prompt contains the words `ink` and `paper`, plus `no text, no watermark, no logo letters`. Test `the default rotation is five stills and none of them is a face`. A palette name that is only a hex still carries both words. Test `ink and paper words stay when the palette name is only a hex`.
- `replacesReal` is the literal `false`. The test file locks that with a type check. `assertNoRealReplacement` (lines 87–97) throws on `replace the person`, on `looks like the uploaded photo of`, and on a true `replacesReal`. It runs before each stub is returned (line 80). Test `assertNoRealReplacement throws on a person swap and on a lookalike line`.
- Empty protected notes render `Nothing is marked protected yet.` A note of only `!` does too. Real notes are blockquoted. Test `protected notes are quoted and an empty note uses the empty sentence`. The guide says people, products, and places already in hand are do-not-replace.
- A vibe longer than 80 characters is clipped in the prompt and kept whole in the markdown. Quotes are removed in the prompt. Test `a long vibe is clipped in the prompt only and quotes are removed there`.
- Stub prompts omit the word `testimonial`. The default-rotation test requires that. The guide has no exclamation mark. An empty rotation throws. Test `an empty rotation throws and a face subject is refused`.
- The model id `grok-imagine-image` is the still id on the 2026-09-29 card in `hh-build-plan/RESEARCH-ADDENDUM.md` and the id prompt 053 prices at 0.02. See Notes for the resolution token.

## 051 Compile VOICE.md and cut thirty taglines to five

### Truths

- VOICE.md structure matches the v2 list. v2 section 9 asks for traits as this-not-that, NN/g positions, vocabulary, banned words, punctuation, tone by situation, slogans, how we talk about product, customer, competitor, price, and ourselves, five rewrites, and microcopy for buttons, errors, empty states, and 404. `VOICE_HEADINGS` in `packages/engine/src/brand/voice.ts` (lines 67–82) is that list, in that order. Test `a tea-shop positioning line from buildStory keeps five short taglines` requires every heading. It also requires the four NN/g poles from DP-1.6 (funny or serious, formal or casual, respectful or irreverent, enthusiastic or matter-of-fact), the competitor lines `We do not name competitors in headlines.` and `We do not insult named businesses.`, and microcopy keys `button`, `error`, `empty`, and `notFound`. The 404 line is `This page is not here.` It ends with a period. The same test rejects `Oops`, `universe`, and `!` in that line.

- Taglines are filtered, not merely generated. `buildTaglines` (lines 136–141) builds rearrangements of the positioning line, then `selectTaglines` (lines 117–130) keeps the first five that pass `acceptable` (lines 443–450). A line is dropped when it has an exclamation mark, an em dash, eight or more words, a banned word, a banned phrase, or a duplicate key. Fewer than five sets `shortfall` true. Test `selectTaglines filters length, punctuation, banned words, and duplicates` feeds a nine-word line, an eight-word line, `Elevate the cup`, `innovative tea`, a bang, an em dash, `In today's fast-paced world tea`, and a duplicate, and requires the five kept lines to be the clean ones. Test `eight-word rearrangements are discarded and a night-stall line still yields five` requires `A tin of tea for a night regular` (eight words) to be absent. Test `a banned offer is filtered out of the taglines` requires an offer of `elevate the leaf` to leave only `Weekday morning commuter regulars`, with `shortfall` true. Test `a long positioning returns fewer than five and does not ship the long lines` requires two lines and `shortfall` true.

- Anti-slop words are banned in the voice file itself. `BANNED_WORDS` (lines 39–56) is the v2 section 14 list plus `innovative` and `passionate`. `BANNED_PHRASES` holds the three v2 phrases. `compose` prints every one under `## Banned words`. `usableThis` refuses a this-side trait that contains a banned word. `plain` strips banned words from the offer and the visitor before they enter recommended copy. `renderVoice` (lines 165–167) throws `VoiceError` if the markdown contains `!` or an em dash. Test `a tea-shop positioning line from buildStory keeps five short taglines` requires every banned word and phrase in the Banned words section, and it requires slogans, microcopy, tone, the how-we-talk sections, and the five After lines to miss `elevate`, `seamless`, `innovative`, `cutting-edge`, `passionate`, and `unlock`. Test `an empty never-word list marks traits ASSUMED and uses the anti-slop not-side` requires `not seamless`, `not innovative`, and `not cutting-edge` when anti-vibe is empty. A review render of that empty case found banned words only in Traits (the not-side), Banned words (the list), and Five rewrites (the Before lines). After lines were `We make loose tea.`, `The offer is loose tea.`, `Ask for loose tea.`, `It is loose tea.`, and `Regulars can ask for loose tea.`

### Also checked

- The tea-shop fixture from `buildStory` yields exactly five taglines, `shortfall` false, and `assumed` false when both comma lists have three words. The positioning line is `For regulars, Kettle is the loose tea that the pot is ready`. Test `a tea-shop positioning line from buildStory keeps five short taglines`. That is the key link: `renderVoice` takes the positioning line `buildStory` writes. The voice module does not import `story.ts`. The test does.
- The passionate example is in the file as `Before: We are passionate about innovative solutions`. Each After line uses the offer and omits `passionate` and `innovative`. Test `rewrites follow the offer argument and taglines follow the positioning line` uses offer `biscuits!` and requires biscuits in the After lines and in `Order biscuits`, with the bang removed. Taglines still follow the positioning line.
- Empty anti-vibe sets `assumed` true. Fewer than three never-words does too. Tests `an empty never-word list marks traits ASSUMED and uses the anti-slop not-side` and `fewer than three pairs stays ASSUMED and fills the open slot from the anti-slop list`.
- The markdown of the tea-shop fixture and of a 400-word vibe list stays under 1,200 words. Test `a huge vibe list stays under 1,200 words and a banged offer is stripped`. The empty-anti-vibe render was 424 words.
- The module does not call a model. Test `the module does not call a model` reads the source and rejects `fetch(`, an import from `ai/`, and `api.x.ai`. It also rejects `universe` and `don't panic`.

## UI at 375 and 1440

No file under `packages/app/` is in `git diff --name-only c88f667..HEAD`. Prompts 049, 050, and 051 did not change a screen. No browser session, and no 375 or 1440 screenshot. There is no rendered surface in this group to compare with `packages/app/src/design/`.

## Live Grok

049 and 050 forbid a network call. Their source tests reject `fetch(`. 051 forbids a hand-rolled model call in this module. The prompt says Grok writes the 30 taglines through the 011 adapter in prompt 061, and this module validates and cuts to five. `selectTaglines` is that filter, tested with a fixture list. No voice cassette was added, because this module does not call `think()`. D-003 still requires real Grok calls for brand modules. Prompt 061 is the prompt that does that. These three commits do not leave a scripted product path in place of a call they were told to make. The skipped engine test `live smoke returns a two-field object` belongs to the 011 adapter and stays skipped because `HH_LIVE` was unset.

## File list

`git diff --stat c88f667..HEAD` is six files, 2004 insertions:

- `packages/engine/src/brand/tokens.ts`
- `packages/engine/test/tokens.test.ts`
- `packages/engine/src/brand/imagery.ts`
- `packages/engine/test/imagery.test.ts`
- `packages/engine/src/brand/voice.ts`
- `packages/engine/test/voice.test.ts`

Those are the three prompt file lists. No barrel edit. Each prompt says to leave files outside the list alone unless a test harness forces a one-line export. The tests import the module files, so no export was forced. No new package. No new surface. Nothing to revert.

## Notes

These are not failed truths.

- A seed that fails as body text is kept as the signal swatch, including on a paper where that pair is under 3 to 1. The probe measured `#777777` on `#353330` at 2.81, and `#aaaaaa` on `#f4f0e6` at 2.04. The mid-gray fallback the prompt names, `#777777` on `#f4f0e6`, is 3.94. Ink on paper stayed at or above 4.5 in every probed palette. The prompt's acceptance line is the ink-on-paper gate. `passes(ratio, "large")` is the caller's switch for 3 to 1. Replacing an under-3 seed swatch would drop the seed the prompt says to keep.
- `context/research/08-brand-intake-frameworks.md` records Matt's tagline prompt as 30 lines in six styles, at most six words. Prompt 051 says under eight words, and it says the thirty-line live pass is prompt 061. `context/matt-answers.md` Q15 asks for a voice guide and slogans. It does not set a word count. D-005 allows Matt's prompts verbatim. This slice follows the prompt's under-eight rule. Lines of eight words are discarded (`TAGLINE_WORD_CAP` is 8, and `acceptable` uses `>=`).
- The 050 context paragraph describes `buildImagery({ answers, palette })` and a DP-7.1 resolution switch. The interface in the same prompt is `{ protectedNotes, vibe, paletteName }`. The implementation follows the interface. The words `cinematic` and `1080` stay on the still model at `1k`. Prompt 053's still resolution union is `1k-low`, `2k-medium`, and `default`. This prompt required the string `1k`. The model id already matches the id 053 will price. The resolution token is 053's to reconcile.
- `.hitchhiker-dev/` is absent, so no summary file was written. Each commit body holds the summary.

## Verification

Commands run from the repo root on this review. No fix was applied, so there is no second run.

| Command | Result |
| --- | --- |
| `Test-Path hh-build-plan/reviews/052-REVIEW.md` | this file |
| `pnpm --filter @hitchhiker/engine test` | exit 0. 305 pass, 0 fail, 1 skipped (`live smoke returns a two-field object`) |

Node printed `NO_COLOR` / `FORCE_COLOR` warnings. They did not fail the test run.

No prompt 053 work. No push, no remote, no deploy.

## Scope

No source edit. No fix commit. The only file this session adds is this review.
