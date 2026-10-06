import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyHelp } from "../src/index.ts";

const UUID_HELP = [
  "Usage: grok [flags]",
  "",
  "-s, --session-id <UUID>",
  "    Use a specific UUID for a new session.",
  "",
  "--cwd <PATH>",
].join("\n");

const ALIAS_HELP = [
  "Usage: grok [flags]",
  "",
  "-s, --session-id <ID>",
  "    Create or resume a session name.",
].join("\n");

const BOTH_HELP = [
  "-s, --session-id <UUID>",
  "    A session name is also shown here.",
].join("\n");

test("uuid-only help maps to uuid", () => {
  assert.equal(classifyHelp(UUID_HELP).sessionIdMode, "uuid");
  assert.equal(classifyHelp("--session-id <Uuid>\n").sessionIdMode, "uuid");
  assert.equal(classifyHelp("-s <UUID>\n").sessionIdMode, "uuid");
  const distantName = `--session-id <UUID>\n${"x".repeat(80)} name`;
  assert.equal(classifyHelp(distantName).sessionIdMode, "uuid");
});

test("alias-only help maps to alias", () => {
  assert.equal(classifyHelp(ALIAS_HELP).sessionIdMode, "alias");
  assert.equal(classifyHelp("--session-id <name>\n").sessionIdMode, "alias");
  assert.equal(classifyHelp(ALIAS_HELP.replaceAll("\n", "\r\n")).sessionIdMode, "alias");
});

test("help that mentions both uuid and a session name maps to unknown", () => {
  assert.equal(classifyHelp(BOTH_HELP).sessionIdMode, "unknown");
  const split = ["--session-id <UUID>", "", "-s", "    session name"].join("\n");
  assert.equal(classifyHelp(split).sessionIdMode, "unknown");
});

test("effortFlag is true only when --effort appears", () => {
  assert.equal(classifyHelp(UUID_HELP).effortFlag, false);
  assert.equal(classifyHelp(ALIAS_HELP).effortFlag, false);
  assert.equal(classifyHelp(BOTH_HELP).effortFlag, false);
  assert.equal(classifyHelp("the word effort without the flag").effortFlag, false);
  const withFlag = `${UUID_HELP}\n\n--effort <LEVEL>\n`;
  assert.equal(classifyHelp(withFlag).effortFlag, true);
  assert.equal(classifyHelp(withFlag).sessionIdMode, "uuid");
});

test("session inside sessionStorage is not evidence", () => {
  assert.equal(
    classifyHelp("sessionStorage keeps a session name and a UUID.").sessionIdMode,
    "unknown",
  );
  const trap = [
    "sessionStorage keeps a session name for the tab.",
    "",
    "-s, --session-id <UUID>",
    "    Use a UUID for a new session.",
  ].join("\n");
  assert.equal(classifyHelp(trap).sessionIdMode, "uuid");
});

test("a session flag with neither signal stays unknown", () => {
  assert.equal(
    classifyHelp("--session-id <ID>\nA new session for this run.\n").sessionIdMode,
    "unknown",
  );
  assert.equal(classifyHelp("").sessionIdMode, "unknown");
});
