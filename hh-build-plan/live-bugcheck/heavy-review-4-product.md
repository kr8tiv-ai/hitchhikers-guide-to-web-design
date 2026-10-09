# SuperGrok Heavy review #4: product and ship path (from Matt, Oct 9 1:14 AM CR)
Overlaps with reviews #2 and #3. Dedupe, but include these new points:
1. Distribution: a fresh user following the README never reaches the desk. Fix the clone path (Node 22.18+, pnpm 10.32.1, pnpm exec hh doctor, pnpm exec hh app).
2. Unknown commands: hh drive and hh dont-panic print the doctor usage. Show a table of implemented commands versus skill-only ones.
3. NEW: .hh-driver/run-build.ps1 is Windows-only, and it is what walks the prompt queue (a fresh Grok session per prompt, then a push). Add a documented, cross-platform queue runner for macOS and Linux (e.g. a Node/TS `hh drive` or `run-build.sh`) with the same safety: one prompt per session, tests, no force push. Wire it into Drive so the queue isn't empty off Windows.
4. Babel Fish, Deep Thought and launch are mostly skills and files, not desk actions. Each empty plate needs one honest next action (finish the brief, approve the prompts, or wait for a queue). In Drive, the Pause, Approve, Elevate and Deploy buttons look available when they aren't.
5. Settings: voice, model, effort and the xAI STT rate behind an accept, in a Desk menu.
6. NEW: depth visibility. Show the mode (Deep or Express; Express defers questions rather than dropping them), how many questions are left, and which answers are assumptions on the card.
7. Suggest and Skip: show the assumption that was written on the next card.
8. NEW docs drift:
   - README Develop is wrong about the root test script.
   - The once-over REPORT.md still lists fixes that are already applied.
   - CONTEXT-PACKAGE.md still carries the withdrawn GSAP MIT-fallback language. Remove it and align with DECISIONS.md.
   - Make the docs match the code so later Grok runs don't redo or undo decisions.
9. NEW: show the hh doctor report on the desk's first run, and don't show "Ready" while grok isn't on PATH. Doctor should exit nonzero when grok is missing.
Don't change: the editorial system (cream, rust, Bricolage, Literata, the one-question card), the anti-slop rules, the approval gates, or "nothing deploys without a yes". Don't weaken any gates.
Heavy's order: 1 clone path; 2 command table plus a non-Windows queue runner; 3 progress, mode and assumption state on the card; 4 empty plates with one next action; 5 Settings with the rate accept; 6 README and once-over report aligned with the code.
