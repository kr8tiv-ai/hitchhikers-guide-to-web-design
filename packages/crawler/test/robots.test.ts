import assert from "node:assert/strict";
import { test } from "node:test";
import { USER_AGENT, allowed, parseRobots, ROBOTS_MAX_CHARS } from "../src/index.ts";

const HOME = "http://example.com/";
const ADMIN = "http://example.com/admin";
const ADMIN_CHILD = "http://example.com/admin/settings";
const ADMIN_SIBLING = "http://example.com/administrator";
const SECRET = "http://example.com/secret";
const OTHER = "http://example.com/public";

test("Disallow / for * denies every path on the host", () => {
  const body = "User-agent: *\nDisallow: /\n";
  assert.equal(allowed(HOME, body, USER_AGENT), false);
  assert.equal(allowed(OTHER, body, USER_AGENT), false);
  assert.equal(allowed("http://example.com/any/deep?q=1", body, USER_AGENT), false);
});

test("Disallow /admin denies that path and its children only", () => {
  const body = "User-agent: *\nDisallow: /admin\n";
  assert.equal(allowed(ADMIN, body, USER_AGENT), false);
  assert.equal(allowed(`${ADMIN}/`, body, USER_AGENT), false);
  assert.equal(allowed(ADMIN_CHILD, body, USER_AGENT), false);
  assert.equal(allowed(HOME, body, USER_AGENT), true);
  assert.equal(allowed(OTHER, body, USER_AGENT), true);
  assert.equal(allowed(ADMIN_SIBLING, body, USER_AGENT), true);
  assert.equal(allowed("http://example.com/Admin", body, USER_AGENT), true);
});

test("an empty Disallow allows", () => {
  const body = "User-agent: *\nDisallow:\n";
  assert.equal(allowed(HOME, body, USER_AGENT), true);
  assert.equal(allowed(ADMIN, body, USER_AGENT), true);
  assert.equal(allowed(SECRET, body, USER_AGENT), true);
});

test("* applies when no specific block matches", () => {
  const body = ["User-agent: OtherBot", "Disallow: /", "", "User-agent: *", "Disallow: /secret"].join(
    "\n",
  );
  assert.equal(allowed(SECRET, body, USER_AGENT), false);
  assert.equal(allowed(OTHER, body, USER_AGENT), true);
});

test("a specific product token beats *", () => {
  const body = [
    "User-agent: *",
    "Disallow: /secret",
    "",
    "User-agent: HitchhikerGuideBot",
    "Disallow:",
  ].join("\n");
  assert.equal(allowed(SECRET, body, USER_AGENT), true);
  assert.equal(allowed(SECRET, body, "SomeoneElse/1.0"), false);
});

test("the longest matching product token wins", () => {
  const body = [
    "User-agent: Hitchhiker",
    "Disallow: /public",
    "",
    "User-agent: HitchhikerGuideBot",
    "Disallow: /secret",
  ].join("\n");
  assert.equal(allowed(SECRET, body, USER_AGENT), false);
  assert.equal(allowed(OTHER, body, USER_AGENT), true);
});

test("a short token that is not a prefix does not steal the * group", () => {
  const body = ["User-agent: Bot", "Disallow:", "", "User-agent: *", "Disallow: /secret"].join("\n");
  assert.equal(allowed(SECRET, body, USER_AGENT), false);
});

test("an exact user-agent value with version matches", () => {
  const body = `User-agent: ${USER_AGENT}\nDisallow: /secret\n`;
  assert.equal(allowed(SECRET, body, USER_AGENT), false);
  assert.equal(allowed(OTHER, body, USER_AGENT), true);
});

test("comments, blank lines, and unknown directives do not change Disallow", () => {
  const body = [
    "# comment",
    "User-agent: * # everyone",
    "Allow: /secret",
    "Crawl-delay: 10",
    "Sitemap: http://example.com/sitemap.xml",
    "Disallow: /secret # keep out",
  ].join("\r\n");
  assert.equal(allowed(SECRET, body, USER_AGENT), false);
  assert.equal(allowed(OTHER, body, USER_AGENT), true);
});

test("rules before the first User-agent are ignored", () => {
  const body = "Disallow: /\nUser-agent: *\nDisallow:\n";
  assert.equal(allowed(HOME, body, USER_AGENT), true);
});

test("an empty robots body allows", () => {
  assert.equal(allowed(HOME, "", USER_AGENT), true);
});

test("an unparseable URL is not allowed", () => {
  assert.equal(allowed("not a url", "User-agent: *\nDisallow:\n", USER_AGENT), false);
});

test("parseRobots keeps user-agent groups and stops at 500 KiB", () => {
  const parsed = parseRobots("User-agent: *\nDisallow: /admin\n\nUser-agent: Other\nDisallow: /\n");
  assert.equal(parsed.oversized, false);
  assert.equal(parsed.groups.length, 2);
  const first = parsed.groups[0];
  const second = parsed.groups[1];
  assert.ok(first);
  assert.ok(second);
  assert.deepEqual(first.agents, ["*"]);
  assert.deepEqual(first.disallows, ["/admin"]);
  assert.deepEqual(second.agents, ["Other"]);
  assert.deepEqual(second.disallows, ["/"]);

  const atCap = "User-agent: *\nDisallow:\n".padEnd(ROBOTS_MAX_CHARS, " ");
  assert.equal(atCap.length, ROBOTS_MAX_CHARS);
  assert.equal(parseRobots(atCap).oversized, false);
  assert.equal(allowed(SECRET, atCap, USER_AGENT), true);

  const hostile = "a".repeat(ROBOTS_MAX_CHARS + 1);
  const rejected = parseRobots(hostile);
  assert.equal(rejected.oversized, true);
  assert.deepEqual(rejected.groups, []);
  assert.equal(allowed(HOME, hostile, USER_AGENT), false);
});
