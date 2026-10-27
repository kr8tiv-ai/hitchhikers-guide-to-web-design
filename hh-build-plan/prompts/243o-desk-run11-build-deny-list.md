# 243o: Desk Run 11 - Remove unsupported List() tool prefix from site-confine --deny flags (BUG-096)

## Context & Root Cause

In Desk Tester Run 11 (site-c, Paradise Found Run Eleven C), clicking Start build on /approve (after e247f93d CI/E2E passed green) generated all 121 build prompts and transitioned to /hh-dashboard (04 IMPROBABILITY DRIVE), where prompt 001 immediately exited with code 1 in 198 ms and paused the queue:

Error: --deny "List(C:/Users/lucid/Desktop/desk-e2e-run11)": unknown tool prefix: List; --deny "List(C:/Users/lucid/Desktop/desk-e2e-run11/A11.ps1/**)": unknown tool prefix: List;

Screenshot: C:\Users\lucid\Desktop\desk-e2e-run11\shots\340-dashboard-failed-list.png.

### Root Cause
In packages/engine/src/guide/site-confine.ts line 22:
const TOOLS = ["Read", "Grep", "Glob", "List", "Edit", "Write"] as const;
The grok CLI (0.0.15) accepts Read, Grep, Glob, Edit, Write (plus Bash, MCPTool, WebFetch, WebSearch) in --deny "<Tool>(<pattern>)", and rejects List(...) with unknown tool prefix: List.
Post-run outside-access auditing (auditOutsideAccess in packages/engine/src/guide/site-confine.ts) already inspects list_dir events in the NDJSON stream via PATH_KEYS, which is unaffected by the CLI --deny flag list.

## Requirements

1. packages/engine/src/guide/site-confine.ts:
   - Remove "List" from TOOLS so it reads: const TOOLS = ["Read", "Grep", "Glob", "Edit", "Write"] as const;
   - Keep auditOutsideAccess and all post-run NDJSON path auditing (list_dir, etc.) intact.

2. packages/engine/test/site-build-043.test.ts:
   - Update/extend the confinement args test so it explicitly asserts that buildConfinementArgs and buildSpawnArgs still emit Read(, Grep(, Glob(, Edit(, Write(, and Bash( --deny rules for parent/sibling/home paths, and never emit any --deny rule starting with List(.

## Verification Gate (Targeted Only - Keep Fast)

Run ONLY the targeted tests and typecheck:
pnpm --filter @hitchhikers-guide/engine typecheck
node --import tsx --test packages/engine/test/site-build-043.test.ts packages/engine/test/site-build-034.test.ts

Do NOT run the full monorepo test suite inside this session. Commit with message:
fix(engine): remove unsupported List tool prefix from site-confine --deny args (243o)