import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@hitchhiker/engine";
import { STT_QUOTE_FILENAME } from "../src/server/settings.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const voiceUrl = new URL("../../voice/src/xai-stt.ts", import.meta.url);
const ROUTES = ["/", "/brand", "/approve", "/hh-dashboard", "/gallery", "/motion"] as const;

interface RateCard {
  rest: { ratePerHour: number; priceText: string };
  streaming: { ratePerHour: number; priceText: string };
}

async function rateCard(): Promise<RateCard> {
  const loaded: unknown = await import(voiceUrl.href);
  assert.ok(typeof loaded === "object" && loaded !== null);
  const rates = (loaded as { XAI_STT_RATES?: unknown }).XAI_STT_RATES;
  assert.ok(typeof rates === "object" && rates !== null);
  const record = rates as { rest?: unknown; streaming?: unknown };
  assert.ok(isSide(record.rest) && isSide(record.streaming));
  return { rest: record.rest, streaming: record.streaming };
}

function isSide(value: unknown): value is { ratePerHour: number; priceText: string } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as { ratePerHour?: unknown; priceText?: unknown };
  return typeof record.ratePerHour === "number" && typeof record.priceText === "string";
}

function tempProject(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-settings-"));
}

async function withDesk(run: (handle: ServerHandle, dir: string) => Promise<void>): Promise<void> {
  const dir = tempProject();
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
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

function routeNav(html: string): string {
  const matched = /<nav class="hh-routes" aria-label="Desk routes">[\s\S]*?<\/nav>/.exec(html);
  assert.ok(matched?.[0]);
  return matched[0];
}

function deskMenu(html: string): string {
  const header = /<header[\s\S]*?<\/header>/.exec(html);
  assert.ok(header?.[0]);
  const menu = /<details class="hh-desk-menu[\s\S]*?<\/details>/.exec(header[0]);
  assert.ok(menu?.[0], "Desk menu is in the header");
  return menu[0];
}

function assertSixRoutes(html: string): void {
  const nav = routeNav(html);
  const links = [...nav.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(
    (match) => `${match[1]} ${match[2]}`,
  );
  assert.deepEqual(
    links,
    ROUTES.map((href, index) => {
      const labels = ["Desk", "Brand kit", "Approvals", "Drive", "Gallery", "Motion"];
      return `${href} ${labels[index]}`;
    }),
  );
  assert.equal(nav.includes("/settings"), false);
  assert.equal(nav.includes("Settings"), false);
}

async function get(handle: ServerHandle, pathname: string): Promise<string> {
  const response = await fetch(new URL(pathname, handle.url));
  assert.equal(response.status, 200);
  return response.text();
}

test("settings reads the voice rate card and does not retype it", async () => {
  const rates = await rateCard();
  const settings = readFileSync(path.join(here, "../src/server/settings.ts"), "utf8");
  const routes = readFileSync(path.join(here, "../src/server/routes.ts"), "utf8");
  const voice = readFileSync(fileURLToPath(voiceUrl), "utf8");
  assert.match(settings, /voice\/src\/xai-stt\.ts/);
  assert.match(voice, /export const XAI_STT_RATES/);
  for (const source of [settings, routes]) {
    assert.equal(source.includes(rates.rest.priceText), false);
    assert.equal(source.includes(rates.streaming.priceText), false);
    assert.equal(source.includes(String(rates.rest.ratePerHour)), false);
    assert.equal(source.includes(String(rates.streaming.ratePerHour)), false);
  }
});

test("GET /settings shows voice, model, effort, and both rates, with xAI off", async () => {
  const rates = await rateCard();
  await withDesk(async (handle, dir) => {
    const html = await get(handle, "/settings");
    assert.match(html, /data-settings="voice"/);
    assert.match(html, /data-settings="model"/);
    assert.match(html, /data-settings="effort"/);
    assert.match(html, /name="voice" value="browser" checked/);
    assert.doesNotMatch(html, /name="voice" value="local" checked/);
    assert.doesNotMatch(html, /name="voice" value="xai" checked/);
    assert.match(html, /Google/);
    assert.match(html, /Microsoft/);
    assert.match(html, /may leave/);
    assert.match(html, /name="model"[^>]*value="grok-4\.7"/);
    assert.match(html, /name="effort" value="medium" checked/);
    assert.match(html, /name="effort" value="high"/);
    assert.match(html, /name="effort" value="xhigh"/);
    assert.match(html, new RegExp(`data-stt-rate="rest"[^>]*data-per-hour="${rates.rest.ratePerHour}"`));
    assert.match(
      html,
      new RegExp(`data-stt-rate="streaming"[^>]*data-per-hour="${rates.streaming.ratePerHour}"`),
    );
    assert.match(html, new RegExp(`${escapeRegExp(rates.rest.priceText)} per hour`));
    assert.match(html, new RegExp(`${escapeRegExp(rates.streaming.priceText)} per hour`));
    assert.match(html, /I accept these rates/);
    assert.doesNotMatch(html, /name="acceptQuote" value="yes" checked/);
    assert.equal(html.replace("<!DOCTYPE html>", "").includes("!"), false);
    assert.equal(html.includes("\u2014"), false);
    assert.match(html, /name="viewport" content="width=device-width/);
    assert.match(html, /class="hh-qcard hh-rise/);
    assert.match(html, /hh-wordmark/);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", STT_QUOTE_FILENAME)), false);
    assert.equal(loadConfig(dir).voiceEngine, "local");
    assertSixRoutes(html);
    const menu = deskMenu(html);
    assert.match(menu, /href="\/settings"/);
    assert.match(menu, /aria-current="page"/);
    assert.equal(routeNav(html).includes("aria-current"), false);
  });
});

test("the desk menu holds settings and the route nav stays at six items", async () => {
  await withDesk(async (handle) => {
    for (const pathname of ["/", "/brand", "/approve", "/gallery", "/motion", "/hh-dashboard"]) {
      const html = await get(handle, pathname);
      const menu = deskMenu(html);
      assert.match(menu, /href="\/settings"/);
      assert.doesNotMatch(menu, /aria-current/);
      if (html.includes('class="hh-routes"')) {
        assertSixRoutes(html);
        assert.equal(menu.includes(routeNav(html)), false);
      } else {
        assert.equal(pathname, "/hh-dashboard");
      }
    }
    const home = await get(handle, "/");
    const map = /<nav class="hh-rise hh-rise--4"[\s\S]*?<\/nav>/.exec(home);
    assert.ok(map?.[0]);
    assert.equal(map[0].match(/<li\b/g)?.length, 6);
    assert.equal(map[0].includes("Settings"), false);
    assert.equal(map[0].includes("/settings"), false);
  });
});

test("xAI speech-to-text is refused until the quote is accepted, then it saves", async () => {
  const rates = await rateCard();
  await withDesk(async (handle, dir) => {
    const page = await get(handle, "/settings");
    const token = tokenFrom(page);
    const headers = { "content-type": "application/json", "x-hh-csrf": token };
    const refused = await fetch(new URL("/settings", handle.url), {
      method: "POST",
      headers,
      body: JSON.stringify({
        voice: "xai",
        model: "grok-4.7",
        effort: "high",
        acceptQuote: false,
        restPerHour: 0,
        streamingPerHour: 0,
        restPriceText: "$0",
      }),
    });
    assert.equal(refused.status, 409);
    const refusedBody = (await refused.json()) as { error?: string };
    assert.match(refusedBody.error ?? "", /stays off until you accept the rate/);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", STT_QUOTE_FILENAME)), false);
    assert.equal(loadConfig(dir).voiceEngine, "local");

    const accepted = await fetch(new URL("/settings", handle.url), {
      method: "POST",
      headers,
      body: JSON.stringify({
        voice: "local",
        model: "grok-4.7",
        effort: "xhigh",
        acceptQuote: true,
        restPerHour: 0,
        restPriceText: "$0",
      }),
    });
    assert.equal(accepted.status, 200);
    const acceptedBody = (await accepted.json()) as {
      accepted?: boolean;
      voice?: string;
      restPerHour?: number;
      streamingPerHour?: number;
      restPriceText?: string;
      streamingPriceText?: string;
    };
    assert.equal(acceptedBody.accepted, true);
    assert.equal(acceptedBody.voice, "local");
    assert.equal(acceptedBody.restPerHour, rates.rest.ratePerHour);
    assert.equal(acceptedBody.streamingPerHour, rates.streaming.ratePerHour);
    assert.equal(acceptedBody.restPriceText, rates.rest.priceText);
    assert.equal(acceptedBody.streamingPriceText, rates.streaming.priceText);
    const stored = JSON.parse(
      readFileSync(path.join(dir, ".hitchhiker", STT_QUOTE_FILENAME), "utf8"),
    ) as {
      restPerHour?: number;
      streamingPerHour?: number;
      restPriceText?: string;
      streamingPriceText?: string;
    };
    assert.equal(stored.restPerHour, rates.rest.ratePerHour);
    assert.equal(stored.streamingPerHour, rates.streaming.ratePerHour);
    assert.equal(stored.restPriceText, rates.rest.priceText);
    assert.equal(stored.streamingPriceText, rates.streaming.priceText);
    assert.equal(loadConfig(dir).voiceEngine, "local");
    assert.equal(loadConfig(dir).effort, "xhigh");
    assert.equal(loadConfig(dir).ai.effort.default, "xhigh");

    const enabled = await fetch(new URL("/settings", handle.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ voice: "xai", model: "grok-4.7", effort: "xhigh" }),
    });
    assert.equal(enabled.status, 200);
    const enabledBody = (await enabled.json()) as { voice?: string; accepted?: boolean };
    assert.equal(enabledBody.voice, "xai");
    assert.equal(enabledBody.accepted, true);
    assert.equal(loadConfig(dir).voiceEngine, "xai");

    const again = await get(handle, "/settings");
    assert.match(again, /name="voice" value="xai" checked/);
    assert.match(again, new RegExp(`${escapeRegExp(rates.rest.priceText)} per hour`));
    assert.match(again, new RegExp(`${escapeRegExp(rates.streaming.priceText)} per hour`));
  });
});

test("a form post refuses xAI without the checkbox and saves it after acceptance", async () => {
  const rates = await rateCard();
  await withDesk(async (handle, dir) => {
    const page = await get(handle, "/settings");
    const token = tokenFrom(page);
    const missing = await fetch(new URL("/settings", handle.url), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        voice: "xai",
        model: "grok-4.7",
        effort: "medium",
      }).toString(),
    });
    assert.equal(missing.status, 403);

    const refused = await fetch(new URL("/settings", handle.url), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        csrf: token,
        voice: "xai",
        model: "grok-4.7",
        effort: "medium",
      }).toString(),
    });
    assert.equal(refused.status, 409);
    const refusedHtml = await refused.text();
    assert.match(refusedHtml, /stays off until you accept the rate/);
    assert.match(refusedHtml, new RegExp(escapeRegExp(rates.rest.priceText)));
    assert.match(refusedHtml, new RegExp(escapeRegExp(rates.streaming.priceText)));
    assert.equal(loadConfig(dir).voiceEngine, "local");

    const saved = await fetch(new URL("/settings", handle.url), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        csrf: token,
        voice: "xai",
        model: "grok-4.7",
        effort: "high",
        acceptQuote: "yes",
      }).toString(),
    });
    assert.equal(saved.status, 200);
    const html = await saved.text();
    assert.match(html, /Saved\. xAI speech-to-text is on at the accepted rate/);
    assert.match(html, /name="voice" value="xai" checked/);
    assert.match(html, /name="effort" value="high" checked/);
    assert.equal(html.replace("<!DOCTYPE html>", "").includes("!"), false);
    assert.equal(loadConfig(dir).voiceEngine, "xai");
    assert.equal(loadConfig(dir).effort, "high");
  });
});

test("a bad effort does not enable xAI or write the quote", async () => {
  await withDesk(async (handle, dir) => {
    const page = await get(handle, "/settings");
    const token = tokenFrom(page);
    const response = await fetch(new URL("/settings", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-hh-csrf": token },
      body: JSON.stringify({ voice: "xai", model: "grok-4.7", effort: "huge", acceptQuote: true }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? "", /medium, high, or xhigh/);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", STT_QUOTE_FILENAME)), false);
    assert.equal(loadConfig(dir).voiceEngine, "local");
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
