import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { explainTool } from "@hitchhiker/engine";
import { handleTourKey, mountTour, showTourIndex, type TourNode } from "../src/client/tour.ts";
import { renderFriendly, splitPublicError } from "../src/friendly.ts";
import { SAMPLE_LABEL, sampleProjectFile } from "../src/sample.ts";
import { renderProbeExplain } from "../src/server/card.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { renderReplayControl, renderTour, TOUR_STEPS } from "../src/tour.ts";

test("friendly errors keep a stack behind Details", () => {
  const stack = "The project file could not be read.\n    at loadProjectFile (load.ts:10:5)";
  const split = splitPublicError(stack);
  assert.equal(split.summary, "The project file could not be read.");
  assert.equal(split.detail, stack);
  const html = renderFriendly({
    title: "That file could not be opened",
    happened: stack,
    next: "Check the path, or open the sample from the empty desk.",
    retryHref: "/",
    retryLabel: "Back to the desk",
    copyText: "samples/towel-day.hhproject",
    detail: split.detail,
  });
  const visible = html.split("<details")[0] ?? "";
  assert.equal(visible.includes("at loadProjectFile"), false);
  assert.match(html, /<summary>Details<\/summary>/);
  assert.match(html, /at loadProjectFile/);
  assert.match(html, /Copy the next step/);
  assert.equal(html.includes("!"), false);
  const calm = renderFriendly({
    title: "Name a project file",
    happened: "The open form did not include a path.",
    next: "Paste the path of a .hhproject file, or use Open the sample on an empty desk.",
  });
  assert.match(calm, /The open form did not include a path\./);
  assert.equal(calm.includes("<details"), false);
  assert.equal(calm.includes("!"), false);
});

test("the tour is six skippable steps and the desk reuses explainTool", () => {
  const html = renderTour("abc");
  assert.equal(TOUR_STEPS.length, 6);
  assert.deepEqual(
    TOUR_STEPS.map((step) => step.id),
    ["desk", "sample", "brief", "suggest", "approval", "saves"],
  );
  assert.match(html, /Skip tour/);
  assert.match(html, /data-tour-next/);
  assert.match(html, /First five minutes/);
  assert.equal(html.includes("!"), false);
  assert.equal(html.includes("\u2014"), false);
  assert.doesNotMatch(html, /\belevate\b/i);
  const replay = renderReplayControl("abc");
  assert.match(replay, /Replay tour/);
  assert.match(replay, /name="tour" value="replay"/);
  for (const name of ["grok", "playwright", "whisper", "pdftotext"] as const) {
    const note = explainTool(name);
    const section = renderProbeExplain(name);
    assert.ok(section.includes(note.means), name);
    assert.ok(section.includes(note.why), name);
    assert.ok(section.includes(note.fix), name);
    assert.ok(section.includes(note.doc), name);
    assert.equal(section.includes("!"), false);
  }
});

test("tour keys move, skip, and ignore a text field", () => {
  const doc = fakeTour();
  const tour = doc.querySelector("[data-tour]");
  assert.ok(tour);
  assert.equal(handleTourKey(doc, { key: "ArrowRight", target: tour, preventDefault() {} }), true);
  assert.equal(tour.getAttribute("data-step"), "1");
  assert.equal(doc.querySelector("[data-tour-count]")?.textContent, "2 of 6");
  assert.equal(handleTourKey(doc, { key: "Home", target: tour, preventDefault() {} }), true);
  assert.equal(tour.getAttribute("data-step"), "0");
  assert.equal(handleTourKey(doc, { key: "End", target: tour, preventDefault() {} }), true);
  assert.equal(doc.querySelector("[data-tour-next]")?.textContent, "Done");
  assert.equal(handleTourKey(doc, { key: "ArrowRight", target: tour, preventDefault() {} }), true);
  assert.equal(doc.submitted, "hh-tour-done");
  const field = { tagName: "TEXTAREA", closest: () => tour };
  assert.equal(handleTourKey(doc, { key: "ArrowRight", target: field, preventDefault() {} }), false);
  assert.equal(handleTourKey(doc, { key: "Escape", target: tour, preventDefault() {} }), true);
  assert.equal(doc.submitted, "hh-tour-skip");
  showTourIndex(tour, 0);
  const stop = mountTour(doc);
  doc.click(doc.querySelector("[data-tour-next]"));
  assert.equal(tour.getAttribute("data-step"), "1");
  stop();
});

test("the empty desk offers the sample and the tour, and both round-trip", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-showcase-"));
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      open: false,
      spawn() {
        throw new Error("browser spawn was not expected");
      },
    });
    const home = await request(handle.port, "GET", "/");
    assert.equal(home.status, 200);
    assert.match(home.body, new RegExp(SAMPLE_LABEL));
    assert.match(home.body, /data-open-sample/);
    assert.match(home.body, /name="prefer" value="file"/);
    assert.match(home.body, /First five minutes/);
    assert.match(home.body, /Don't Panic/);
    const token = tokenFrom(home.body);
    const seen = await request(
      handle.port,
      "POST",
      "/api/tour",
      `csrf=${token}&tour=seen`,
      "application/x-www-form-urlencoded",
    );
    assert.equal(seen.status, 303);
    const after = await request(handle.port, "GET", "/");
    assert.equal(after.body.includes("First five minutes"), false);
    assert.match(after.body, /Replay tour/);
    const replayToken = tokenFrom(after.body);
    const replay = await request(
      handle.port,
      "POST",
      "/api/tour",
      `csrf=${replayToken}&tour=replay`,
      "application/x-www-form-urlencoded",
    );
    assert.equal(replay.status, 303);
    const back = await request(handle.port, "GET", "/");
    assert.match(back.body, /First five minutes/);
    const openToken = tokenFrom(back.body);
    const opened = await request(
      handle.port,
      "POST",
      "/api/project/open",
      new URLSearchParams({ csrf: openToken, path: sampleProjectFile(), prefer: "file" }).toString(),
      "application/x-www-form-urlencoded",
    );
    assert.equal(opened.status, 303, opened.body);
    const desk = await request(handle.port, "GET", "/");
    assert.match(desk.body, /For a client who sells towels\./);
    assert.match(desk.body, /data-question-id="DP-0\.2"/);
    const interview = readFileSync(path.join(dir, ".hitchhiker", "interview.json"), "utf8");
    assert.match(interview, /For a client who sells towels\./);
    const bad = path.join(dir, "bad.hhproject");
    writeFileSync(bad, "{\n  \"schemaVersion\": 1,\n    at explode (bad.ts:3:1)\n}\n");
    const refused = await request(
      handle.port,
      "POST",
      "/api/project/open",
      new URLSearchParams({ csrf: tokenFrom(desk.body), path: bad }).toString(),
      "application/x-www-form-urlencoded",
    );
    assert.equal(refused.status, 400);
    assert.match(refused.body, /That file could not be opened/);
    const visible = refused.body.split("<details")[0] ?? "";
    assert.equal(visible.includes("at explode"), false);
    assert.match(refused.body, /<summary>Details<\/summary>/);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function tokenFrom(html: string): string {
  const matched = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(html);
  assert.ok(matched?.[1]);
  return matched[1];
}

function request(
  port: number,
  method: string,
  pathname: string,
  body?: string,
  contentType?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers:
          body === undefined
            ? {}
            : {
                "content-type": contentType ?? "text/plain",
                "content-length": Buffer.byteLength(body),
              },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

class FakeNode implements TourNode {
  readonly attrs = new Map<string, string>();
  readonly children: FakeNode[] = [];
  parent: FakeNode | null = null;
  textContent: string | null = "";
  tagName = "DIV";
  private listeners = new Map<string, Array<(event: { target?: unknown }) => void>>();

  getAttribute(name: string): string | null {
    return this.attrs.has(name) ? (this.attrs.get(name) ?? null) : null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }

  querySelector(selector: string): FakeNode | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeNode[] {
    const found: FakeNode[] = [];
    const walk = (node: FakeNode): void => {
      if (node.matches(selector)) found.push(node);
      for (const child of node.children) walk(child);
    };
    for (const child of this.children) walk(child);
    return found;
  }

  closest(selector: string): FakeNode | null {
    let current: FakeNode | null = this;
    while (current !== null) {
      if (current.matches(selector)) return current;
      current = current.parent;
    }
    return null;
  }

  focus(): void {}

  requestSubmit(): void {
    const id = this.getAttribute("id");
    const root = this.root();
    if (id !== null) root.submitted = id;
  }

  addEventListener(type: string, listener: (event: { target?: unknown }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: (event: { target?: unknown }) => void): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((item) => item !== listener),
    );
  }

  emit(type: string, event: { target?: unknown }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  append(child: FakeNode): void {
    child.parent = this;
    this.children.push(child);
  }

  matches(selector: string): boolean {
    if (selector.startsWith("#")) return this.getAttribute("id") === selector.slice(1);
    if (selector.startsWith("[") && selector.endsWith("]")) {
      const body = selector.slice(1, -1);
      const eq = body.indexOf("=");
      if (eq === -1) return this.attrs.has(body);
      const name = body.slice(0, eq);
      const value = body.slice(eq + 1).replaceAll('"', "");
      return this.getAttribute(name) === value;
    }
    return false;
  }

  private root(): FakeDesk {
    let current: FakeNode = this;
    while (current.parent !== null) current = current.parent;
    return current as FakeDesk;
  }
}

class FakeDesk extends FakeNode {
  activeElement: FakeNode | null = null;
  submitted = "";

  click(node: FakeNode | null): void {
    if (node === null) return;
    this.querySelector("[data-tour]")?.emit("click", { target: node });
  }
}

function fakeTour(): FakeDesk {
  const doc = new FakeDesk();
  const tour = new FakeNode();
  tour.setAttribute("data-tour", "");
  tour.setAttribute("data-step", "0");
  doc.append(tour);
  doc.activeElement = tour;
  TOUR_STEPS.forEach((step, index) => {
    const item = new FakeNode();
    item.setAttribute("data-tour-step", step.id);
    item.setAttribute("data-tour-target", step.target);
    if (index > 0) item.setAttribute("hidden", "");
    tour.append(item);
  });
  const count = new FakeNode();
  count.setAttribute("data-tour-count", "");
  count.textContent = "1 of 6";
  tour.append(count);
  const next = new FakeNode();
  next.setAttribute("data-tour-next", "");
  next.textContent = "Next";
  tour.append(next);
  for (const id of ["hh-tour-skip", "hh-tour-done"]) {
    const form = new FakeNode();
    form.setAttribute("id", id);
    tour.append(form);
  }
  return doc;
}
