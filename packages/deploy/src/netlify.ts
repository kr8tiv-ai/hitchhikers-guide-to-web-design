/**
 * Netlify deploy gate for a static upload.
 *
 * The control flow matches deployVercel. Kind node is rejected because
 * the Netlify template is not wired. This file does not guess a Node
 * build. Every call requires approved true.
 *
 * Research 11 names the Netlify CLI (`netlify deploy`) as the transport.
 * This module does not start that program, does not read a token, and
 * does not invent a request header. The injected client closes over any
 * credential. Nothing here logs a token.
 *
 * A write response is queued, not finished. Poll the status function.
 * Never send the same write again.
 */

import { pollLoop } from "./poll.ts";

const MESSAGES = {
  approval: "Netlify deploy requires approval",
  node: "Netlify template is not wired",
  kind: "Netlify deploy kind must be static",
  unexpected: "unexpected Netlify poll state",
};

export function deployNetlify(input: {
  approved: boolean;
  kind: "static" | "node";
  maxPolls: number;
  client: {
    upload: () => Promise<{ id: string }>;
    poll: (id: string) => Promise<"queued" | "completed" | "failed">;
  };
}): Promise<{ state: "completed" | "queued" | "failed"; uploads: number }> {
  return pollLoop(input, MESSAGES);
}
