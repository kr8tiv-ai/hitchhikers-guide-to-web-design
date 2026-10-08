/**
 * Hostinger deploy gate for static files and Node archives.
 *
 * Static uploads send prebuilt files. There is no second build.
 * Node uploads send an archive that excludes node_modules and stays at
 * or under 50 MB. The host builds that archive.
 *
 * Handoff note Node versions: 18, 20, 22, and 24.
 * CONTEXT-PACKAGE.v2.md section 13 names Node 20 or 22 LTS. The research
 * addendum records the Hostinger Node.js doc: 18, 20 (LTS), 22 (LTS),
 * and 24. This comment follows that doc. It does not guess a newer line.
 *
 * The live method list must be read from the Hostinger MCP schema at
 * integration time. This module does not invent a REST path. The caller
 * injects the client, so a credential stays outside this file. Agency
 * overwrite tools are not called.
 *
 * A write response is queued, not finished. Poll the status function.
 * Never send the same write again.
 */

import type { DeployFile, DeployHostingerInput, DeployResult } from "./types.ts";

export type {
  DeployFile,
  DeployHostingerInput,
  DeployPollState,
  DeployResult,
  HostingerClient,
} from "./types.ts";

/** Hostinger Connector cap. A total equal to the cap is still allowed. */
const NODE_ARCHIVE_BYTE_CAP = 50 * 1024 * 1024;

function containsNodeModules(filePath: string): boolean {
  return filePath.toLowerCase().includes("node_modules");
}

/**
 * Check a Node archive before upload. Sizes are injected, so the check
 * does not read the files and does not build a zip in this process.
 */
export function prepareNodeArchive(files: readonly DeployFile[]): { bytes: number } {
  if (files.length === 0) {
    throw new Error("file list is empty");
  }

  for (const file of files) {
    if (containsNodeModules(file.path)) {
      throw new Error("node archive cannot contain node_modules");
    }
  }

  let bytes = 0;
  for (const file of files) {
    if (!Number.isFinite(file.bytes) || file.bytes < 0) {
      throw new Error("file byte count must be a non-negative finite number");
    }
    bytes += file.bytes;
  }

  if (bytes > NODE_ARCHIVE_BYTE_CAP) {
    throw new Error("node archive exceeds 50 MB");
  }

  return { bytes };
}

/**
 * Upload once after approval, then poll. A queued status does not upload
 * again. maxPolls is the caller's cap when the host stays queued.
 */
export async function deployHostinger(input: DeployHostingerInput): Promise<DeployResult> {
  if (input.approved !== true) {
    throw new Error("Hostinger deploy requires approval");
  }
  if (!Number.isInteger(input.maxPolls) || input.maxPolls < 1) {
    throw new Error("maxPolls must be a positive integer");
  }
  if (input.kind !== "static" && input.kind !== "node") {
    throw new Error("deploy kind must be static or node");
  }
  if (input.files.length === 0) {
    throw new Error("file list is empty");
  }
  if (input.kind === "node") {
    prepareNodeArchive(input.files);
  }

  let uploads = 0;
  const uploaded =
    input.kind === "static"
      ? await input.client.uploadStatic()
      : await input.client.uploadNode();
  uploads += 1;

  if (typeof uploaded.id !== "string" || uploaded.id.trim() === "") {
    throw new Error("upload returned an empty id");
  }

  // Poll only. Queued is not a reason to call upload again.
  for (let attempt = 0; attempt < input.maxPolls; attempt += 1) {
    const state: string = await input.client.poll(uploaded.id);
    if (state === "completed" || state === "failed") {
      return { state, uploads };
    }
    if (state !== "queued") {
      throw new Error("unexpected Hostinger poll state");
    }
  }

  return { state: "queued", uploads };
}
