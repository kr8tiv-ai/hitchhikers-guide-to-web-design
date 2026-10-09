# Live fix 010. A pushback re-render must keep the new answer

004 may already have edited `desk.ts` and `card.ts`. Read those files as they are after 004. Do not remove the browser recognizer.

## Read first

- `packages/app/src/card.ts` `renderCard` (around 182–205). The comment says a hold shows an empty field so the soft line is not sent again.
- `packages/app/src/client/desk.ts` `paint` (around 479–492) and `startVoice` (around 293–336)
- `packages/app/test/card.test.ts` ("a draft enables Answer, and pushback keeps the field empty")
- `hh-build-plan/live-bugcheck/REPORT.md` finding F-05

## Bug

`renderCard` prints an empty textarea and disables Answer whenever `pushback` is set, and it ignores `state.draft`. The input handler enables Answer without re-rendering, so typing looks fine. Hold to talk, a failed submit, and any other `paint()` rebuild the card from `renderCard`. The new text vanishes and Answer is disabled until the person types again. The reducer already clears `draft` when a hold succeeds, which is what stops the rejected line going out a second time. The renderer does not need to drop a draft that is still in state.

## Spec

1. `renderCard` shows `state.draft` in the textarea whether or not there is a pushback. Answer is disabled when `pending` is set or the shown draft is blank. Skip and Suggest stay as they are.
2. A successful hold still stores `draft: ""`, so the rejected line is not sitting in the field. A draft typed or heard after that hold survives `paint()`.
3. Update the card test that requires draft `"fine"` plus a pushback to render an empty box. Empty draft plus pushback stays empty and Answer stays disabled. A non-empty draft plus pushback shows the text and enables Answer.
4. No copy change, no new control.

## Tests

- `renderCard` cases above.
- Desk: a session with pushback, a fake recognizer that returns a final transcript, mouseup, and the textarea contains that transcript with Answer enabled. Voice still does not POST.

## Run

`pnpm exec tsc -b`, then with `$env:HH_CASSETTE='replay'` run `pnpm --filter @hitchhiker/app test`. All exit 0.

## Commit

```
fix(app): keep a typed answer on the card during pushback
```
Do not push.
