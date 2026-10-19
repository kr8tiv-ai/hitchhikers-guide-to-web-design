/**
 * Weekly pack version check. Manual. Injected here as the real registry fetch.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPacks } from "../src/packs-check.ts";

const packs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "packs");
const names = ["three", "r3f", "drei", "gsap", "lenis", "motion-lib", "audio", "stack-astro"];
const results = await checkPacks(packs, names, globalThis.fetch);
for (const result of results) {
  console.log(`${result.name} ${result.bump} ${result.from} -> ${result.to} ${result.wrote}`);
}
