/**
 * 260d. The owner picks a sketch per view, asks for a change, or uploads one.
 * Start build stays closed until every primary page has its desktop and phone sketches.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addCompCandidate,
  advanceDesignStages,
  chooseDirection,
  compRenderRel,
  dealDirections,
  listComps,
  readDirectionDeal,
  renderSiteBrief,
  requiredCompViews,
  saveDirectionDeal,
  writeDesignLock,
  type RenderDeskProvider,
  type SiteBrief,
} from "@hitchhiker/engine";
import { setDeskCompProvider, startServer, type ServerHandle } from "../src/server/server.ts";
import { MAX_UPLOAD_BYTES } from "../src/server/uploads.ts";
import { removeTempDir } from "./remove-temp.ts";

const BRIEF = "The site helps a visitor book a visit.";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const LINE = BRIEF;

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-260d-"));
}

function sampleBrief(): SiteBrief {
  return {
    goal: LINE,
    visitor: LINE,
    action: LINE,
    offer: LINE,
    vibe: LINE,
    references: LINE,
    exists: LINE,
    protected: LINE,
    motion: LINE,
    limits: LINE,
    hosting: LINE,
    pages: LINE,
    features: LINE,
    maintainer: LINE,
    cadence: LINE,
    languages: LINE,
    imagery: LINE,
    budget: LINE,
    session: LINE,
    logo: LINE,
    palette: LINE,
    coverage: LINE,
  };
}

function tokenFrom(html: string): string {
  const matched = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(html);
  assert.ok(matched?.[1]);
  return matched[1];
}

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

function section(html: string, stage: string): string {
  const match = new RegExp(`<section data-design-stage="${stage}">[\\s\\S]*?</section>`).exec(html);
  return match?.[0] ?? "";
}

async function request(
  port: number,
  method: string,
  urlPath: string,
  body?: string | Uint8Array,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string; location: string }> {
  const response = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
    method,
    redirect: "manual",
    headers,
    body: body === undefined ? undefined : body,
  });
  return {
    status: response.status,
    body: await response.text(),
    location: response.headers.get("location") ?? "",
  };
}

function multipart(filename: string, data: Buffer, mime: string): { body: Buffer; type: string } {
  const boundary = "hhboundary";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([head, data, tail]),
    type: `multipart/form-data; boundary=${boundary}`,
  };
}

function writePick(dir: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(
    path.join(dir, ".hitchhiker", "directions.json"),
    `${JSON.stringify({
      pickedId: "dir-sample",
      directions: [
        {
          id: "dir-sample",
          name: "Sample",
          description: "A quiet direction.",
          citationId: "sample",
          title: "Sample",
          url: "https://example.com/sample",
          display: "General Sans",
          body: "General Sans",
          sectionOrder: ["hero"],
          hue: "#1f6b4a",
        },
      ],
    })}\n`,
  );
}

/** Direction is approved and the look step is the one on screen. */
function seedLook(dir: string, sitemap: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writePick(dir);
  const draft = sampleBrief();
  writeFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), sitemap);
  writeFileSync(path.join(dir, ".hitchhiker", "wireframe.md"), "# Wireframe\n\n## Home\n", "utf8");
  writeFileSync(path.join(dir, ".hitchhiker", "SITE-BRIEF.md"), renderSiteBrief(draft));
  writeFileSync(
    path.join(dir, ".hitchhiker", "design-stages.json"),
    `${JSON.stringify({
      sitemap: "Approved.",
      wireframe: "Approved.",
      styleGuide: "Approved.",
      direction: "Approved.",
    })}\n`,
  );
  writeFileSync(
    path.join(dir, ".hitchhiker", "brief-pending.json"),
    `${JSON.stringify({
      status: "approved",
      draft,
      buildStarted: false,
      planApproved: true,
      error: "",
      note: "",
      fallback: false,
    })}\n`,
  );
}

/** Declares a body larger than the attachment cap without sending that many bytes. */
function declaredOversize(port: number, urlPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method: "POST",
        headers: {
          host: `127.0.0.1:${port}`,
          "content-type": "multipart/form-data; boundary=hhboundary",
          "content-length": String(MAX_UPLOAD_BYTES + 1),
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.setTimeout(15_000, () => {
      req.destroy(new Error("Upload refusal timed out."));
    });
    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error.message === "Upload refusal timed out.") reject(error);
      else resolve(413);
    });
    req.write(Buffer.from("x"));
  });
}

function homeSitemap(): string {
  return "# Sitemap\n\n## Primary\n\n- Home at /\n  - Hero\n\n## Footer\n\n- Privacy at /privacy\n";
}

function plantSketches(dir: string): Map<string, Buffer> {
  const bytes = new Map<string, Buffer>();
  for (const view of requiredCompViews(dir)) {
    const file = Buffer.concat([PNG, Buffer.from(`-${view}`)]);
    const rel = addCompCandidate(dir, "/", view, file, ".png");
    bytes.set(rel, file);
  }
  return bytes;
}

function lockDesign(dir: string): void {
  writeFileSync(path.join(dir, "DESIGN.md"), "# Design\n\nA quiet page.\n", "utf8");
  writeDesignLock(dir, "dir-sample");
}

function writeShots(dir: string, count: number): void {
  const refs = path.join(dir, "reference", "refs");
  mkdirSync(refs, { recursive: true });
  for (let index = 0; index < count; index += 1) {
    writeFileSync(path.join(refs, `shot-${index}.png`), PNG);
  }
}

test("the look step shows each view and approving writes the sketch and the fixed render", async () => {
  const dir = tempDir();
  let handle: ServerHandle | undefined;
  try {
    seedLook(dir, homeSitemap());
    const planted = plantSketches(dir);
    handle = await startServer({ projectDir: dir, open: false });
    const page = await request(handle.port, "GET", "/approve");
    assert.equal(page.status, 200);
    const look = section(page.body, "look");
    assert.match(look, /Look and feel/);
    assert.match(look, /These are sketches of your pages\. Pick the one that feels right\./);
    assert.match(look, /The words are added later, so ignore the grey bars\./);
    for (const view of ["desktop", "mobile", "desktop-long"]) {
      const block = new RegExp(`data-comp-view="${view}"[\\s\\S]*?(?=data-comp-view="|</section>)`).exec(look)?.[0] ?? "";
      assert.match(block, /data-comp-status>Ready to pick/);
    }
    assert.match(look, /Desktop/);
    assert.match(look, /Phone/);
    assert.match(look, /Long page/);
    assert.equal(look.includes("data-comp-page=\"/privacy\""), false);
    const desktop = [...planted.keys()].find((rel) => rel.endsWith("/desktop-upload-1.png"));
    assert.ok(desktop);
    const token = tokenFrom(page.body);
    const approved = await request(
      handle.port,
      "POST",
      "/approve",
      form({ csrf: token, action: "approve-comp", route: "/", view: "desktop", candidate: desktop }),
      { "content-type": "application/x-www-form-urlencoded" },
    );
    assert.equal(approved.status, 303, approved.body);
    const renderRel = compRenderRel("/", "desktop");
    const renderAbs = path.join(dir, ...renderRel.split("/"));
    assert.equal(existsSync(renderAbs), true);
    assert.deepEqual(readFileSync(renderAbs), planted.get(desktop));
    const doc = listComps(dir);
    const row = doc.pages.find((item) => item.route === "/");
    assert.equal(row?.views.desktop.approved?.file, renderRel);
    assert.equal(row?.views.desktop.approved?.sha256, createHash("sha256").update(planted.get(desktop) ?? Buffer.alloc(0)).digest("hex"));
    const again = await request(handle.port, "GET", "/approve");
    const desktopAt = again.body.indexOf('data-comp-view="desktop"');
    const phoneAt = again.body.indexOf('data-comp-view="mobile"');
    assert.ok(desktopAt >= 0 && phoneAt > desktopAt);
    const desktopBlock = again.body.slice(desktopAt, phoneAt);
    assert.match(desktopBlock, /data-comp-status>Approved/);
  } finally {
    setDeskCompProvider(dir, null);
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});

test("a change request redraws only that view and keeps the owner's words", async () => {
  const dir = tempDir();
  let handle: ServerHandle | undefined;
  const calls: { aspect: string; prompt: string }[] = [];
  const provider: RenderDeskProvider = {
    generateImage(req) {
      calls.push({ aspect: req.aspect, prompt: req.prompt });
      return Promise.resolve([{ b64: PNG.toString("base64") }]);
    },
    editImage(req) {
      calls.push({ aspect: req.aspect ?? "", prompt: req.prompt });
      return Promise.resolve({ images: [{ b64: PNG.toString("base64") }] });
    },
  };
  try {
    seedLook(dir, homeSitemap());
    lockDesign(dir);
    writeFileSync(
      path.join(dir, ".hitchhiker", "config.json"),
      `${JSON.stringify({ design: { comps: { candidates: 2 } } })}\n`,
    );
    const planted = plantSketches(dir);
    const before = new Map<string, Buffer>();
    for (const rel of planted.keys()) {
      if (rel.includes("/mobile-")) continue;
      before.set(rel, readFileSync(path.join(dir, ...rel.split("/"))));
    }
    setDeskCompProvider(dir, provider);
    handle = await startServer({ projectDir: dir, open: false });
    const page = await request(handle.port, "GET", "/approve");
    const token = tokenFrom(page.body);
    const words = "Make the header calmer";
    const changed = await request(
      handle.port,
      "POST",
      "/approve",
      form({ csrf: token, action: "comp-change", route: "/", view: "mobile", changes: words }),
      { "content-type": "application/x-www-form-urlencoded" },
    );
    assert.equal(changed.status, 303, changed.body);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.aspect, "9:19.5");
      assert.match(call.prompt, /Make the header calmer/);
    }
    for (const [rel, bytes] of before) {
      assert.deepEqual(readFileSync(path.join(dir, ...rel.split("/"))), bytes, rel);
    }
    const phone = listComps(dir).pages.find((item) => item.route === "/")?.views.mobile;
    assert.ok(phone?.candidates.some((rel) => rel.endsWith("/mobile-upload-1.png")));
    assert.ok(phone?.notes.includes(words));
    assert.equal(existsSync(path.join(dir, "reference", "comps", "home", "mobile-1.png")), true);
    assert.equal(existsSync(path.join(dir, "reference", "comps", "home", "mobile-2.png")), true);
  } finally {
    setDeskCompProvider(dir, null);
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});

test("an upload becomes a sketch that can be approved, and a svg or oversize file is refused", async () => {
  const dir = tempDir();
  let handle: ServerHandle | undefined;
  try {
    seedLook(dir, homeSitemap());
    handle = await startServer({ projectDir: dir, open: false });
    const page = await request(handle.port, "GET", "/approve");
    const token = tokenFrom(page.body);
    const uploadPath = `/api/comp-upload?csrf=${encodeURIComponent(token)}&route=${encodeURIComponent("/")}&view=desktop`;
    const svg = multipart("logo.svg", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), "image/svg+xml");
    const refused = await request(handle.port, "POST", uploadPath, svg.body, { "content-type": svg.type });
    assert.equal(refused.status, 415, refused.body);
    assert.match(refused.body, /png, jpg, or webp/);
    assert.equal(existsSync(path.join(dir, "reference", "comps")), false);

    const oversize = await declaredOversize(handle.port, uploadPath);
    assert.equal(oversize, 413);
    assert.equal(existsSync(path.join(dir, "reference", "comps")), false);

    const own = Buffer.concat([PNG, Buffer.from("-owner")]);
    const png = multipart("mine.png", own, "image/png");
    const uploaded = await request(handle.port, "POST", uploadPath, png.body, { "content-type": png.type });
    assert.equal(uploaded.status, 303, uploaded.body);
    const rel = "reference/comps/home/desktop-upload-1.png";
    assert.deepEqual(readFileSync(path.join(dir, ...rel.split("/"))), own);
    const shown = await request(handle.port, "GET", "/approve");
    assert.match(section(shown.body, "look"), /desktop-upload-1\.png/);
    const approved = await request(
      handle.port,
      "POST",
      "/approve",
      form({ csrf: token, action: "approve-comp", route: "/", view: "desktop", candidate: rel }),
      { "content-type": "application/x-www-form-urlencoded" },
    );
    assert.equal(approved.status, 303, approved.body);
    const renderAbs = path.join(dir, ...compRenderRel("/", "desktop").split("/"));
    assert.deepEqual(readFileSync(renderAbs), own);
    assert.equal(listComps(dir).pages[0]?.views.desktop.approved?.file, compRenderRel("/", "desktop"));
  } finally {
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});

test("Start build stays closed until desktop and phone sketches are approved for every primary page", async () => {
  const dir = tempDir();
  let handle: ServerHandle | undefined;
  try {
    const draft = sampleBrief();
    const brief = renderSiteBrief(draft);
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "sitemap.md"),
      "# Sitemap\n\n## Primary\n\n- Home at /\n  - Hero\n\n- Visit at /visit\n  - Hero\n\n## Footer\n\n- Privacy at /privacy\n",
    );
    writeFileSync(
      path.join(dir, ".hitchhiker", "config.json"),
      `${JSON.stringify({ design: { comps: { long: false } } })}\n`,
    );
    writeFileSync(
      path.join(dir, ".hitchhiker", "brief-pending.json"),
      `${JSON.stringify({
        status: "approved",
        draft,
        buildStarted: false,
        planApproved: true,
        error: "",
        fallback: false,
      })}\n`,
    );
    writeFileSync(path.join(dir, ".hitchhiker", "SITE-BRIEF.md"), brief);
    advanceDesignStages(dir, { brief, approval: { stage: "sitemap", text: "Approved." } });
    advanceDesignStages(dir, { brief, approval: { stage: "wireframe", text: "Approved." } });
    let deal = readDirectionDeal(dir);
    if (deal === null) {
      deal = dealDirections();
      saveDirectionDeal(dir, deal);
    }
    const first = deal.directions[0];
    assert.ok(first);
    chooseDirection(dir, first.id, "It fits the visit.");
    writeShots(dir, 6);
    advanceDesignStages(dir, { brief, approval: { stage: "style-guide", text: "Approved." } });
    const picked = readDirectionDeal(dir);
    assert.ok(picked?.pickedId);
    writeDesignLock(dir, picked.pickedId);
    advanceDesignStages(dir, { brief, approval: { stage: "direction", text: "Approved." } });
    advanceDesignStages(dir, { brief, approval: { stage: "prebuild", text: "Approved." }, acknowledge: true });
    const pickedFile = new Map<string, string>();
    for (const route of ["/", "/visit"]) {
      for (const view of ["desktop", "mobile"] as const) {
        pickedFile.set(`${route}:${view}`, addCompCandidate(dir, route, view, PNG, ".png"));
      }
    }
    handle = await startServer({ projectDir: dir, open: false });
    const closed = await request(handle.port, "GET", "/approve");
    assert.match(closed.body, /data-start-build disabled/);
    assert.match(closed.body, /Approve the desktop sketch for Home \(\/\) before the build\./);
    const look = section(closed.body, "look");
    assert.match(look, /data-comp-page="\/"/);
    assert.equal(look.includes("Privacy"), false);
    assert.equal(look.includes('data-comp-page="/privacy"'), false);
    const token = tokenFrom(closed.body);
    const blocked = await request(
      handle.port,
      "POST",
      "/approve",
      form({ csrf: token, action: "start-build" }),
      { "content-type": "application/x-www-form-urlencoded" },
    );
    assert.equal(blocked.status, 400, blocked.body);
    assert.match(blocked.body, /Approve the desktop sketch for Home \(\/\) before the build\./);

    for (const view of ["desktop", "mobile"] as const) {
      const step = await request(
        handle.port,
        "POST",
        "/approve",
        form({ csrf: token, action: "approve-comp", route: "/", view, candidate: pickedFile.get(`/:${view}`) ?? "" }),
        { "content-type": "application/x-www-form-urlencoded" },
      );
      assert.equal(step.status, 303, step.body);
    }
    const visit = await request(handle.port, "GET", "/approve");
    assert.match(visit.body, /data-start-build disabled/);
    assert.match(visit.body, /Approve the desktop sketch for Visit \(\/visit\) before the build\./);

    for (const view of ["desktop", "mobile"] as const) {
      const step = await request(
        handle.port,
        "POST",
        "/approve",
        form({
          csrf: token,
          action: "approve-comp",
          route: "/visit",
          view,
          candidate: pickedFile.get(`/visit:${view}`) ?? "",
        }),
        { "content-type": "application/x-www-form-urlencoded" },
      );
      assert.equal(step.status, 303, step.body);
    }
    const open = await request(handle.port, "GET", "/approve");
    assert.match(open.body, /data-start-build>/);
    assert.equal(/data-start-build disabled/.test(open.body), false);
    assert.match(open.body, /This step starts billed work/);
    assert.equal(open.body.includes('data-comp-page="/privacy"'), false);
  } finally {
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});

test("the sketch route refuses a path that leaves the reference folder", async () => {
  const dir = tempDir();
  let handle: ServerHandle | undefined;
  try {
    seedLook(dir, homeSitemap());
    const rel = addCompCandidate(dir, "/", "desktop", PNG, ".png");
    writeFileSync(path.join(dir, "secret.txt"), "TOP-SECRET\n");
    writeFileSync(path.join(dir, "reference", "mark.svg"), "<svg></svg>\n");
    handle = await startServer({ projectDir: dir, open: false });
    const ok = await fetch(`http://127.0.0.1:${handle.port}/desk/sketch?file=${encodeURIComponent(rel)}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await ok.arrayBuffer()), PNG);

    const probes = [
      "reference/../secret.txt",
      "../secret.txt",
      "reference/comps/home/../../secret.txt",
      "reference/%2e%2e/secret.txt",
      "reference\\..\\secret.txt",
      "reference/mark.svg",
      "/etc/passwd",
    ];
    for (const probe of probes) {
      const refused = await request(handle.port, "GET", `/desk/sketch?file=${encodeURIComponent(probe)}`);
      assert.equal(refused.status, 404, probe);
      assert.equal(refused.body.includes("TOP-SECRET"), false, probe);
      assert.match(refused.body, /That file is not on the desk/);
    }
    const names = existsSync(path.join(dir, "reference", "comps"))
      ? readdirSync(path.join(dir, "reference", "comps"), { recursive: true }).map(String)
      : [];
    assert.equal(names.some((name) => name.endsWith(".svg")), false);
  } finally {
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});

test("an approved motion clip plays muted and Use this motion records it", async () => {
  const dir = tempDir();
  let handle: ServerHandle | undefined;
  try {
    seedLook(dir, homeSitemap());
    addCompCandidate(dir, "/", "desktop", PNG, ".png");
    const clip = "reference/comps/home/motion/hero.mp4";
    const clipAbs = path.join(dir, ...clip.split("/"));
    mkdirSync(path.dirname(clipAbs), { recursive: true });
    writeFileSync(clipAbs, Buffer.from("fake-mp4"));
    const file = path.join(dir, ".hitchhiker", "comps.json");
    const doc = JSON.parse(readFileSync(file, "utf8")) as {
      pages: { sections: { id: string; motion?: string }[] }[];
    };
    const sectionRow = doc.pages[0]?.sections.find((item) => item.id === "hero");
    assert.ok(sectionRow);
    sectionRow.motion = clip;
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
    handle = await startServer({ projectDir: dir, open: false });
    const page = await request(handle.port, "GET", "/approve");
    const look = section(page.body, "look");
    assert.match(look, /<video[^>]*muted/);
    assert.match(look, /Use this motion/);
    const token = tokenFrom(page.body);
    const approved = await request(
      handle.port,
      "POST",
      "/approve",
      form({ csrf: token, action: "approve-motion", route: "/", section: "hero" }),
      { "content-type": "application/x-www-form-urlencoded" },
    );
    assert.equal(approved.status, 303, approved.body);
    const after = listComps(dir);
    const hero = after.pages[0]?.sections.find((item) => item.id === "hero");
    assert.equal(hero?.motionApproved?.file, clip);
    assert.equal(hero?.motion, clip);
    const again = section((await request(handle.port, "GET", "/approve")).body, "look");
    assert.match(again, /<video[^>]*muted/);
    assert.match(again, /data-comp-motion[\s\S]*Approved/);
  } finally {
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});
