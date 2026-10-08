/**
 * Cloudflare deploy gate for a static upload.
 *
 * Kind node is rejected until a later template says otherwise. The
 * Cloudflare template is not wired, and this file does not guess a
 * Worker build. Every call requires approved true.
 *
 * DNS and worker changes are a different command the Guide does not run.
 * Name-server records stay outside this upload. This wrapper has no
 * method for them.
 *
 * Research 11 names Workers static assets as the transport. This module
 * does not start that program, does not read a token or an account id,
 * and does not invent a request header. The injected client closes over
 * any credential.
 *
 * A write response is queued, not finished. Poll the status function.
 * Never send the same write again.
 */

import { pollLoop } from "./poll.ts";

const MESSAGES = {
  approval: "Cloudflare deploy requires approval",
  node: "Cloudflare template is not wired",
  kind: "Cloudflare deploy kind must be static",
  unexpected: "unexpected Cloudflare poll state",
};

export function deployCloudflare(input: {
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
