/**
 * Shapes for an approved Hostinger deploy.
 *
 * The transport is injected. This package does not name a REST path.
 * The live method list must be read from the Hostinger MCP schema at
 * integration time.
 */

export interface DeployFile {
  path: string;
  bytes: number;
}

export type DeployKind = "static" | "node";

/** Poll values. "queued" means the write is not finished. */
export type DeployPollState = "queued" | "completed" | "failed";

export interface DeployResult {
  state: "completed" | "queued" | "failed";
  uploads: number;
}

/**
 * Injected Hostinger client. uploadStatic sends prebuilt files.
 * uploadNode sends an archive the host builds. poll reads status for
 * the id from that one write. Agency overwrite tools are not on this
 * client.
 */
export interface HostingerClient {
  uploadStatic: () => Promise<{ id: string }>;
  uploadNode: () => Promise<{ id: string }>;
  poll: (id: string) => Promise<DeployPollState>;
}

export interface DeployHostingerInput {
  approved: boolean;
  kind: DeployKind;
  files: DeployFile[];
  maxPolls: number;
  client: HostingerClient;
}
