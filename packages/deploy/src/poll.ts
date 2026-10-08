/**
 * Upload-once poll loop for the static host adapters.
 *
 * No module-level state. The Hostinger module does not import this file,
 * so a Vercel, Netlify, or Cloudflare attempt cannot move a Hostinger
 * counter, and the hosts cannot move each other.
 *
 * A write response is queued, not finished. Poll the status function.
 * Never send the same write again.
 */

export interface StaticDeployClient {
  upload: () => Promise<{ id: string }>;
  poll: (id: string) => Promise<"queued" | "completed" | "failed">;
}

export interface StaticDeployInput {
  approved: boolean;
  kind: "static" | "node";
  maxPolls: number;
  client: StaticDeployClient;
}

export interface StaticDeployResult {
  state: "completed" | "queued" | "failed";
  uploads: number;
}

export interface PollLoopMessages {
  approval: string;
  node: string;
  kind: string;
  unexpected: string;
}

function readUploadId(uploaded: unknown): string {
  if (typeof uploaded !== "object" || uploaded === null || !("id" in uploaded)) {
    throw new Error("upload returned an empty id");
  }
  const id = uploaded.id;
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error("upload returned an empty id");
  }
  return id;
}

/**
 * Gate, upload once, then poll. Approval is checked on every call,
 * including kind node, so a second host cannot weaken the yes rule.
 * Kind node throws before upload. Queued, failed, and a thrown poll
 * do not upload again.
 */
export async function pollLoop(
  input: StaticDeployInput,
  messages: PollLoopMessages,
): Promise<StaticDeployResult> {
  if (input.approved !== true) {
    throw new Error(messages.approval);
  }
  if (input.kind === "node") {
    throw new Error(messages.node);
  }
  if (input.kind !== "static") {
    throw new Error(messages.kind);
  }
  if (!Number.isInteger(input.maxPolls) || input.maxPolls < 1) {
    throw new Error("maxPolls must be a positive integer");
  }

  const uploaded: unknown = await input.client.upload();
  const uploads = 1;
  const id = readUploadId(uploaded);

  for (let attempt = 0; attempt < input.maxPolls; attempt += 1) {
    const state: string = await input.client.poll(id);
    if (state === "completed" || state === "failed") {
      return { state, uploads };
    }
    if (state !== "queued") {
      throw new Error(messages.unexpected);
    }
  }

  return { state: "queued", uploads };
}
