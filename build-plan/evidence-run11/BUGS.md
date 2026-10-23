# Run 11 BUGS.md (main d529dde5)

## Bugs (Run 11, d529dde5)
- BUG-067 (S3) Tour still far below the fold / not brought into view. Repro: splash > Enter the Guide > Create project (1440x900). Page reloads to the splash at scrollY 0; the [data-tour] card sits at y=2392. Desk menu > Replay tour: still y=2392, no scroll, focus stays on BODY. Tries: 2. Shots: shots\step-004.png, shots\tour-replay.png, shots\tour-visible.png. (Re-test of the Run 9 "tour too far down" candidate: FAIL.)
- OBS (S4 candidate) Interview turns slow: 68-258 s per turn (avg ~3 min) at the default Extra high (config effort "medium" not picked -> interviewEffort() returns xhigh by design, interview-call.ts). ai.ndjson shows context-summary 50-125 s finishing at the same moment as "Writing the next question" (e.g. 21:31:44Z vs 21:31:45Z) — 249b may not have taken it off the critical path. Log: site\.hitchhiker\logs\ai.ndjson.

## Re-tests so far
- Tour Escape: Esc with BODY focus closes the tour -> PASS (Run 9 candidate fixed). Esc while the answer textarea has focus does not close it (reasonable; noted).
- Tour position: FAIL (BUG-067).
- Split TypeError (desk-run-10 step 13): desk-run-10 PROGRESS/BUGS say it was the run10 driver loop crashing when the last card had no next question id (driver bug, not desk). Re-check at the real end of the interview: PENDING.
