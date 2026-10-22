/** Put the git package.json back after npm pack. */
import { restorePackManifest } from "./pack-manifest.mjs";

await restorePackManifest();
