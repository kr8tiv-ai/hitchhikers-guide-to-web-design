/**
 * 250i. Real Grok build of the towel sample.
 * Skipped unless HH_REAL_GROK_E2E=1. CI leaves that unset.
 */
import { test } from "node:test";
import { parseRealGrokE2eScope, REAL_GROK_E2E_SKIP, runRealGrokTowelE2e } from "./real-grok-e2e-250i.ts";

const scope = parseRealGrokE2eScope(process.env);

test(
  "real Grok builds the towel sample into dist and reviews it",
  {
    skip: process.env.HH_REAL_GROK_E2E === "1" ? false : REAL_GROK_E2E_SKIP,
    timeout: scope.minutes * 60_000 + 30_000,
  },
  async () => {
    await runRealGrokTowelE2e();
  },
);
