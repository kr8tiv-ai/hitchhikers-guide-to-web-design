# Real Grok e2e

This check builds the towel sample with a live Grok session. It stays skipped unless you opt in. CI leaves `HH_REAL_GROK_E2E` unset, so CI reports the test as skipped.

```
pnpm --filter @hitchhiker/orchestrator run e2e:real
```

The script sets `HH_REAL_GROK_E2E=1` and clears `HH_CASSETTE`, so the brief is drafted live. Scope:

- `HH_REAL_GROK_E2E_MAX_PROMPTS` defaults to 3: the scaffold prompt and the first two section layouts. A larger value continues through the rest of the build queue, up to 999.
- `HH_REAL_GROK_E2E_MINUTES` defaults to 60.

The run copies `samples/towel-day.hhproject` into a fresh temp project, opens it the way `hh` resumes a project file, approves the brief and the plan through the engine, passes the design stages, and builds with `grok-4.7-build-fast` at effort `xhigh`. It then runs the project's build script and the desk QA review on `dist/`.

The temp project stays on disk. The run prints the path of `<project>/.hitchhiker/e2e-250i.json`, which lists the prompt ids that passed and each gate name with its verdict.
