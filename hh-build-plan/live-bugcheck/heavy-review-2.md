# SuperGrok Heavy review #2 (from Matt, Oct 9 1:06 AM CR)

Findings (verify each against current main before fixing):
1. Quick start `npx hitchhikers-guide` 404s: package not on npm. Rewrite Quick start for a git clone (Node >=22.18, corepack enable, pnpm 10.32.1, pnpm install, pnpm exec hh doctor, pnpm exec hh app --project <dir> --no-open). Keep npx only as a future note; don't claim the desk starts from a lone CLI install.
2. Entry fails without pnpm install (ERR_MODULE_NOT_FOUND @hitchhiker/engine). Document; doctor should detect.
3. hh bin is a .ts file; Node 22.0-22.17 die with ERR_UNKNOWN_FILE_EXTENSION. Either shebang `#!/usr/bin/env -S node --experimental-strip-types` (Windows-safe via pnpm shim?) or raise engines to >=22.18 and say so in README. Add test. Keep imports erasable.
4. A published CLI can't start the desk (app.ts loads ../../../app/src/server/server.ts; files list only src and dist). Document/clear message.
5. Unknown commands fall through to the `hh doctor [--project]` usage. Print the real command table (implemented vs skill-only slash commands), exit 2, don't run doctor.
6. README Develop is stale: root package.json does have "test": "pnpm -r test". Update it.
7. /brand shows "The kit is not printed yet" on a fresh project, so it looks stuck. Add a clear next step/CTA.
8. There's no /settings route. The STT rate quote ($0.10/hr REST, $0.20/hr streaming, from packages/voice xai-stt.ts) has to be shown and accepted before xAI STT can be enabled. Add a route + test. (Fix 009 may have added the rate to /hh-settings in the plugin; check before duplicating.)
9. hh doctor only warns when grok is missing, but the build needs it. Make it a failure (nonzero exit) when grok is missing; keep the warnings for playwright, whisper and pdftotext.
10. Windows hh vs System32\hh.exe: verify fix 010 holds and doctor detects the wrong shim.
