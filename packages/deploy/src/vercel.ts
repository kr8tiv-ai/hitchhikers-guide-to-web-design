/**
 * Vercel deploy gate for a static upload.
 *
 * Production and preview both require approved true. There is no preview exception.
 * Kind node is rejected because the Vercel template is not wired.
 * This file does not guess a Node build.
 *
 * Research 11 names the Vercel CLI (`vercel deploy`) as the transport.
 * This module does not start that program, does not read a token, and
 * does not invent a request header. The injected client closes over any
 * credential.
 *
 * A write response is queued, not finished. Poll the status function.
 * Never send the same write again.
 */

import { pollLoop } from "./poll.ts";

const MESSAGES = {
  approval: "Vercel deploy requires approval",
  node: "Vercel template is not wired",
  kind: "Vercel deploy kind must be static",
  unexpected: "unexpected Vercel poll state",
};

export function deployVercel(input: {
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
