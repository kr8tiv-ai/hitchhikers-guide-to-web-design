export const PACKAGE_NAME = "@hitchhiker/knowledge";
export { lintPackClaims, parsePack } from "./pack.ts";
export type { PackMeta } from "./pack.ts";
export { loadGolden } from "./golden.ts";
export type { GoldenTemplates } from "./golden.ts";
export {
  REMIX_DETAIL,
  REMIX_LINE,
  buildDesignIndex,
  formatSelection,
  loadDesignEntries,
  loadDesignIndex,
  selectDesignEntries,
  selectionHasBan,
  validateDesignEntry,
} from "./design-library.ts";
export type { DesignEntry, DesignIndex, SelectInput } from "./design-library.ts";
export { ingestPolicy, robotsAllow } from "./ingest-policy.ts";
export { addLibraryUrl, recheckLibrary, runIngest } from "./ingest-pipeline.ts";
export { checkPacks, classifyBump, missingPackFields, packIsStale } from "./packs-check.ts";
