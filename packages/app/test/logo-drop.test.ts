/**
 * Logo questions (DP-0.4 and DP-1.1) get a file input. Other questions do not.
 * The German line is absent until the Read this in… toggle opens.
 * Uploads stay under the project directory. Wrong type and oversize are refused.
 * 375 is inside max-width 719px, so the composer sticks and the drop zone above it
 * scrolls with the question. 1440 is outside that query, so both stay in the 40rem column.
 * These checks read HTML and CSS. A browser pass is recorded in the prompt summary.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadTree } from "@hitchhiker/engine";
import { renderCard, type CardState } from "../src/card.ts";
import {
  READ_THIS_IN,
  germanRestatement,
  isLogoQuestion,
  languagePanel,
  mountDesk,
  withInterviewExtras,
  type DeskEnv,
} from "../src/client/desk.ts";
import {
  injectBrandLogo,
  logoIntakeMarkup,
  parseLogoIntake,
} from "../src/server/card.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const treeFile = path.resolve(here, "..", "..", "..", "interview", "tree.yaml");
const cardCss = path.resolve(here, "../src/card.css");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x11, 0x22]);
const SVG = Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0h4v4H0z\"/></svg>");

function tempProject(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-logo-"));
}

async function withDesk(run: (handle: ServerHandle, dir: string) => Promise<void>): Promise<void> {
  const dir = tempProject();
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir });
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

function region(html: string, name: string): string {
  const matched = new RegExp(`data-region="${name}"[\\s\\S]*?</(?:section|nav|footer)>`).exec(html);
  assert.ok(matched, name);
  return matched[0];
}

function questionId(card: string): string {
  const matched = /data-question-id="([^"]+)"/.exec(card);
  assert.ok(matched?.[1]);
  return matched[1];
}

function multipart(filename: string, mime: string, data: Buffer): { body: Buffer; type: string } {
  const boundary = "hhboundary";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, data, tail]), type: `multipart/form-data; boundary=${boundary}` };
}

function drawn(question: { id: string; input?: readonly string[]; writes?: readonly string[] } & CardState["question"]): string {
  assert.ok(question);
  const state: CardState = {
    question,
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
  };
  return withInterviewExtras(renderCard(state), question);
}

function staysInside(projectDir: string, file: string): void {
  const rel = path.relative(projectDir, file);
  assert.equal(rel.startsWith(".."), false);
  assert.equal(path.isAbsolute(rel), false);
  assert.equal(rel.split(path.sep)[0], ".hitchhiker");
}

async function postFile(
  handle: ServerHandle,
  token: string,
  filename: string,
  mime: string,
  data: Buffer,
  questionIdHeader?: string,
): Promise<{ status: number; payload: { ok?: boolean; safeName?: string; error?: string } }> {
  const part = multipart(filename, mime, data);
  const headers: Record<string, string> = {
    "content-type": part.type,
    "x-hh-csrf": token,
  };
  if (questionIdHeader !== undefined) headers["x-hh-question"] = questionIdHeader;
  const response = await fetch(new URL("/api/upload", handle.url), {
    method: "POST",
    headers,
    body: new Uint8Array(part.body),
  });
  const payload = (await response.json()) as { ok?: boolean; safeName?: string; error?: string };
  return { status: response.status, payload };
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

test("logo questions are DP-0.4 and DP-1.1, and the German line stays out of the card", () => {
  const all = loadTree(treeFile);
  assert.deepEqual(
    all.filter((item) => isLogoQuestion(item)).map((item) => item.id),
    ["DP-0.4", "DP-1.1"],
  );
  const german = germanRestatement("DP-1.1");
  assert.ok(german);
  assert.equal(german.includes("!"), false);
  assert.equal(germanRestatement("DP-0.4"), null);
  assert.equal(germanRestatement("DP-1.4"), null);

  for (const id of ["DP-0.4", "DP-1.1"] as const) {
    const found = all.find((item) => item.id === id);
    assert.ok(found);
    const html = drawn(found);
    assert.match(html, /type="file"/);
    assert.match(html, /data-logo-drop/);
    assert.match(html, /data-logo-file/);
    assert.equal(html.includes(READ_THIS_IN), true);
    assert.equal(html.includes(german), false);
    assert.equal(html.includes("Falls Sie"), false);
    assert.equal(html.includes("data-restatement"), false);
    assert.doesNotMatch(html, /data-lang-toggle[^>]*\sopen/);
    assert.ok(html.indexOf("data-lang-toggle") < html.indexOf("data-logo-drop"));
    assert.ok(html.indexOf("data-logo-drop") < html.indexOf("hh-qcard__composer"));
    assert.equal(html.includes("!"), false);
    assert.equal(html.match(/hh-btn--primary/g)?.length, 1);
  }

  for (const id of ["DP-1.2", "DP-1.4"] as const) {
    const found = all.find((item) => item.id === id);
    assert.ok(found);
    const html = drawn(found);
    assert.equal(html.includes("type=\"file\""), false);
    assert.equal(html.includes("data-logo-drop"), false);
    assert.equal(html.includes(READ_THIS_IN), true);
    assert.equal(html.includes(german), false);
    assert.equal(html.includes("data-restatement"), false);
  }

  const panel = languagePanel("DP-1.1");
  assert.equal(panel.includes(german), true);
  assert.match(panel, /lang="de"/);
  assert.match(panel, /Same question, in German/);
  const other = languagePanel("DP-0.1");
  assert.equal(other.includes("Falls Sie"), false);
  assert.match(other, /This question is not restated in German/);
  assert.equal(panel.includes("!"), false);
  assert.equal(other.includes("!"), false);

  const pdf = logoIntakeMarkup({ safeName: "hh-abcd1234-mark.pdf", questionId: "DP-1.1" });
  assert.match(pdf, /Logo on file: hh-abcd1234-mark\.pdf/);
  assert.equal(pdf.includes("<img"), false);
  assert.equal(pdf.includes("<svg"), false);
  const svgName = logoIntakeMarkup({ safeName: "hh-abcd1234-mark.svg", questionId: "DP-0.4" });
  assert.equal(svgName.includes("<img"), false);
  assert.equal(svgName.includes("<svg"), false);
  const raster = logoIntakeMarkup({ safeName: "hh-abcd1234-mark.png", questionId: "DP-1.1" });
  assert.match(raster, /src="\/brand\/logo"/);
  assert.match(raster, /data-logo-question="DP-1.1"/);
  assert.equal(
    injectBrandLogo("<p>No logo heading</p>", { safeName: "hh-abcd1234-mark.png", questionId: "DP-1.1" }),
    "<p>No logo heading</p>",
  );
  assert.equal(parseLogoIntake("{"), null);
  assert.equal(
    parseLogoIntake(JSON.stringify({ safeName: "../hh-abcd1234-a.png", questionId: "DP-1.1" })),
    null,
  );
  assert.equal(
    parseLogoIntake(JSON.stringify({ safeName: "hh-abcd1234-a.png", questionId: "../DP" })),
    null,
  );
  assert.deepEqual(parseLogoIntake(JSON.stringify({ safeName: "hh-abcd1234-a.png", questionId: "DP-1.1" })), {
    safeName: "hh-abcd1234-a.png",
    questionId: "DP-1.1",
  });
});

test("the desk hides German and offers the file input only on logo questions", async () => {
  await withDesk(async (handle) => {
    const opening = await fetch(handle.url);
    const first = await opening.text();
    const token = tokenFrom(first);
    const firstCard = region(first, "question");
    assert.equal(questionId(firstCard), "DP-0.1");
    assert.equal(firstCard.includes("type=\"file\""), false);
    assert.equal(firstCard.includes(READ_THIS_IN), true);
    assert.equal(first.includes("Falls Sie"), false);
    assert.equal(first.includes("data-restatement"), false);
    assert.equal(firstCard.includes("!"), false);
    assert.match(first, /Logo drop sits above the composer\. 375 is under 720px/);
    assert.match(first, /1440 is outside that query/);
    assert.match(first, /\.hh-qcard__drop \{/);

    const logo = await skipUntil(handle, token, "DP-0.4");
    const logoCard = region(logo, "question");
    assert.match(logoCard, /type="file"/);
    assert.ok(logoCard.indexOf("data-logo-drop") < logoCard.indexOf("hh-qcard__composer"));
    assert.equal(logo.includes("Falls Sie"), false);
    assert.equal(logoCard.includes("!"), false);
    assert.equal(logoCard.match(/hh-btn--primary/g)?.length, 1);

    const between = await skipUntil(handle, token, "DP-0.5");
    assert.equal(region(between, "question").includes("type=\"file\""), false);
    assert.equal(region(between, "question").includes(READ_THIS_IN), true);

    const mark = await skipUntil(handle, token, "DP-1.1");
    const markCard = region(mark, "question");
    assert.match(markCard, /type="file"/);
    assert.match(markCard, /data-logo-drop/);
    assert.equal(mark.includes("Falls Sie"), false);
    assert.equal(mark.includes("data-restatement"), false);
    assert.equal(markCard.includes(READ_THIS_IN), true);
  });

  // 375 sticks only the composer. The drop zone is not inside that rule, so it scrolls.
  // 1440 is outside max-width 719px, so the zone stays in the read column.
  const css = readFileSync(cardCss, "utf8");
  const media = /@media \(max-width: 719px\) \{[\s\S]*?\n\}/.exec(css);
  assert.ok(media);
  assert.match(media[0], /\.hh-qcard__composer[\s\S]*position:\s*sticky/);
  assert.equal(media[0].includes(".hh-qcard__drop"), false);
  assert.equal(css.replace(media[0], "").includes("position: sticky"), false);
});

test("a logo file stays in the project and the brand plate reads it", async () => {
  await withDesk(async (handle, dir) => {
    const token = tokenFrom(await (await fetch(handle.url)).text());
    const saved = await postFile(handle, token, "mark.png", "image/png", PNG, "DP-1.1");
    assert.equal(saved.status, 201);
    assert.equal(saved.payload.ok, true);
    const safeName = saved.payload.safeName ?? "";
    assert.match(safeName, /^hh-[0-9a-f]{8}-mark\.png$/);
    const stored = path.join(dir, ".hitchhiker", "uploads", safeName);
    staysInside(dir, stored);
    assert.deepEqual(readFileSync(stored), PNG);
    const intakePath = path.join(dir, ".hitchhiker", "brand", "logo-intake.json");
    staysInside(dir, intakePath);
    assert.deepEqual(parseLogoIntake(readFileSync(intakePath, "utf8")), {
      safeName,
      questionId: "DP-1.1",
    });

    const empty = await (await fetch(new URL("/brand", handle.url))).text();
    assert.match(empty, /src="\/brand\/logo"/);
    assert.match(empty, /data-logo-intake/);
    assert.match(empty, /data-logo-question="DP-1.1"/);
    assert.match(empty, new RegExp(safeName));
    assert.match(empty, /href="\/src\/brand-kit\.css"/);
    assert.match(empty, /Approve the brief to print the kit/);
    assert.equal(empty.includes("<svg"), false);
    const bytes = await fetch(new URL("/brand/logo", handle.url));
    assert.equal(bytes.status, 200);
    assert.match(bytes.headers.get("content-type") ?? "", /^image\/png/);
    assert.deepEqual(Buffer.from(await bytes.arrayBuffer()), PNG);

    const folder = path.join(dir, ".hitchhiker", "brand");
    writeFileSync(path.join(folder, "brand-kit.json"), `${JSON.stringify(kitModel(), null, 2)}\n`, "utf8");
    const kit = await (await fetch(new URL("/brand", handle.url))).text();
    const heading = kit.indexOf('<h2 class="hh-title" id="logo-title">Logo</h2>');
    const figure = kit.indexOf("data-logo-intake");
    assert.ok(heading >= 0 && figure > heading);
    assert.match(kit, /src="\/brand\/logo"/);
    assert.match(kit, /data-approve="logo"/);
    assert.match(kit, /Approve/);

    const svg = await postFile(handle, token, "mark.svg", "image/svg+xml", SVG, "DP-1.1");
    assert.equal(svg.status, 201);
    const svgName = svg.payload.safeName ?? "";
    assert.match(svgName, /^hh-[0-9a-f]{8}-mark\.svg$/);
    staysInside(dir, path.join(dir, ".hitchhiker", "uploads", svgName));
    const named = await (await fetch(new URL("/brand", handle.url))).text();
    assert.match(named, new RegExp(`Logo on file: ${svgName}`));
    assert.equal(named.includes("src=\"/brand/logo\""), false);
    assert.equal(named.includes("<svg"), false);
    const hidden = await fetch(new URL("/brand/logo", handle.url));
    const hiddenBody = await hidden.text();
    assert.equal(hidden.status, 404);
    assert.equal((hidden.headers.get("content-type") ?? "").includes("image/svg+xml"), false);
    assert.equal(hiddenBody.includes("<svg"), false);
    assert.equal(hiddenBody.includes(SVG.toString("utf8")), false);

    const assets = await postFile(handle, token, "assets.png", "image/png", PNG, "DP-0.4");
    assert.equal(assets.status, 201);
    assert.equal(parseLogoIntake(readFileSync(intakePath, "utf8"))?.questionId, "DP-0.4");
    const again = await fetch(new URL("/brand/logo", handle.url));
    assert.equal(again.status, 200);
    assert.deepEqual(Buffer.from(await again.arrayBuffer()), PNG);
  });
});

test("other questions, the wrong type, and an oversize body do not become the logo", async () => {
  await withDesk(async (handle, dir) => {
    const token = tokenFrom(await (await fetch(handle.url)).text());
    const missing = await fetch(new URL("/brand/logo", handle.url));
    assert.equal(missing.status, 404);

    const textQuestion = await postFile(handle, token, "note.png", "image/png", PNG, "DP-1.2");
    assert.equal(textQuestion.status, 201);
    const mood = await postFile(handle, token, "mood.png", "image/png", PNG, "DP-1.4");
    assert.equal(mood.status, 201);
    const wav = await postFile(handle, token, "note.wav", "audio/wav", Buffer.from("RIFF"), "DP-1.1");
    assert.equal(wav.status, 201);
    const exe = await postFile(handle, token, "tool.exe", "application/octet-stream", Buffer.from("MZ"), "DP-1.1");
    assert.equal(exe.status, 415);
    assert.match(exe.payload.error ?? "", /not allowed/);

    const intakePath = path.join(dir, ".hitchhiker", "brand", "logo-intake.json");
    assert.equal(existsSync(intakePath), false);
    const names = readdirSync(path.join(dir, ".hitchhiker", "uploads")).sort();
    assert.deepEqual(names, [textQuestion.payload.safeName, mood.payload.safeName, wav.payload.safeName].sort());
    for (const name of names) staysInside(dir, path.join(dir, ".hitchhiker", "uploads", name));
    const plate = await (await fetch(new URL("/brand", handle.url))).text();
    assert.equal(plate.includes("data-logo-intake"), false);

    const declared = 26 * 1024 * 1024;
    const started = Date.now();
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: handle.port,
          path: "/api/upload",
          method: "POST",
          headers: {
            host: `127.0.0.1:${handle.port}`,
            "content-type": "multipart/form-data; boundary=hh",
            "content-length": String(declared),
            "x-hh-csrf": token,
            "x-hh-question": "DP-1.1",
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      req.on("error", reject);
      req.write(Buffer.alloc(1024, 1));
    });
    assert.equal(status, 413);
    assert.ok(Date.now() - started < 2_000);
    assert.equal(existsSync(intakePath), false);
  });
});

test("the desk posts a logo file and reveals German only after the toggle opens", async () => {
  const calls: Array<{ headers: Record<string, string>; body: FormData }> = [];
  const h = harness(async (_input, init) => {
    const headers = headerRecord(init?.headers);
    assert.ok(init?.body instanceof FormData);
    calls.push({ headers, body: init.body });
    const name = calls.length === 1 ? "hh-abcd1234-mark.png" : "hh-abcd1234-drop.png";
    return Response.json({ ok: true, safeName: name, bytes: 4 });
  });
  const stop = mountDesk(h.env);
  try {
    await settle();
    assert.match(h.region.innerHTML, /type="file"/);
    assert.match(h.region.innerHTML, /data-logo-drop/);
    assert.equal(h.region.innerHTML.includes(READ_THIS_IN), true);
    assert.equal(h.region.innerHTML.includes("Falls Sie"), false);
    assert.equal(h.region.innerHTML.includes("data-restatement"), false);

    const details = openDetails();
    h.fire("toggle", { target: details.el });
    await settle();
    assert.match(details.added(), /Falls Sie/);
    assert.match(details.added(), /lang="de"/);
    assert.equal(h.region.innerHTML.includes("Falls Sie"), false);

    h.fire("change", { target: fileTarget(new File([], "empty.png", { type: "image/png" })) });
    await settle();
    assert.equal(calls.length, 0);
    assert.match(h.region.innerHTML, /File is empty/);

    const big = { size: 26 * 1024 * 1024, name: "big.png" } as File;
    h.fire("change", { target: fileTarget(big) });
    await settle();
    assert.equal(calls.length, 0);
    assert.match(h.region.innerHTML, /File is over 25 MB/);

    let prevented = false;
    h.fire("dragover", {
      target: element({ id: "hh-card-draft" }),
      preventDefault() {
        prevented = true;
      },
    });
    assert.equal(prevented, false);
    h.fire("dragover", {
      target: dropHost(),
      preventDefault() {
        prevented = true;
      },
    });
    assert.equal(prevented, true);

    const chosen = new File([Uint8Array.from([1, 2, 3, 4])], "mark.png", { type: "image/png" });
    h.fire("change", { target: fileTarget(chosen) });
    await settle();
    assert.equal(calls.length, 1);
    const first = calls[0];
    assert.ok(first);
    assert.equal(first.headers["x-hh-csrf"], "csrf-token");
    assert.equal(first.headers["x-hh-question"], "DP-1.1");
    assert.equal(Object.hasOwn(first.headers, "content-type"), false);
    const sent = first.body.get("file");
    assert.ok(sent instanceof File);
    assert.equal(sent.name, "mark.png");
    assert.match(h.region.innerHTML, /Saved as hh-abcd1234-mark\.png/);
    assert.match(h.region.innerHTML, /Logo file: hh-abcd1234-mark\.png/);
    assert.equal(h.region.innerHTML.includes("!"), false);

    const dropped = new File([Uint8Array.from([5, 6])], "drop.png", { type: "image/png" });
    let droppedDefault = false;
    h.fire("drop", {
      target: dropHost(),
      preventDefault() {
        droppedDefault = true;
      },
      dataTransfer: { files: [dropped] },
    });
    await settle();
    assert.equal(droppedDefault, true);
    assert.equal(calls.length, 2);
    assert.match(h.region.innerHTML, /Saved as hh-abcd1234-drop\.png/);
  } finally {
    stop();
  }
});

async function skipUntil(handle: ServerHandle, token: string, target: string): Promise<string> {
  for (let step = 0; step < 30; step += 1) {
    const html = await (await fetch(handle.url)).text();
    const card = region(html, "question");
    const id = questionId(card);
    if (id === target) return html;
    const skipped = await fetch(new URL("/api/skip", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-hh-csrf": token },
      body: JSON.stringify({ questionId: id }),
    });
    assert.equal(skipped.status, 200);
  }
  assert.fail(target);
}

function headerRecord(headers: HeadersInit | undefined): Record<string, string> {
  assert.ok(headers !== undefined);
  assert.equal(headers instanceof Headers, false);
  assert.equal(Array.isArray(headers), false);
  return headers as Record<string, string>;
}

interface FakeEl {
  innerHTML: string;
  parentElement: FakeEl | null;
  open?: boolean;
  files?: ArrayLike<File>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): FakeEl | null;
  insertAdjacentHTML?(position: "beforeend", html: string): void;
}

interface FakeEvent {
  target: FakeEl | null;
  preventDefault(): void;
  dataTransfer?: { files?: ArrayLike<File> } | null;
}

function element(attrs: Record<string, string> = {}): FakeEl {
  const store = new Map(Object.entries(attrs));
  return {
    innerHTML: "",
    parentElement: null,
    getAttribute(name) {
      return store.has(name) ? (store.get(name) ?? "") : null;
    },
    setAttribute(name, value) {
      store.set(name, value);
    },
    removeAttribute(name) {
      store.delete(name);
    },
    querySelector() {
      return null;
    },
  };
}

function fileTarget(file: File): FakeEl {
  const node = element({ "data-logo-file": "" });
  node.files = [file];
  return node;
}

function dropHost(): FakeEl {
  return element({ "data-logo-drop": "" });
}

function openDetails(): { el: FakeEl; added(): string } {
  let extra = "";
  const el = element({ "data-lang-toggle": "" });
  el.open = true;
  el.querySelector = () => null;
  el.insertAdjacentHTML = (_position, html) => {
    extra += html;
  };
  return { el, added: () => extra };
}

function harness(upload: DeskEnv["fetch"]): { env: DeskEnv; region: FakeEl; fire(type: string, event?: Partial<FakeEvent>): void } {
  const meta = element({ name: "hh-csrf", content: "csrf-token" });
  const regionEl = element({ "data-region": "question" });
  const live = element();
  const listeners = new Map<string, (event: FakeEvent) => void>();
  const env = {
    document: {
      querySelector(selector: string): FakeEl | null {
        if (selector === 'meta[name="hh-csrf"]') return meta;
        if (selector === '[data-region="question"]') return regionEl;
        if (selector === "[data-guide-live]") return live;
        return null;
      },
      addEventListener(type: string, listener: (event: FakeEvent) => void) {
        listeners.set(type, listener);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
    },
    EventSource: class {
      addEventListener(): void {}
      close(): void {}
    },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/session") {
        return Response.json({
          question: {
            id: "DP-1.1",
            module: "ford-field-notes",
            depth: ["deep"],
            ask: "Do you have a logo?",
            why: "The logo anchors color, type, and tone.",
            input: ["upload", "text", "voice"],
            skipDefault: "Generate logo concepts in Babel Fish.",
            writes: ["BRAND.md#logo", "ASSETS.md#logo"],
          },
          pushback: null,
          done: false,
          mapHtml: "",
          transcriptHtml: "",
          statusHtml: "",
          required: false,
          mastCompact: false,
          mastLine: "",
        });
      }
      if (url === "/api/upload") return upload(input, init);
      return Response.json({ error: "unexpected" }, { status: 500 });
    },
  } as DeskEnv;
  return {
    env,
    region: regionEl,
    fire(type, event = {}) {
      listeners.get(type)?.({ target: null, preventDefault() {}, ...event });
    },
  };
}

async function settle(): Promise<void> {
  for (let step = 0; step < 8; step += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}
