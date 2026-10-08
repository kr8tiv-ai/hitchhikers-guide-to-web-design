import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { quoteStt } from "../src/index.ts";

const voiceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("hh-settings renders quoteStt labels before xAI speech-to-text can be turned on", () => {
  const skill = readFileSync(
    path.join(voiceRoot, "..", "grok-plugin", "skills", "hh-settings", "SKILL.md"),
    "utf8",
  );
  const rest = quoteStt({ seconds: 3_600, mode: "rest" });
  const streaming = quoteStt({ seconds: 3_600, mode: "streaming" });
  assert.equal(rest.ratePerHour, 0.1);
  assert.equal(streaming.ratePerHour, 0.2);
  assert.equal(rest.usd, 0.1);
  assert.equal(streaming.usd, 0.2);

  const restAt = skill.indexOf(rest.label);
  const streamAt = skill.indexOf(streaming.label);
  assert.ok(restAt >= 0, rest.label);
  assert.ok(streamAt >= 0, streaming.label);

  const stayOff = skill.indexOf(
    "xAI speech-to-text stays off until those lines have been shown.",
  );
  const turnOn = skill.indexOf(
    "Do not turn it on until the user has seen both lines and agreed.",
  );
  assert.ok(stayOff > restAt);
  assert.ok(stayOff > streamAt);
  assert.ok(turnOn > restAt);
  assert.ok(turnOn > streamAt);

  assert.match(skill, /Local whisper\.cpp is the default speech engine\./);
  assert.equal(/xAI speech-to-text is the default/.test(skill), false);
});
