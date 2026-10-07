import assert from "node:assert/strict";
import { crc32, deflateSync } from "node:zlib";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { inspect } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import { BANNED_PHRASES, BANNED_WORDS } from "@hitchhiker/engine";
import {
  PHONE_GLB_BYTES,
  PHONE_TEXTURE_MB,
  PHONE_TRIANGLES,
  checkBudget,
  checkBudgetFromMotion,
  levelFromMotion,
} from "../src/three-d/budget.ts";
import {
  LicenceError,
  appendCredit,
  explainOptions,
  renderCreditsSnippet,
  type CreditRecord,
} from "../src/three-d/credits.ts";
import {
  GenerationCapError,
  GenerationDeclinedError,
  GenerationFailedError,
  MESHY_IMAGE_URL,
  MESHY_TEXT_URL,
  POLL_BUDGET_MS,
  POLL_INTERVAL_MS,
  TRIPO_IMAGE_URL,
  TRIPO_TEXT_URL,
  generate3d,
  quoteGeneration,
} from "../src/three-d/generate.ts";
import { glbOutputPath, inspectGlb, optimizeGlb } from "../src/three-d/optimize.ts";
import { download as downloadAmbient, search as searchAmbient } from "../src/three-d/sources/ambientcg.ts";
import { download as downloadKenney, search as searchKenney } from "../src/three-d/sources/kenney.ts";
import { download as downloadPoly, search as searchPoly } from "../src/three-d/sources/polyhaven.ts";
import { download as downloadQuat, search as searchQuat } from "../src/three-d/sources/quaternius.ts";
import {
  download as downloadSketch,
  licenceFromLabel,
  search as searchSketch,
} from "../src/three-d/sources/sketchfab.ts";

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "three-d",
  "triangle.glb",
);
const KEY = "provider-test-key-085-do-not-leak";
const MOTION_8 =
  "Appetite: 8 of 10. Appetite is a weight ceiling. It does not remove a library from the Guide.\n";

interface Call {
  url: string;
  method: string;
  authorization?: string;
  body?: string;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function authorizationOf(headers: HeadersInit | undefined): string | undefined {
  if (headers === undefined) return undefined;
  if (headers instanceof Headers) return headers.get("authorization") ?? undefined;
  if (Array.isArray(headers)) {
    const row = headers.find(([name]) => name.toLowerCase() === "authorization");
    return row?.[1];
  }
  return headers.Authorization ?? headers.authorization;
}

function harness(handler: (call: Call) => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const call: Call = {
      url: requestUrl(input),
      method: init?.method ?? "GET",
      authorization: authorizationOf(init?.headers),
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    return handler(call);
  };
  return { fetchImpl, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "hh-3d-"));
}

function glbMagic(): Uint8Array {
  return new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);
}

test("fixture GLB is a tiny original CC0 triangle", async () => {
  const bytes = await readFile(fixture);
  assert.ok(bytes.length < 4096);
  assert.equal(bytes.subarray(0, 4).toString("utf8"), "glTF");
  const jsonLength = bytes.readUInt32LE(12);
  const json = bytes.subarray(20, 20 + jsonLength).toString("utf8");
  assert.match(json, /CC0-1\.0/);
  assert.match(json, /Hitchhiker Guide test fixture/);
  const stats = await inspectGlb(fixture);
  assert.equal(stats.triangles, 1);
  assert.equal(stats.textureMb, 0);
  assert.equal(stats.bytes, bytes.length);
});

test("optimizeGlb writes Draco and Meshopt GLBs and resizes textures", async () => {
  const dir = await tempDir();
  try {
    const meshoptOut = path.join(dir, "meshopt.glb");
    const dracoOut = path.join(dir, "draco.glb");
    const meshopt = await optimizeGlb(fixture, meshoptOut, { maxTexture: 2048, encoder: "meshopt" });
    const draco = await optimizeGlb(fixture, dracoOut, { maxTexture: 2048, encoder: "draco" });
    assert.equal(meshopt.triangles, 1);
    assert.equal(draco.triangles, 1);
    assert.ok(meshopt.bytes > 20);
    assert.ok(draco.bytes > 20);
    assert.equal((await readFile(meshoptOut)).subarray(0, 4).toString("utf8"), "glTF");
    assert.equal((await readFile(dracoOut)).subarray(0, 4).toString("utf8"), "glTF");
    const back = await inspectGlb(dracoOut);
    assert.equal(back.triangles, 1);

    const textured = path.join(dir, "textured.glb");
    const resized = path.join(dir, "resized.glb");
    await writeTextured(textured, solidPng(8));
    const before = await inspectGlb(textured);
    await optimizeGlb(textured, resized, { maxTexture: 4, encoder: "meshopt" });
    const after = await inspectGlb(resized);
    assert.equal(after.triangles, 1);
    assert.ok(after.textureMb < before.textureMb);
    await MeshoptDecoder.ready;
    const doc = await new NodeIO()
      .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder })
      .read(resized);
    const report = inspect(doc);
    assert.equal(report.textures.properties[0]?.resolution, "4x4");
    assert.equal(
      glbOutputPath(dir, "Chair Model.glb"),
      path.join(dir, ".hitchhiker", "assets", "3d", "Chair_Model.glb"),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("budget follows the motion appetite at levels 6, 8, and 10", () => {
  assert.equal(levelFromMotion(MOTION_8), 8);
  assert.equal(levelFromMotion("intro\nAppetite: 6 of 10. Appetite is a weight ceiling.\n"), 6);
  assert.equal(levelFromMotion("Appetite: 10 of 10. Done."), 10);
  assert.throws(() => levelFromMotion("no appetite here"), /Appetite/);

  const light = { bytes: 1000, triangles: 12, textureMb: 0.25 };
  const level6 = checkBudget(light, 6);
  assert.equal(level6.ok, false);
  assert.match(level6.reasons.join(" "), /poster/);
  assert.match(level6.reasons.join(" "), /appetite 8/i);
  assert.equal(checkBudget({ bytes: 0, triangles: 0, textureMb: 0 }, 6).ok, true);
  assert.deepEqual(checkBudgetFromMotion(light, MOTION_8).ok, true);

  const phoneOk = { bytes: PHONE_GLB_BYTES, triangles: PHONE_TRIANGLES, textureMb: PHONE_TEXTURE_MB };
  assert.equal(checkBudget(phoneOk, 8).ok, true);
  assert.equal(checkBudget(phoneOk, 10).ok, true);

  const heavy = {
    bytes: PHONE_GLB_BYTES + 1,
    triangles: PHONE_TRIANGLES + 1,
    textureMb: PHONE_TEXTURE_MB + 0.1,
  };
  for (const level of [8, 10]) {
    const result = checkBudget(heavy, level);
    assert.equal(result.ok, false);
    const text = result.reasons.join(" ");
    assert.match(text, /poster fallback on phones/);
    assert.match(text, /1\.5 MB/);
    assert.match(text, /150000/);
  }
  assert.throws(() => checkBudget(light, 0), /1 to 10/);
  assert.throws(() => checkBudget(light, 6.5), /1 to 10/);
});

test("Poly Haven search and download keep CC0 and the include map", async () => {
  const dir = await tempDir();
  try {
    const { fetchImpl, calls } = harness((call) => {
      if (call.url === "https://api.polyhaven.com/assets?t=models") {
        return jsonResponse({
          barrel: {
            name: "Wooden Barrel",
            tags: ["prop"],
            categories: ["containers"],
            authors: { Ada: {}, Bo: {} },
            thumbnail_url: "https://cdn.polyhaven.com/barrel.png",
          },
          rock: { name: "Rock", tags: ["nature"], authors: { Ada: {} } },
        });
      }
      if (call.url === "https://api.polyhaven.com/files/barrel") {
        return jsonResponse({
          authors: { Ada: {}, Bo: {} },
          gltf: {
            "1k": {
              gltf: {
                url: "https://cdn.polyhaven.com/barrel.gltf",
                include: { "scene.bin": { url: "https://cdn.polyhaven.com/scene.bin" } },
              },
            },
          },
        });
      }
      if (call.url === "https://cdn.polyhaven.com/barrel.gltf") return new Response("gltf-bytes");
      if (call.url === "https://cdn.polyhaven.com/scene.bin") return new Response("bin-bytes");
      throw new Error(`unexpected ${call.url}`);
    });
    const hits = await searchPoly("barrel", { fetchImpl });
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.licence, "CC0-1.0");
    assert.equal(hits[0]?.author, "Ada, Bo");
    assert.equal(hits[0]?.sourceUrl, "https://polyhaven.com/a/barrel");
    const saved = await downloadPoly("barrel", dir, { fetchImpl });
    assert.equal(saved.licence, "CC0-1.0");
    assert.equal(saved.author, "Ada, Bo");
    assert.equal(await readFile(saved.file, "utf8"), "gltf-bytes");
    assert.equal(await readFile(path.join(dir, "scene.bin"), "utf8"), "bin-bytes");
    assert.ok(calls.every((call) => call.authorization === undefined));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ambientCG prefers the 1K zip and refuses a non-commercial record", async () => {
  const dir = await tempDir();
  try {
    const catalog = {
      foundAssets: [
        {
          assetId: "3DApple002",
          displayName: "3D Apple 002",
          dataType: "3DModel",
          shortLink: "https://ambientcg.com/a/3DApple002",
          previewImage: "https://ambientcg.com/apple.png",
          downloadFolders: {
            default: {
              downloadFiletypeCategories: {
                zip: {
                  downloads: [
                    { attribute: "4K-JPG", fullDownloadPath: "https://ambientcg.com/get?file=apple-4k.zip" },
                    { attribute: "LQ-1K-JPG", fullDownloadPath: "https://ambientcg.com/get?file=apple-1k.zip" },
                  ],
                },
              },
            },
          },
        },
        { assetId: "3DLocked001", displayName: "Locked", dataType: "3DModel", license: "CC-BY-NC-4.0" },
      ],
    };
    const { fetchImpl, calls } = harness((call) => {
      if (call.url.startsWith("https://ambientcg.com/api/v2/full_json")) return jsonResponse(catalog);
      if (call.url === "https://ambientcg.com/get?file=apple-1k.zip") return new Response("zip-1k");
      throw new Error(`unexpected ${call.url}`);
    });
    const hits = await searchAmbient("apple", { fetchImpl });
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.id, "3DApple002");
    assert.equal(hits[0]?.licence, "CC0-1.0");
    assert.equal(hits[0]?.author, "ambientCG");
    assert.match(calls[0]?.url ?? "", /type=3d-model/);
    assert.doesNotMatch(calls[0]?.url ?? "", /type=3DModel/);
    const saved = await downloadAmbient("3DApple002", dir, { fetchImpl });
    assert.equal(saved.licence, "CC0-1.0");
    assert.equal(await readFile(saved.file, "utf8"), "zip-1k");
    await assert.rejects(() => downloadAmbient("3DLocked001", dir, { fetchImpl }), (error: unknown) => {
      assert.ok(error instanceof LicenceError);
      assert.match(error.message, /CC-BY-NC-4\.0/);
      return true;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Kenney parses the catalog and refuses a pack that is not CC0", async () => {
  const dir = await tempDir();
  try {
    const { fetchImpl, calls } = harness((call) => {
      if (call.url === "https://kenney.nl/assets/category:3D") {
        return textResponse(`
          <a href='https://kenney.nl/assets/category:3D'>3D</a>
          <h2><a href='https://kenney.nl/assets/city-kit-roads'>City Kit Roads</a></h2>
          <h2><a href='https://kenney.nl/assets/platformer-kit'>Platformer Kit</a></h2>
        `);
      }
      if (call.url === "https://kenney.nl/assets/city-kit-roads") {
        return textResponse(`
          <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>
          <a id="donate-text" href="https://kenney.nl/media/pages/assets/city-kit-roads/abc-99/kenney_city-kit-roads.zip">zip</a>
        `);
      }
      if (call.url.endsWith(".zip")) return new Response("kenney-zip");
      if (call.url === "https://kenney.nl/assets/locked") {
        return textResponse(`<a href="https://creativecommons.org/licenses/by-nc/4.0/">NC</a>`);
      }
      throw new Error(`unexpected ${call.url}`);
    });
    const hits = await searchKenney("city", { fetchImpl });
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.licence, "CC0-1.0");
    assert.equal(hits[0]?.author, "Kenney");
    const saved = await downloadKenney("city-kit-roads", dir, { fetchImpl });
    assert.equal(saved.licence, "CC0-1.0");
    assert.equal(await readFile(saved.file, "utf8"), "kenney-zip");
    assert.match(calls.map((call) => call.url).join("\n"), /kenney_city-kit-roads\.zip/);
    await assert.rejects(() => downloadKenney("locked", dir, { fetchImpl }), (error: unknown) => {
      assert.ok(error instanceof LicenceError);
      assert.match(error.message, /non-commercial/i);
      return true;
    });
    assert.equal(calls.some((call) => call.url.includes("locked") && call.url.endsWith(".zip")), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Quaternius saves a direct file and stops on an itch-only or non-commercial page", async () => {
  const dir = await tempDir();
  try {
    const { fetchImpl } = harness((call) => {
      if (call.url === "https://quaternius.com/") {
        return textResponse(`
          <a href="/packs/stylizednaturemegakit.html">Stylized Nature MegaKit</a>
          <a href="/packs/ultimatecars.html">Ultimate Cars</a>
        `);
      }
      if (call.url === "https://quaternius.com/packs/ultimatecars.html") {
        return textResponse(`
          <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>
          <a href="https://quaternius.com/files/ultimatecars.zip">zip</a>
        `);
      }
      if (call.url === "https://quaternius.com/files/ultimatecars.zip") return new Response("quat-zip");
      if (call.url === "https://quaternius.com/packs/stylizednaturemegakit.html") {
        return textResponse(`
          <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>
          <script>Itch.attachBuyButton(button, {user:"quaternius", game:"stylized-nature-megakit"})</script>
        `);
      }
      if (call.url === "https://quaternius.com/packs/locked.html") {
        return textResponse(`<a href="https://creativecommons.org/licenses/by-nc/4.0/">NC</a>`);
      }
      throw new Error(`unexpected ${call.url}`);
    });
    const hits = await searchQuat("nature", { fetchImpl });
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.id, "stylizednaturemegakit");
    assert.equal(hits[0]?.licence, "CC0-1.0");
    assert.equal(hits[0]?.author, "Quaternius");
    const saved = await downloadQuat("ultimatecars", dir, { fetchImpl });
    assert.equal(saved.licence, "CC0-1.0");
    assert.equal(await readFile(saved.file, "utf8"), "quat-zip");
    await assert.rejects(
      () => downloadQuat("stylizednaturemegakit", dir, { fetchImpl }),
      /itch\.io/,
    );
    const names = await readdir(dir);
    assert.deepEqual(names, ["ultimatecars.zip"]);
    await assert.rejects(() => downloadQuat("locked", dir, { fetchImpl }), (error: unknown) => {
      assert.ok(error instanceof LicenceError);
      assert.match(error.message, /non-commercial/i);
      return true;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Sketchfab keeps CC0 and CC-BY, and refuses the rest without a download", async () => {
  const dir = await tempDir();
  try {
    const glb = await readFile(fixture);
    const { fetchImpl, calls } = harness((call) => {
      if (call.url.startsWith("https://api.sketchfab.com/v3/search")) {
        return jsonResponse({
          results: [
            sketchModel("cc0-uid", "Side Chair", "CC0 Public Domain", "Ada"),
            sketchModel("by-uid", "Scifi Chair", "CC Attribution", "Bo"),
            sketchModel("nc-uid", "Locked Chair", "CC Attribution-NonCommercial", "Cy"),
          ],
        });
      }
      if (call.url === "https://api.sketchfab.com/v3/models/by-uid") {
        return jsonResponse(sketchModel("by-uid", "Scifi Chair", "CC Attribution", "Bo"));
      }
      if (call.url === "https://api.sketchfab.com/v3/models/by-uid/download") {
        return jsonResponse({ glb: { url: "https://cdn.sketchfab.com/by.glb" } });
      }
      if (call.url === "https://cdn.sketchfab.com/by.glb") return new Response(glb);
      if (call.url === "https://api.sketchfab.com/v3/models/nc-uid") {
        return jsonResponse(sketchModel("nc-uid", "Locked Chair", "CC Attribution-NonCommercial", "Cy"));
      }
      if (call.url === "https://api.sketchfab.com/v3/models/cc0-uid") {
        return jsonResponse(sketchModel("cc0-uid", "Side Chair", "CC0 Public Domain", "Ada"));
      }
      throw new Error(`unexpected ${call.url}`);
    });
    const hits = await searchSketch("chair", { fetchImpl });
    assert.deepEqual(
      hits.map((hit) => hit.licence),
      ["CC0-1.0", "CC-BY-4.0"],
    );
    assert.equal(hits[0]?.author, "Ada");
    assert.equal(calls[0]?.authorization, undefined);
    assert.match(calls[0]?.url ?? "", /licenses=cc0%2Cby|licenses=cc0,by/);
    const saved = await downloadSketch("by-uid", dir, { fetchImpl, token: KEY, keychain: null, env: {} });
    assert.equal(saved.licence, "CC-BY-4.0");
    assert.equal(saved.author, "Bo");
    assert.equal((await readFile(saved.file)).subarray(0, 4).toString("utf8"), "glTF");
    const authed = calls.find((call) => call.url.endsWith("/download"));
    assert.equal(authed?.authorization, `Bearer ${KEY}`);
    assert.equal(calls.find((call) => call.url.includes("cdn.sketchfab.com"))?.authorization, undefined);
    await assert.rejects(() => downloadSketch("nc-uid", dir, { fetchImpl, token: KEY, keychain: null }), (error: unknown) => {
      assert.ok(error instanceof LicenceError);
      assert.match(error.message, /NonCommercial/);
      return true;
    });
    assert.equal(calls.some((call) => call.url.includes("nc-uid/download")), false);
    await assert.rejects(
      () => downloadSketch("cc0-uid", dir, { fetchImpl, keychain: null, env: {} }),
      /SKETCHFAB_TOKEN/,
    );
    assert.equal(calls.some((call) => call.url.includes("cc0-uid/download")), false);
    assert.throws(() => licenceFromLabel("Standard"), LicenceError);
    assert.equal(licenceFromLabel("CC0 Public Domain"), "CC0-1.0");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("credits append and the options stay in plain words", async () => {
  const dir = await tempDir();
  try {
    const creditsPath = path.join(dir, "CREDITS.json");
    const fixtureCredit: CreditRecord = {
      name: "Test triangle",
      author: "Hitchhiker Guide test fixture",
      license: "CC0-1.0",
      link: "https://example.com/triangle",
      usedFor: "optimizer fixture",
      category: "3D models",
    };
    const byCredit: CreditRecord = {
      name: "Scifi Chair",
      author: "Bo & Co",
      license: "CC-BY-4.0",
      link: "https://sketchfab.com/3d-models/by-uid",
      usedFor: "hero",
      category: "3D models",
    };
    await appendCredit(fixtureCredit, creditsPath);
    const updated = await appendCredit({ ...fixtureCredit, usedFor: "still the fixture" }, creditsPath);
    await appendCredit(byCredit, creditsPath);
    assert.equal(updated.length, 1);
    const rows = JSON.parse(await readFile(creditsPath, "utf8")) as CreditRecord[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.license, "CC0-1.0");
    assert.equal(rows[0]?.usedFor, "still the fixture");
    const snippet = renderCreditsSnippet(rows);
    assert.match(snippet, /<section id="credits">/);
    assert.match(snippet, /Test triangle/);
    assert.match(snippet, /CC0-1\.0/);
    assert.match(snippet, /Credit is required/);
    assert.match(snippet, /Bo &amp; Co/);
    const low = explainOptions(6);
    const high = explainOptions(8);
    assert.deepEqual(low.map((card) => card.id), ["a", "b", "c", "d", "e", "f"]);
    assert.match(low.map((card) => card.plain).join(" "), /appetite 8/i);
    assert.match(high.map((card) => `${card.plain} ${card.cost}`).join(" "), /1\.5 MB/);
    assert.match(high.map((card) => card.cost).join(" "), /\$0\.20/);
    assert.match(high.find((card) => card.id === "e")?.cost ?? "", /30 credits/);
    assert.equal(high.find((card) => card.id === "f")?.cost, "The artist's quote");
    const spoken = [...low, ...high].map((card) => `${card.title} ${card.plain} ${card.cost}`).join("\n");
    assert.equal(spoken.includes("!"), false);
    assert.equal(spoken.includes("\u2014"), false);
    for (const word of BANNED_WORDS) {
      assert.equal(new RegExp(`\\b${word}\\b`, "i").test(spoken), false, word);
    }
    for (const phrase of BANNED_PHRASES) assert.equal(spoken.toLowerCase().includes(phrase), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("generation keeps polling for the Imagine ten-minute budget", () => {
  assert.equal(POLL_INTERVAL_MS, 2_000);
  assert.equal(POLL_BUDGET_MS, 10 * 60 * 1000);
  assert.ok(POLL_INTERVAL_MS * Math.ceil(POLL_BUDGET_MS / POLL_INTERVAL_MS) >= POLL_BUDGET_MS);
});

test("generation quotes, refuses the cap, and waits for a yes", async () => {
  const dir = await tempDir();
  try {
    let confirms = 0;
    const quiet = harness(() => {
      throw new Error("fetch must not run");
    });
    await assert.rejects(
      () =>
        generate3d(
          { provider: "tripo", prompt: "a small crate" },
          {
            confirm: async () => {
              confirms += 1;
              return true;
            },
            cap: 0.19,
            fetchImpl: quiet.fetchImpl,
            key: KEY,
            outDir: dir,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GenerationCapError);
        assert.equal(error.usd, 0.2);
        assert.match(error.message, /no charge was recorded/i);
        return true;
      },
    );
    assert.equal(confirms, 0);
    assert.equal(quiet.calls.length, 0);

    await assert.rejects(
      () =>
        generate3d(
          { provider: "meshy", prompt: "a small crate" },
          {
            confirm: async () => {
              confirms += 1;
              return true;
            },
            cap: 0.59,
            fetchImpl: quiet.fetchImpl,
            key: KEY,
            outDir: dir,
          },
        ),
      GenerationCapError,
    );
    assert.equal(confirms, 0);

    const declined = harness(() => {
      throw new Error("fetch must not run");
    });
    await assert.rejects(
      () =>
        generate3d(
          { provider: "tripo", prompt: "a small crate" },
          {
            confirm: async (quote) => {
              assert.equal(quote.usd, quoteGeneration({ provider: "tripo", prompt: "a small crate" }).usd);
              return false;
            },
            cap: 5,
            fetchImpl: declined.fetchImpl,
            key: KEY,
            outDir: dir,
          },
        ),
      GenerationDeclinedError,
    );
    assert.equal(declined.calls.length, 0);
    assert.equal((await readdir(dir)).length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Tripo and Meshy poll to a GLB only after a yes, and errors record no charge", async () => {
  const dir = await tempDir();
  try {
    const glb = await readFile(fixture);
    const tripo = scripted([
      () => jsonResponse({ code: 0, data: { task_id: "task_1" } }),
      () => jsonResponse({ code: 0, data: { status: "running" } }),
      () =>
        jsonResponse({
          code: 0,
          data: {
            status: "success",
            output: { model_url: "https://cdn.tripo3d.ai/model.glb" },
            credits_consumed: 100,
          },
        }),
      () => new Response(glb),
    ]);
    let confirmed = false;
    const text = await generate3d(
      { provider: "tripo", prompt: "a small crate" },
      {
        confirm: async (quote) => {
          confirmed = true;
          assert.equal(quote.usd, 0.2);
          assert.equal(tripo.calls.length, 0);
          return true;
        },
        cap: 5,
        fetchImpl: tripo.fetchImpl,
        key: KEY,
        outDir: dir,
      },
    );
    assert.equal(confirmed, true);
    assert.equal(text.usd, 0.2);
    assert.equal((await readFile(text.file)).subarray(0, 4).toString("utf8"), "glTF");
    assert.equal(tripo.calls[0]?.url, TRIPO_TEXT_URL);
    assert.equal(tripo.calls[0]?.method, "POST");
    assert.equal(tripo.calls[0]?.authorization, `Bearer ${KEY}`);
    const posted = JSON.parse(tripo.calls[0]?.body ?? "{}") as { model?: string; face_limit?: number };
    assert.equal(posted.model, "v3.1-20260211");
    assert.equal(posted.face_limit, 50000);
    assert.equal(tripo.calls.at(-1)?.authorization, undefined);

    const tripoImage = scripted([
      () => jsonResponse({ code: 0, data: { task_id: "task_img" } }),
      () =>
        jsonResponse({
          code: 0,
          data: { status: "success", output: { model_url: "https://cdn.tripo3d.ai/image.glb" } },
        }),
      () => new Response(glb),
    ]);
    const image = await generate3d(
      { provider: "tripo", image: "https://example.com/crate.png" },
      {
        confirm: async (quote) => {
          assert.equal(quote.usd, 0.3);
          return true;
        },
        cap: 5,
        fetchImpl: tripoImage.fetchImpl,
        key: KEY,
        outDir: dir,
      },
    );
    assert.equal(image.usd, 0.3);
    assert.equal(tripoImage.calls[0]?.url, TRIPO_IMAGE_URL);
    const imageBody = JSON.parse(tripoImage.calls[0]?.body ?? "{}") as { input?: string };
    assert.equal(imageBody.input, "https://example.com/crate.png");

    const failed = scripted([
      () => jsonResponse({ code: 0, data: { task_id: "task_bad" } }),
      () => jsonResponse({ code: 0, data: { status: "failed", error_message: `nope ${KEY}` } }),
    ]);
    await assert.rejects(
      () =>
        generate3d(
          { provider: "tripo", prompt: "a small crate" },
          { confirm: async () => true, cap: 5, fetchImpl: failed.fetchImpl, key: KEY, outDir: dir },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GenerationFailedError);
        assert.match(error.message, /no charge was recorded/i);
        assert.equal(error.message.includes(KEY), false);
        return true;
      },
    );

    const httpFail = scripted([() => jsonResponse({ message: KEY }, 500)]);
    await assert.rejects(
      () =>
        generate3d(
          { provider: "tripo", prompt: "a small crate" },
          { confirm: async () => true, cap: 5, fetchImpl: httpFail.fetchImpl, key: KEY, outDir: dir },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GenerationFailedError);
        assert.match(error.message, /HTTP 500/);
        assert.equal(error.message.includes(KEY), false);
        return true;
      },
    );

    const meshyImage = scripted([
      () => jsonResponse({ result: "img_1" }),
      () =>
        jsonResponse({
          status: "SUCCEEDED",
          model_urls: { glb: "https://cdn.meshy.ai/img.glb" },
        }),
      () => new Response(glb),
    ]);
    const made = await generate3d(
      { provider: "meshy", image: "https://example.com/crate.png" },
      {
        confirm: async (quote) => {
          assert.equal(quote.usd, 0.6);
          return true;
        },
        cap: 5,
        fetchImpl: meshyImage.fetchImpl,
        key: KEY,
        outDir: dir,
      },
    );
    assert.equal(made.usd, 0.6);
    assert.equal(meshyImage.calls[0]?.url, MESHY_IMAGE_URL);
    const meshyBody = JSON.parse(meshyImage.calls[0]?.body ?? "{}") as {
      ai_model?: string;
      target_polycount?: number;
    };
    assert.equal(meshyBody.ai_model, "meshy-7.1");
    assert.equal(meshyBody.target_polycount, 30000);

    const meshyText = scripted([
      () => jsonResponse({ result: "prev_1" }),
      () => jsonResponse({ status: "SUCCEEDED" }),
      () => jsonResponse({ result: "ref_1" }),
      () => jsonResponse({ status: "SUCCEEDED", model_urls: { glb: "https://cdn.meshy.ai/text.glb" } }),
      () => new Response(glb),
    ]);
    let textConfirms = 0;
    const meshy = await generate3d(
      { provider: "meshy", prompt: "a small crate" },
      {
        confirm: async () => {
          textConfirms += 1;
          assert.equal(meshyText.calls.length, 0);
          return true;
        },
        cap: 5,
        fetchImpl: meshyText.fetchImpl,
        key: KEY,
        outDir: dir,
      },
    );
    assert.equal(textConfirms, 1);
    assert.equal(meshy.usd, 0.6);
    assert.equal(meshyText.calls[0]?.url, MESHY_TEXT_URL);
    assert.equal(meshyText.calls[2]?.url, MESHY_TEXT_URL);
    const preview = JSON.parse(meshyText.calls[0]?.body ?? "{}") as { mode?: string };
    const refine = JSON.parse(meshyText.calls[2]?.body ?? "{}") as { mode?: string; preview_task_id?: string };
    assert.equal(preview.mode, "preview");
    assert.equal(refine.mode, "refine");
    assert.equal(refine.preview_task_id, "prev_1");

    const refineFail = scripted([
      () => jsonResponse({ result: "prev_2" }),
      () => jsonResponse({ status: "SUCCEEDED" }),
      () => jsonResponse({ result: "ref_2" }),
      () => jsonResponse({ status: "FAILED", task_error: { message: "refine broke" }, consumed_credits: 0 }),
    ]);
    await assert.rejects(
      () =>
        generate3d(
          { provider: "meshy", prompt: "a small crate" },
          { confirm: async () => true, cap: 5, fetchImpl: refineFail.fetchImpl, key: KEY, outDir: dir },
        ),
      (error: unknown) => {
        assert.ok(error instanceof GenerationFailedError);
        assert.match(error.message, /refine/i);
        assert.match(error.message, /no charge was recorded/i);
        return true;
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function scripted(steps: Array<(call: Call) => Response>): { fetchImpl: typeof fetch; calls: Call[] } {
  let index = 0;
  return harness((call) => {
    const step = steps[index];
    index += 1;
    if (step === undefined) throw new Error(`unexpected extra call ${call.url}`);
    return step(call);
  });
}

function sketchModel(uid: string, name: string, label: string, author: string): Record<string, unknown> {
  return {
    uid,
    name,
    license: { label },
    user: { displayName: author, username: author.toLowerCase() },
    viewerUrl: `https://sketchfab.com/3d-models/${uid}`,
    thumbnails: { images: [{ url: `https://cdn.sketchfab.com/${uid}.jpg` }] },
  };
}

async function writeTextured(file: string, png: Uint8Array): Promise<void> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc
    .createAccessor()
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setType("VEC3")
    .setBuffer(buffer);
  const texcoord = doc
    .createAccessor()
    .setArray(new Float32Array([0, 0, 1, 0, 0, 1]))
    .setType("VEC2")
    .setBuffer(buffer);
  const indices = doc
    .createAccessor()
    .setArray(new Uint16Array([0, 1, 2]))
    .setType("SCALAR")
    .setBuffer(buffer);
  const texture = doc.createTexture("swatch").setImage(png).setMimeType("image/png");
  const material = doc.createMaterial("paint").setBaseColorTexture(texture);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", position)
    .setAttribute("TEXCOORD_0", texcoord)
    .setIndices(indices)
    .setMaterial(material);
  doc.createScene("main").addChild(doc.createNode("swatch").setMesh(doc.createMesh("swatch").addPrimitive(prim)));
  await new NodeIO().write(file, doc);
}

function solidPng(size: number): Uint8Array {
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      const index = 1 + x * 4;
      const on = x < size / 2;
      row[index] = on ? 12 : 230;
      row[index + 1] = on ? 40 : 20;
      row[index + 2] = on ? 180 : 30;
      row[index + 3] = 255;
    }
    rows.push(row);
  }
  const idat = deflateSync(Buffer.concat(rows));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}
