/**
 * 241l. The desk records a direction the person picks.
 * No deal means no picker and no decision log.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { decisionLogPath, readDecisionLog, rejectedDirectionNames, writeBrandKit } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";

function tempProject(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-direction-desk-"));
}

async function withDesk(dir: string, run: (handle: ServerHandle) => Promise<void>): Promise<void> {
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      open: false,
      turnHandler: async () => ({ next: null, events: [] }),
      spawn() {
        throw new Error("browser spawn was not expected");
      },
    });
    assert.notEqual(handle.port, 4175);
    await run(handle);
  } finally {
    if (handle !== undefined) await handle.close();
  }
}

function tokenFrom(html: string): string {
  const matched = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(html);
  assert.ok(matched?.[1]);
  return matched[1];
}

async function postDirection(
  url: string,
  token: string,
  body: unknown,
): Promise<{ status: number; text: string }> {
  const response = await fetch(new URL("/api/direction", url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-hh-csrf": token },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
}

test("a desk pick writes the log and the next page hides the buttons", async () => {
  const dir = tempProject();
  try {
    writeBrandKit(dir, []);
    assert.equal(existsSync(decisionLogPath(dir)), false);
    await withDesk(dir, async (handle) => {
      const home = await fetch(new URL("/", handle.url));
      const html = await home.text();
      assert.equal(home.status, 200);
      const button = /data-pick-direction="([^"]+)">([^<]+)</.exec(html);
      assert.ok(button?.[1]);
      assert.ok(button[2]);
      assert.match(html, /\/client\/direction\.js/);
      const script = await fetch(new URL("/client/direction.js", handle.url));
      assert.equal(script.status, 200);
      const source = await script.text();
      assert.match(source, /A pick needs a one-line reason/);
      assert.equal(source.includes("import "), false);
      const brand = await fetch(new URL("/brand", handle.url));
      assert.match(await brand.text(), new RegExp(`data-pick-direction="${button[1]}"`));
      const token = tokenFrom(html);
      const blank = await postDirection(handle.url, token, { id: button[1], reason: "  " });
      assert.equal(blank.status, 400);
      assert.match(blank.text, /one-line reason/);
      assert.equal(existsSync(decisionLogPath(dir)), false);
      const posted = await postDirection(handle.url, token, { id: button[1], reason: "The quieter page fits the brief." });
      assert.equal(posted.status, 200);
      const payload = JSON.parse(posted.text) as { ok?: boolean; pickedId?: string; rejected?: string[] };
      assert.equal(payload.ok, true);
      assert.equal(payload.pickedId, button[1]);
      assert.equal(payload.rejected?.includes(button[2]), false);
      assert.equal((payload.rejected ?? []).length, 2);
      const log = readDecisionLog(dir);
      assert.equal(log.some((row) => row.status === "picked" && row.id === button[1]), true);
      assert.deepEqual(rejectedDirectionNames(dir), payload.rejected);
      const after = await fetch(new URL("/", handle.url));
      const next = await after.text();
      assert.match(next, /data-change-direction/);
      assert.match(next, /data-direction-choices hidden/);
      assert.match(next, new RegExp(`Picked ${button[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      const ids = [...html.matchAll(/data-pick-direction="([^"]+)"/g)].map((match) => match[1] ?? "");
      const second = ids.find((id) => id !== button[1]);
      assert.ok(second);
      const changed = await postDirection(handle.url, token, { id: second, reason: "The second page fits the brief better." });
      assert.equal(changed.status, 200);
      const again = JSON.parse(changed.text) as { pickedId?: string };
      assert.equal(again.pickedId, second);
      const both = readDecisionLog(dir).filter((row) => row.status === "picked");
      assert.equal(both.length, 2);
      assert.equal(both[0]?.id, button[1]);
      assert.equal(both[1]?.id, second);
      assert.equal(both[1]?.reason, "The second page fits the brief better.");
      assert.equal(rejectedDirectionNames(dir).includes(button[2]), true);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("no saved deal means no picker and no log", async () => {
  const dir = tempProject();
  try {
    await withDesk(dir, async (handle) => {
      const home = await fetch(new URL("/", handle.url));
      const html = await home.text();
      assert.equal(html.includes("data-direction-desk"), false);
      assert.equal(html.includes("data-pick-direction"), false);
      const posted = await postDirection(handle.url, tokenFrom(html), { id: "dir-missing", reason: "Because it fits." });
      assert.equal(posted.status, 400);
      assert.match(posted.text, /No directions/);
      assert.equal(existsSync(decisionLogPath(dir)), false);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
