import "@hitchhiker/engine";

export const PACKAGE_NAME = "@hitchhiker/deploy";

export { deployHostinger, prepareNodeArchive } from "./hostinger.ts";
export type {
  DeployFile,
  DeployHostingerInput,
  DeployPollState,
  DeployResult,
  HostingerClient,
} from "./hostinger.ts";
