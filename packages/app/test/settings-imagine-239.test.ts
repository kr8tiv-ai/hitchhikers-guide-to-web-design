import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadConfig } from "@hitchhiker/engine";
import { driverFor } from "../src/server/imagine-browser.ts";
import { applySettingsPost, renderSettingsMain } from "../src/server/settings.ts";
import { removeTempDir } from "./remove-temp.ts";

test("Imagine in the browser is off until the checkbox is saved", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-settings-239-"));
  try {
    const current = loadConfig(dir);
    const body = `voice=local&model=${encodeURIComponent(current.ai.model)}&effort=${encodeURIComponent(current.effort)}`;
    const saved = await applySettingsPost(dir, body, "application/x-www-form-urlencoded");
    assert.equal(saved.status, 200);
    assert.equal(saved.view.imagineBrowser, false);
    const media = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "assets", "media.json"), "utf8")) as { browser: boolean };
    assert.equal(media.browser, false);
    const html = renderSettingsMain(saved.view, "token", null);
    assert.match(html, /data-imagine-browser \/>/);
    assert.match(html, /You sign in to your own Grok account yourself/);
    assert.match(html, /billed per use/);
    const on = await applySettingsPost(dir, `${body}&imagineBrowser=yes`, "application/x-www-form-urlencoded");
    assert.equal(on.status, 200);
    assert.equal(on.view.imagineBrowser, true);
    const next = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "assets", "media.json"), "utf8")) as { browser: boolean };
    assert.equal(next.browser, true);
    let built = 0;
    const skipped = await driverFor(false, async () => {
      built += 1;
      throw new Error("the driver must not be built");
    });
    assert.equal(skipped, undefined);
    assert.equal(built, 0);
  } finally {
    removeTempDir(dir);
  }
});
