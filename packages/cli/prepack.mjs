/**
 * Pack lifecycle: bundle first, then swap in the publish manifest.
 * A normal `node build.mjs` does not touch package.json.
 */
import { applyPackManifest } from "./pack-manifest.mjs";
import "./build.mjs";

await applyPackManifest();
