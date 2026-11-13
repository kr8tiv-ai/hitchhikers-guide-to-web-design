/**
 * Fake sketch provider for the 260d browser test. It writes a log and does not call the network.
 */
import { appendFileSync } from "node:fs";
import type { RenderDeskProvider } from "@hitchhiker/engine";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function note(kind: string, aspect: string, prompt: string): void {
  const file = process.env.HH_E2E_COMP_LOG;
  if (file === undefined || file === "") return;
  appendFileSync(file, `${JSON.stringify({ kind, aspect, prompt })}\n`);
}

export const provider: RenderDeskProvider = {
  generateImage(req) {
    note("generate", req.aspect, req.prompt);
    return Promise.resolve([{ b64: PNG }]);
  },
  editImage(req) {
    note("edit", req.aspect ?? "", req.prompt);
    return Promise.resolve({ images: [{ b64: PNG }] });
  },
};
