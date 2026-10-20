/**
 * BUG-053. Design stages and the direction picker have a production caller.
 * A test-only mention does not count.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

test("advanceDesignStages, emitDesignStages, and the direction picker are called from the app", () => {
  const blob = sources(src).join("\n");
  assert.match(blob, /advanceDesignStages\(/);
  assert.match(blob, /emitDesignStages\(/);
  assert.match(blob, /renderDirectionPicker\(/);
  assert.match(blob, /presentDesignStage\(/);
  assert.match(blob, /approveDesignStage\(/);
});

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "test" || name === "node_modules") continue;
    const file = path.join(dir, name);
    const info = statSync(file);
    if (info.isDirectory()) {
      out.push(...sources(file));
      continue;
    }
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    out.push(readFileSync(file, "utf8"));
  }
  return out;
}
