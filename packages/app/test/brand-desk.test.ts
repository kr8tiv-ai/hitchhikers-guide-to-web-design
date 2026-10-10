import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { BRAND_SECTIONS } from "@hitchhiker/engine";
import { bindApproveDeck } from "../src/brand/approve-cards.ts";
import { mountBrand, type BrandEnv } from "../src/client/brand.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function tempProject(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-brand-desk-"));
}

async function withDesk(run: (handle: ServerHandle, dir: string) => Promise<void>): Promise<void> {
  const dir = tempProject();
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
    await run(handle, dir);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function tokenFrom(html: string): string {
  const matched = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(html);
  assert.ok(matched?.[1]);
  return matched[1];
}

function brandMarkdown(): string {
  return "# Purpose\n\nStatus: draft\n\nThe stall stays open.\n";
}

function kitModel(): Record<string, unknown> {
  return {
    purpose: "North Glass cuts the pane.",
    why: "So a room can keep the weather out.",
    archetype: "Creator, assumed until you approve it.",
    positioning: "For people building a house, North Glass cuts the view to size.",
    stories: {
      s25: "North Glass cuts the pane that fits the room.",
      s100: "The shop measures twice, then cuts the sheet.",
      s300: "A house gets one chance at the opening.",
    },
    voiceItems: [{ id: "trait-direct", text: "Direct, not rude." }],
    taglines: ["Glass, cut slow."],
    palette: { paper: "#f4efe6", ink: "#14201c", signal: "#b6401a" },
    typeNames: ["Fraunces", "Source Serif 4"],
    logoSvg: null,
    logoSet: null,
    images: [],
  };
}

function writeKit(dir: string, htmlOnly?: string): void {
  const folder = path.join(dir, ".hitchhiker", "brand");
  mkdirSync(folder, { recursive: true });
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "BRAND.md"), brandMarkdown(), "utf8");
  if (htmlOnly !== undefined) {
    writeFileSync(path.join(folder, "brand-kit.html"), htmlOnly, "utf8");
    return;
  }
  writeFileSync(path.join(folder, "brand-kit.json"), `${JSON.stringify(kitModel(), null, 2)}\n`, "utf8");
}

function brandText(dir: string): string {
  return readFileSync(path.join(dir, ".hitchhiker", "BRAND.md"), "utf8");
}

async function postBrand(
  url: string,
  token: string | null,
  body: unknown,
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers["x-hh-csrf"] = token;
  const response = await fetch(new URL("/api/brand", url), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
}

test("with no kit on disk /brand still shows the empty plate", async () => {
  await withDesk(async (handle) => {
    const response = await fetch(new URL("/brand", handle.url));
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /No kit on the desk/);
    assert.match(html, /Approve the brief to print the kit/);
    assert.match(html, /href="\/\?question=DP-0\.1"/);
    assert.equal(html.includes("The kit is not printed yet"), false);
    assert.equal(html.includes("Draft. Not approved."), false);
    assert.equal(html.includes("/client/brand.js"), false);
    assert.equal(html.includes("data-brand-desk"), false);
    assert.equal((response.headers.get("content-security-policy") ?? "").includes("unsafe-inline"), false);
    const approve = await fetch(new URL("/approve", handle.url));
    assert.match(await approve.text(), /Nothing is waiting for a yes/);
  });
});

test("a kit file on disk renders the brand kit and keeps /approve on its own plate", async () => {
  await withDesk(async (handle, dir) => {
    const folder = path.join(dir, ".hitchhiker", "brand");
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      path.join(folder, "brand-kit.html"),
      "<!DOCTYPE html><html><body><main class=\"bk-page\"><p>HTML kit already on the desk.</p></main></body></html>",
      "utf8",
    );
    writeKit(dir);
    const response = await fetch(new URL("/brand", handle.url));
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /North Glass cuts the pane\./);
    assert.match(html, /Draft\. Not approved\./);
    assert.match(html, /data-approve="purpose"/);
    assert.match(html, /data-redo="neighbors"/);
    assert.match(html, /data-brand-desk/);
    assert.match(html, /src="\/client\/brand\.js"/);
    assert.match(html, /name="hh-csrf" content="[0-9a-f]{64}"/);
    assert.match(html, /href="\/brand" aria-current="page"/);
    assert.equal(html.includes("HTML kit already on the desk."), false);
    assert.equal(html.includes("No kit on the desk"), false);
    assert.equal(html.replace("<!DOCTYPE html>", "").includes("!"), false);
    const policy = response.headers.get("content-security-policy") ?? "";
    assert.match(policy, /style-src 'self' 'unsafe-inline'/);
    assert.equal(policy.includes("script-src 'self' 'unsafe-inline'"), false);
    const desk = await fetch(handle.url);
    assert.equal((desk.headers.get("content-security-policy") ?? "").includes("unsafe-inline"), false);
    const approve = await fetch(new URL("/approve", handle.url));
    const approveHtml = await approve.text();
    assert.match(approveHtml, /Nothing is waiting for a yes/);
    assert.equal(approveHtml.includes("North Glass cuts the pane."), false);

    const script = await fetch(new URL("/client/brand.js", handle.url));
    const js = await script.text();
    assert.equal(script.status, 200);
    assert.match(js, /bindApproveDeck/);
    assert.match(js, /from "\/client\/approve-cards\.js"/);
    assert.match(js, /\/api\/brand/);
    assert.equal(js.includes("https://"), false);
    assert.equal(js.includes("http://"), false);
    const cards = await fetch(new URL("/client/approve-cards.js", handle.url));
    assert.equal(cards.status, 200);
    assertSyntax(js, "hh-brand-client.js");
    assertSyntax(await cards.text(), "hh-approve-cards.js");
  });
});

test("an html kit is served when the json model is absent", async () => {
  await withDesk(async (handle, dir) => {
    writeKit(
      dir,
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\" /></head><body><main class=\"bk-page\"><p>HTML kit already on the desk.</p></main></body></html>",
    );
    const response = await fetch(new URL("/brand", handle.url));
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /HTML kit already on the desk\./);
    assert.match(html, /src="\/client\/brand\.js"/);
    assert.equal(html.includes("No kit on the desk"), false);
  });
});

test("a POST that approves every section flips the kit status line to approved", async () => {
  await withDesk(async (handle, dir) => {
    writeKit(dir);
    const page = await fetch(new URL("/brand", handle.url));
    const token = tokenFrom(await page.text());
    let last = "";
    for (const section of BRAND_SECTIONS) {
      const posted = await postBrand(handle.url, token, { section, action: "approve" });
      assert.equal(posted.status, 200, posted.text);
      last = posted.text;
      const saved = brandText(dir);
      if (section === "neighbors") assert.match(saved, /^Status: approved$/m);
      else assert.match(saved, /^Status: draft$/m);
    }
    assert.match(last, /"allApproved":true/);
    assert.match(brandText(dir), /The stall stays open\./);
    const flags = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "brand-approval.json"), "utf8")) as Record<
      string,
      boolean
    >;
    for (const section of BRAND_SECTIONS) assert.equal(flags[section], true);
  });
});

test("a partial approval stays draft", async () => {
  await withDesk(async (handle, dir) => {
    writeKit(dir);
    const page = await fetch(new URL("/brand", handle.url));
    const token = tokenFrom(await page.text());
    const posted = await postBrand(handle.url, token, { section: "purpose", action: "approve" });
    assert.equal(posted.status, 200, posted.text);
    assert.match(posted.text, /"allApproved":false/);
    const saved = brandText(dir);
    assert.match(saved, /^Status: draft$/m);
    assert.equal(saved.includes("Status: approved"), false);
    const flags = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "brand-approval.json"), "utf8")) as Record<
      string,
      boolean
    >;
    assert.equal(flags.purpose, true);
    assert.equal(flags.voice, false);
  });
});

test("a redo clears that section", async () => {
  await withDesk(async (handle, dir) => {
    writeKit(dir);
    const page = await fetch(new URL("/brand", handle.url));
    const token = tokenFrom(await page.text());
    for (const section of BRAND_SECTIONS) {
      const posted = await postBrand(handle.url, token, { section, action: "approve" });
      assert.equal(posted.status, 200, posted.text);
    }
    assert.match(brandText(dir), /^Status: approved$/m);
    const posted = await postBrand(handle.url, token, { section: "voice", action: "redo" });
    assert.equal(posted.status, 200, posted.text);
    const saved = brandText(dir);
    assert.match(saved, /^Status: draft$/m);
    assert.match(saved, /The stall stays open\./);
    const flags = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "brand-approval.json"), "utf8")) as Record<
      string,
      boolean
    >;
    assert.equal(flags.voice, false);
    assert.equal(flags.purpose, true);
    assert.equal(flags.neighbors, true);
  });
});

test("a POST without the CSRF token is refused", async () => {
  await withDesk(async (handle, dir) => {
    writeKit(dir);
    const before = readFileSync(path.join(dir, ".hitchhiker", "BRAND.md"));
    const posted = await postBrand(handle.url, null, { section: "purpose", action: "approve" });
    assert.equal(posted.status, 403);
    assert.match(posted.text, /refused/);
    assert.deepEqual(readFileSync(path.join(dir, ".hitchhiker", "BRAND.md")), before);
    assert.equal(exists(path.join(dir, ".hitchhiker", "brand-approval.json")), false);
  });
});

test("an unknown section id is refused with 400", async () => {
  await withDesk(async (handle, dir) => {
    writeKit(dir);
    const page = await fetch(new URL("/brand", handle.url));
    const token = tokenFrom(await page.text());
    const before = readFileSync(path.join(dir, ".hitchhiker", "BRAND.md"));
    for (const section of ["gsap", "palette", "Purpose"]) {
      const posted = await postBrand(handle.url, token, { section, action: "approve" });
      assert.equal(posted.status, 400, section);
      assert.match(posted.text, /Unknown brand section/);
    }
    assert.deepEqual(readFileSync(path.join(dir, ".hitchhiker", "BRAND.md")), before);
  });
});

test("Approve and Redo go through bindApproveDeck to the local desk", async () => {
  const seen: Array<{ url: string; init: RequestInit | undefined }> = [];
  const token = "a".repeat(64);
  const note = el({ "data-brand-note": "" });
  const approve = el({ "data-approve": "purpose" });
  const redo = el({ "data-redo": "voice" });
  const desk = el({ "data-brand-desk": "" }, [approve, redo, note]);
  const meta = el({ name: "hh-csrf", content: token }, [], "meta");
  const document = el({}, [meta, desk]);
  const env = {
    document,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), init });
      return Response.json({ ok: true, allApproved: false });
    }) as typeof fetch,
  } as BrandEnv;
  const stop = mountBrand(env);
  const kept = desk.innerHTML;
  click(desk, approve);
  await waitFor(() => seen.length >= 1 && (note.textContent?.length ?? 0) > 0);
  click(desk, redo);
  await waitFor(() => seen.length >= 2 && note.textContent === "That section is cleared. The file is draft.");
  assert.equal(desk.innerHTML, kept);
  assert.equal(seen.length, 2);
  assert.equal(seen[0]?.url, "/api/brand");
  assert.equal(seen[1]?.url, "/api/brand");
  const first = seen[0]?.init;
  const second = seen[1]?.init;
  assert.equal(first?.method, "POST");
  assert.equal(header(first, "x-hh-csrf"), token);
  assert.equal(first?.body, JSON.stringify({ section: "purpose", action: "approve" }));
  assert.equal(second?.body, JSON.stringify({ section: "voice", action: "redo" }));
  assert.equal(note.textContent, "That section is cleared. The file is draft.");
  stop();

  const empty = el({});
  let decision = "";
  bindApproveDeck(
    empty,
    [{ itemId: "purpose", kind: "purpose", body: "The purpose line.", status: "pending" }],
    (id, status) => {
      decision = `${id}:${status}`;
    },
  );
  assert.match(empty.innerHTML, /data-approve="purpose"/);
  const painted = el({ "data-approve": "logo" });
  painted.innerHTML = "keep the kit";
  const root = el({}, [painted]);
  bindApproveDeck(root, [], (id, status) => {
    decision = `${id}:${status}`;
  });
  assert.equal(painted.innerHTML, "keep the kit");
  click(root, painted);
  assert.equal(decision, "logo:approved");
  const redoButton = el({ "data-redo": "tokens" });
  click(root, redoButton);
  assert.equal(decision, "tokens:rejected");
});

test("the desk calls applyStatus and redoSection and does not leave the machine", () => {
  const source = readFileSync(path.resolve(here, "../src/server/brand-desk.ts"), "utf8");
  assert.match(source, /renderBrandKit\(/);
  assert.match(source, /applyStatus\(/);
  assert.match(source, /redoSection\(/);
  assert.equal(source.includes("https://"), false);
  assert.equal(source.includes("http://"), false);
  const client = readFileSync(path.resolve(here, "../src/client/brand.ts"), "utf8");
  assert.match(client, /bindApproveDeck\(/);
  assert.match(client, /"\/api\/brand"/);
  assert.equal(client.includes("https://"), false);
  assert.equal(client.includes("http://"), false);
});

function exists(file: string): boolean {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}

function assertSyntax(source: string, name: string): void {
  const file = path.join(tmpdir(), name);
  writeFileSync(file, source);
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  rmSync(file, { force: true });
}

interface FakeEl {
  tag: string;
  attrs: Record<string, string>;
  innerHTML: string;
  textContent: string | null;
  children: FakeEl[];
  listeners: Map<string, Array<(event: { target: FakeEl | null; preventDefault(): void }) => void>>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: (event: { target: FakeEl | null; preventDefault(): void }) => void): void;
  removeEventListener(
    type: string,
    listener: (event: { target: FakeEl | null; preventDefault(): void }) => void,
  ): void;
  querySelector(selector: string): FakeEl | null;
}

function el(attrs: Record<string, string>, children: FakeEl[] = [], tag = "div"): FakeEl {
  const node: FakeEl = {
    tag,
    attrs: { ...attrs },
    innerHTML: "",
    textContent: "",
    children,
    listeners: new Map(),
    getAttribute(name) {
      return Object.hasOwn(this.attrs, name) ? (this.attrs[name] ?? null) : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    addEventListener(type, listener) {
      const list = this.listeners.get(type) ?? [];
      list.push(listener);
      this.listeners.set(type, list);
    },
    removeEventListener(type, listener) {
      const list = this.listeners.get(type) ?? [];
      this.listeners.set(
        type,
        list.filter((item) => item !== listener),
      );
    },
    querySelector(selector) {
      for (const child of walk(this)) {
        if (matches(child, selector)) return child;
      }
      return null;
    },
  };
  return node;
}

function walk(node: FakeEl): FakeEl[] {
  const out: FakeEl[] = [];
  for (const child of node.children) out.push(child, ...walk(child));
  return out;
}

function matches(node: FakeEl, selector: string): boolean {
  if (selector === "[data-brand-desk]") return node.getAttribute("data-brand-desk") !== null;
  if (selector === "[data-brand-note]") return node.getAttribute("data-brand-note") !== null;
  if (selector === "[data-approve]") return node.getAttribute("data-approve") !== null;
  if (selector === 'meta[name="hh-csrf"]') {
    return node.tag === "meta" && node.getAttribute("name") === "hh-csrf";
  }
  return false;
}

function click(root: FakeEl, target: FakeEl): void {
  const list = root.listeners.get("click") ?? [];
  for (const listener of list) listener({ target, preventDefault() {} });
}

function header(init: RequestInit | undefined, name: string): string | undefined {
  const headers = init?.headers;
  if (headers === undefined || Array.isArray(headers) || headers instanceof Headers) return undefined;
  const value = headers[name];
  return typeof value === "string" ? value : undefined;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function waitFor(ready: () => boolean, turns = 50): Promise<void> {
  for (let i = 0; i < turns; i++) {
    if (ready()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (!ready()) throw new Error("timed out waiting for brand desk note");
}
