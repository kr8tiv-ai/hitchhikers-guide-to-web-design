# Live bug check: run order

Started Oct 9, 2026 after the live demo of `hh app`. Each prompt is one job and one commit, run through Grok Build with `grok-4.7` at `--effort xhigh` (same runner flags and deny list as `C:\Users\lucid\hh-post159\run-fix.ps1`). The steward runs `tsc -b` and the touched packages' tests after each commit, then the full suite, e2e, and a smoke run of `hh app` + `hh doctor` before pushing.

0. `BUGCHECK.md`: audit only. Writes `REPORT.md` and prompts 006+. Runs first so its evidence can feed the fixes, but it changes no code.
1. `001-cassette-env-guard`: blocker. A leaked `HH_CASSETTE=replay` made every live Guide turn fail. The guard comes first because every later test and smoke run depends on knowing which mode the app is in.
2. `002-no-new-windows`: blocker for daily use on Windows. Windows popping up during a session; fixed before anything that adds more child processes.
3. `003-turn-errors-on-the-desk`: high. "The answer did not save" hid the real cause and froze the card. Builds on 001's error type.
4. `004-hold-to-talk-in-a-browser`: high. Verifies 9010874 in Chromium and fixes anything the real browser path exposes.
5. `005-reference-site-sources`: feature Matt asked for live. DP-5.1 shows where to find great sites.
6. `006-stale-turn-does-not-skip`: blocker. A failed Guide turn has already saved the answer, and the next click writes that text onto the next question. First of the new prompts, and after 003, because 003 changes the sentence and this one stops the write.
7. `007-crash-leftovers`: high. A half-written `STATE.md.lock` or `interview.json` never clears, so a kill leaves the desk dead. After 006 so the turn fix and the crash leftover are not the same commit.
8. `008-windows-rename-retry`: high. `EPERM` on a locked `STATE.md` fails the save after `interview.json` has already moved. After 007 because both edit the lock helper, and 008 only adds the retry.
9. `009-grok-help-once`: high. Every live `think()` runs `grok --help` in the project before the real call. After the data-loss fixes. 002 hides the console; this stops the extra process. Replay does not spawn it, so it is not the cassette-miss demo's windows.
10. `010-pushback-keeps-the-draft`: medium. A re-render during pushback clears the new answer and disables Answer. Last, because 004 may already have edited the desk and the card.
