import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { meta as analyticsMeta } from "../recipes/analytics/meta.ts";
import { dryRunAnalytics, planTrack } from "../recipes/analytics/track.ts";
import { allKpiEvents, isKpiEvent } from "../recipes/analytics/events.ts";
import { meta as blogMeta, dryRunBlog } from "../recipes/blog/dry-run.ts";
import { readPost } from "../recipes/blog/read-post.ts";
import { meta as bookingMeta, dryRunBooking } from "../recipes/booking/dry-run.ts";
import { meta as contactMeta, dryRunContact } from "../recipes/contact/dry-run.ts";
import { meta as newsletterMeta } from "../recipes/newsletter/meta.ts";
import { ADAPTERS, adapterById, subscribe } from "../recipes/newsletter/adapters.ts";
import { dryRunNewsletter } from "../recipes/newsletter/dry-run.ts";
import { meta as portfolioMeta, dryRunPortfolio } from "../recipes/portfolio/dry-run.ts";
import { meta as resendMeta, dryRunResend } from "../recipes/resend/dry-run.ts";
import { meta as shopifyMeta, dryRunShopify } from "../recipes/shopify/dry-run.ts";
import { meta as stripeMeta, dryRunStripe } from "../recipes/stripe/dry-run.ts";
import { meta as videoMeta, dryRunVideo } from "../recipes/video/dry-run.ts";
import { reportBlankBundle } from "../shared/bundle-report.ts";
import { cssScrollFor } from "../shared/css-scroll.ts";
import { FFMPEG_MISSING, planImages, planVideo, optimizeMedia } from "../shared/optimize-media.ts";
import { fetchAssets } from "../shared/fetch-assets.ts";
import { bootNamed, registerEffect, resetEffects, wireLenis } from "../shared/motion.ts";
import { parseState, playState, type TheatreCoreLike } from "../shared/theatre-loader.ts";
import { fadeTargetOpacity } from "../shared/vanilla.ts";
import { claimCanvas, pauseCommand, shouldUsePoster } from "../shared/webgl.ts";
import { listRecipes, listTemplates, scaffold, type TemplateId } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "..");

const metas = [
  contactMeta,
  resendMeta,
  newsletterMeta,
  stripeMeta,
  shopifyMeta,
  bookingMeta,
  blogMeta,
  portfolioMeta,
  videoMeta,
  analyticsMeta,
];

test("listTemplates names the three starters", () => {
  const listed = listTemplates();
  assert.deepEqual(
    listed.map((item) => item.id),
    ["astro-default", "next-app", "vite-react-world"],
  );
  assert.deepEqual(
    listed.map((item) => item.stack),
    ["astro", "next", "vite-react"],
  );
  for (const item of listed) {
    assert.equal(path.basename(item.dir), item.id);
  }
});

test("listRecipes matches each recipe meta", () => {
  const listed = listRecipes();
  assert.equal(listed.length, metas.length);
  for (const recipe of listed) {
    const meta = metas.find((item) => item.id === recipe.id);
    assert.ok(meta, recipe.id);
    assert.deepEqual(recipe.stacks, [...meta.stacks]);
    assert.deepEqual(recipe.env, [...meta.env]);
    assert.equal(recipe.licence, meta.licence);
    assert.equal(recipe.licence, "MIT");
  }
});

test("registerEffect boots only the named loader", async () => {
  resetEffects();
  const ran: string[] = [];
  registerEffect("lenis", () => {
    ran.push("lenis");
  });
  registerEffect("vanilla", () => {
    ran.push("vanilla");
  });
  const started = await bootNamed(["vanilla"]);
  assert.deepEqual(started, ["vanilla"]);
  assert.deepEqual(ran, ["vanilla"]);
  resetEffects();
});

test("wireLenis uses one ticker callback and updates ScrollTrigger on scroll", () => {
  const added: Array<(time: number) => void> = [];
  const removed: Array<(time: number) => void> = [];
  let smoothed: number | undefined;
  const rafs: number[] = [];
  let scrollListener: (() => void) | undefined;
  let destroyed = false;
  let updates = 0;
  const stop = wireLenis(
    {
      add(fn) {
        added.push(fn);
      },
      remove(fn) {
        removed.push(fn);
      },
      lagSmoothing(value) {
        smoothed = value;
      },
    },
    {
      raf(time) {
        rafs.push(time);
      },
      on(_event, callback) {
        scrollListener = callback;
      },
      destroy() {
        destroyed = true;
      },
    },
    {
      update() {
        updates += 1;
      },
    },
  );
  assert.equal(added.length, 1);
  assert.equal(smoothed, 0);
  const tick = added[0];
  assert.ok(tick);
  tick(1.5);
  assert.deepEqual(rafs, [1500]);
  assert.ok(scrollListener);
  scrollListener();
  assert.equal(updates, 1);
  stop();
  assert.equal(removed.length, 1);
  assert.equal(destroyed, true);
});

test("one WebGL canvas id is claimed and a second id throws", () => {
  assert.equal(claimCanvas(null, "hh-canvas"), "hh-canvas");
  assert.equal(claimCanvas("hh-canvas", "hh-canvas"), "hh-canvas");
  assert.throws(() => claimCanvas("hh-canvas", "other"), /one context per page/);
  assert.equal(shouldUsePoster({ reducedMotion: false, viewportWidth: 390, saveData: false, cores: 8 }), true);
  assert.equal(shouldUsePoster({ reducedMotion: false, viewportWidth: 1440, saveData: true, cores: 8 }), true);
  assert.equal(shouldUsePoster({ reducedMotion: false, viewportWidth: 1440, saveData: false, cores: 8 }), false);
  assert.equal(pauseCommand(false), "pause");
  assert.equal(pauseCommand(true), "resume");
  assert.equal(fadeTargetOpacity(true, false), "1");
});

test("CSS scroll-driven animations refuse a Lenis page", () => {
  assert.throws(() => cssScrollFor("lenis+scrolltrigger"), /do not run on a Lenis page/);
  const css = cssScrollFor("native");
  assert.match(css, /@supports \(animation-timeline: view\(\)\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.equal(cssScrollFor("none"), "");
});

test("theatre playback follows the shared ticker and skips reduced motion", async () => {
  const source = await readFile(path.join(packageRoot, "shared", "theatre-loader.ts"), "utf8");
  assert.equal(source.includes("@theatre/studio"), false);
  assert.equal(source.includes("import "), true);
  const state = parseState(await readFile(path.join(packageRoot, "shared", "theatre-home.json"), "utf8"));
  const added: Array<(time: number) => void> = [];
  let played = false;
  const core: TheatreCoreLike = {
    createRafDriver() {
      return {
        tick() {},
      };
    },
    getProject() {
      return {
        ready: Promise.resolve(undefined),
        sheet() {
          return {
            sequence: {
              play() {
                played = true;
              },
              pause() {},
            },
          };
        },
      };
    },
  };
  const skipped = playState(state, core, {
    add() {},
    remove() {},
    lagSmoothing() {},
  }, { reducedMotion: true });
  skipped();
  assert.equal(played, false);
  playState(state, core, {
    add(fn) {
      added.push(fn);
    },
    remove() {},
    lagSmoothing() {},
  });
  assert.equal(added.length, 1);
  const tick = added[0];
  assert.ok(tick);
  let seen = 0;
  const timing: TheatreCoreLike = {
    createRafDriver() {
      return {
        tick(timeMs: number) {
          seen = timeMs;
        },
      };
    },
    getProject() {
      return {
        ready: Promise.resolve(undefined),
        sheet() {
          return { sequence: { play() {}, pause() {} } };
        },
      };
    },
  };
  playState(state, timing, {
    add(fn) {
      fn(2);
    },
    remove() {},
    lagSmoothing() {},
  });
  assert.equal(seen, 2000);
});

test("optimize-media plans image sizes and skips video when ffmpeg is missing", async () => {
  const images = planImages(path.join("shots", "hero.png"), path.join("out"));
  assert.equal(images.outputs.length, 8);
  assert.ok(images.outputs.some((item) => item.format === "avif" && item.width === 640));
  assert.ok(images.outputs.some((item) => item.format === "webp" && item.width === 1920));
  const video = planVideo(path.join("shots", "reel.mov"), path.join("out"));
  assert.equal(video.keyframeInterval, 2);
  const report = await optimizeMedia({
    images: [],
    videos: ["reel.mov"],
    outDir: path.join("out"),
    ffmpeg: null,
    dryRun: true,
  });
  assert.equal(report.videos[0]?.skipped, FFMPEG_MISSING);
  assert.match(FFMPEG_MISSING, /ffmpeg is not installed/);
});

test("fetch-assets writes a permitted file and refuses a forbidden licence", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "hh-credits-"));
  try {
    const creditsPath = path.join(dir, "CREDITS.json");
    await writeFile(
      creditsPath,
      JSON.stringify({
        assets: [
          {
            file: "mark.svg",
            source: "https://example.com/mark.svg",
            license: "CC0",
            author: "Desk",
            url: "https://example.com/mark.svg",
          },
        ],
      }),
    );
    const written = await fetchAssets({
      creditsPath,
      outDir: path.join(dir, "media"),
      fetchImpl: async () => new Response(new Uint8Array([60, 115, 118, 103])),
    });
    assert.equal(written.length, 1);
    const bytes = await readFile(written[0] ?? "");
    assert.equal(bytes[0], 60);
    await writeFile(
      creditsPath,
      JSON.stringify({
        assets: [{ file: "nope.png", source: "x", license: "GPL-3.0", author: "Nope", url: "https://example.com/nope.png" }],
      }),
    );
    await assert.rejects(
      () => fetchAssets({ creditsPath, outDir: path.join(dir, "media"), fetchImpl: async () => new Response("no") }),
      /Allowed licenses are CC0 and CC-BY-4.0/,
    );
    await writeFile(
      creditsPath,
      JSON.stringify({
        assets: [{ file: "../secret.txt", source: "x", license: "CC0", author: "Nope", url: "https://example.com/x" }],
      }),
    );
    await assert.rejects(
      () => fetchAssets({ creditsPath, outDir: path.join(dir, "media"), fetchImpl: async () => new Response("no") }),
      /escapes the output directory/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("contact, resend, stripe, shopify, and booking dry runs do not send", () => {
  const fields = { name: "Ada", email: "ada@example.com", message: "Hello from the desk." };
  const unset = dryRunContact({}, fields);
  assert.equal(unset.ok, false);
  assert.equal(unset.sends, false);
  const planned = dryRunContact({ WEB3FORMS_ACCESS_KEY: "dry-run" }, fields);
  assert.equal(planned.ok, true);
  assert.equal(planned.sends, false);
  assert.equal(planned.url, "https://api.web3forms.com/submit");
  const trapped = dryRunContact({ WEB3FORMS_ACCESS_KEY: "dry-run" }, { ...fields, company: "bot" });
  assert.equal(trapped.reason, "honeypot");
  const mail = dryRunResend(
    { RESEND_API_KEY: "dry-run", RESEND_FROM: "desk@example.com" },
    { to: "ada@example.com", subject: "Note", text: "Hello." },
  );
  assert.equal(mail.ok, true);
  assert.equal(mail.sends, false);
  assert.equal(mail.url, "https://api.resend.com/emails");
  const stripe = dryRunStripe({ STRIPE_PAYMENT_LINK_URL: "https://buy.stripe.com/test_dry_run" });
  assert.equal(stripe.ok, true);
  assert.equal(stripe.sends, false);
  assert.equal(dryRunStripe({ STRIPE_PAYMENT_LINK_URL: "https://example.com/pay" }).ok, false);
  const shop = dryRunShopify({
    SHOPIFY_STORE_DOMAIN: "desk.myshopify.com",
    SHOPIFY_STOREFRONT_ACCESS_TOKEN: "dry-run",
    SHOPIFY_PRODUCT_ID: "1",
  });
  assert.equal(shop.ok, true);
  assert.equal(shop.sends, false);
  const cal = dryRunBooking({ CAL_LINK: "desk/intro" });
  assert.equal(cal.provider, "cal");
  assert.equal(cal.sends, false);
  const calendly = dryRunBooking({ CALENDLY_URL: "https://calendly.com/desk/intro" });
  assert.equal(calendly.provider, "calendly");
});

test("newsletter adapters share one interface and the dry run stays local", async () => {
  assert.equal(ADAPTERS.length, 7);
  assert.equal(new Set(ADAPTERS.map((item) => item.id)).size, 7);
  const env = {
    KIT_API_KEY: "dry-run",
    KIT_FORM_ID: "form",
    MAILCHIMP_API_KEY: "dry-run",
    MAILCHIMP_AUDIENCE_ID: "list",
    MAILCHIMP_SERVER_PREFIX: "us1",
    MAILERLITE_API_KEY: "dry-run",
    MAILERLITE_GROUP_ID: "group",
    BEEHIIV_API_KEY: "dry-run",
    BEEHIIV_PUBLICATION_ID: "pub",
    BREVO_API_KEY: "dry-run",
    BREVO_LIST_ID: "3",
    KLAVIYO_API_KEY: "dry-run",
    KLAVIYO_LIST_ID: "list",
    HOSTINGER_REACH_API_TOKEN: "dry-run",
  };
  for (const adapter of ADAPTERS) {
    const planned = dryRunNewsletter(adapter.id, env, "ada@example.com");
    assert.equal(planned.ok, true, adapter.id);
    assert.equal(planned.sends, false);
    assert.match(planned.url ?? "", /^https:\/\//);
    const direct = adapterById(adapter.id).plan({ email: "ada@example.com" }, env);
    assert.equal(direct.method, "POST");
  }
  const missing = dryRunNewsletter("kit", {}, "ada@example.com");
  assert.equal(missing.ok, false);
  let calls = 0;
  const result = await subscribe(adapterById("kit"), { email: "ada@example.com" }, env, async () => {
    calls += 1;
    return new Response(null, { status: 202 });
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
});

test("blog, portfolio, and video dry runs check shape", () => {
  const post = dryRunBlog({}, { title: "Notes from the desk", description: "A first post.", date: "2026-10-07" });
  assert.equal(post.editor, "keystatic-local");
  assert.equal(post.ok, true);
  const parsed = readPost("---\ntitle: Notes from the desk\ndescription: A first post.\ndate: 2026-10-07\n---\nBody copy.");
  assert.equal(parsed.body, "Body copy.");
  assert.equal(dryRunPortfolio({ title: "Desk", summary: "A table.", year: 2026, cover: "/cover.jpg" }).ok, true);
  assert.equal(
    dryRunVideo({
      title: "Reel",
      poster: "/reel.jpg",
      h264: "/reel.mp4",
      webm: "/reel.webm",
      captions: "/reel.vtt",
    }).selfHosted,
    true,
  );
});

test("analytics fires KPI events and holds GA4 until consent", () => {
  assert.equal(isKpiEvent("cta_click"), true);
  assert.equal(isKpiEvent("form_submit"), true);
  assert.equal(isKpiEvent("booking_complete"), true);
  assert.equal(isKpiEvent("checkout_start"), true);
  assert.equal(isKpiEvent("made_up"), false);
  assert.ok(allKpiEvents().length >= 20);
  assert.equal(planTrack("plausible", "cta_click", "unknown").sent, true);
  assert.equal(planTrack("ga4", "purchase", "unknown").sent, false);
  assert.equal(planTrack("ga4", "purchase", "granted").sent, true);
  assert.equal(planTrack("umami", "form_submit", "denied").sent, true);
  const plausible = dryRunAnalytics({ PLAUSIBLE_DOMAIN: "example.com" });
  assert.equal(plausible.provider, "plausible");
  assert.equal(plausible.needsConsent, false);
  const ga = dryRunAnalytics({ GA4_MEASUREMENT_ID: "G-TEST123" });
  assert.equal(ga.needsConsent, true);
  assert.match(ga.script ?? "", /gtag\/js/);
});

test("qa spec covers console, failed requests, three widths, and reduced motion", async () => {
  const source = await readFile(path.join(packageRoot, "shared", "qa.spec.ts"), "utf8");
  assert.match(source, /requestfailed/);
  assert.match(source, /pageerror/);
  assert.match(source, /375/);
  assert.match(source, /768/);
  assert.match(source, /1440/);
  assert.match(source, /reducedMotion/);
});

test("shared modules are copied into each starter and the blank page does not import them", async () => {
  const copies = [
    ["motion.ts", path.join("src", "hh", "motion.ts")],
    ["webgl.ts", path.join("src", "hh", "webgl.ts")],
    ["theatre-loader.ts", path.join("src", "hh", "theatre-loader.ts")],
    ["css-scroll.ts", path.join("src", "hh", "css-scroll.ts")],
    ["anime.ts", path.join("src", "hh", "anime.ts")],
    ["vanilla.ts", path.join("src", "hh", "vanilla.ts")],
    ["optimize-media.ts", path.join("scripts", "optimize-media.ts")],
    ["fetch-assets.ts", path.join("scripts", "fetch-assets.ts")],
    ["qa.spec.ts", path.join("tests", "qa.spec.ts")],
  ] as const;
  for (const template of listTemplates()) {
    for (const [sharedName, relative] of copies) {
      const shared = await readFile(path.join(packageRoot, "shared", sharedName), "utf8");
      const copy = await readFile(path.join(template.dir, relative), "utf8");
      assert.equal(copy, shared, `${template.id} ${relative}`);
    }
    const motion = await readFile(path.join(template.dir, "src", "hh", "motion.ts"), "utf8");
    assert.equal(motion.includes("import "), false);
    const theatre = await readFile(path.join(template.dir, "src", "hh", "effects", "theatre.ts"), "utf8");
    assert.equal(theatre.includes("@theatre/studio"), false);
    assert.match(theatre, /@theatre\/core/);
  }
  const astroPage = await readFile(path.join(packageRoot, "astro-default", "src", "pages", "index.astro"), "utf8");
  assert.equal(astroPage.includes("hh/effects"), false);
  assert.equal(astroPage.includes("Reveal"), false);
  const nextPage = await readFile(path.join(packageRoot, "next-app", "src", "app", "page.tsx"), "utf8");
  assert.equal(nextPage.includes("MotionRoot"), false);
  assert.equal(nextPage.includes("hh/effects"), false);
  const viteIndex = await readFile(path.join(packageRoot, "vite-react-world", "index.html"), "utf8");
  assert.equal(viteIndex.includes("main.tsx"), false);
  const world = await readFile(path.join(packageRoot, "vite-react-world", "world.html"), "utf8");
  assert.match(world, /main\.tsx/);
});

test("scaffold copies a starter and the chosen recipes without secret values", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "hh-scaffold-"));
  try {
    const written = await scaffold("astro-default", dir, { recipes: listRecipes().map((item) => item.id) });
    assert.ok(written.some((file) => file.endsWith(path.join("src", "pages", "index.astro"))));
    assert.ok(written.some((file) => file.endsWith(path.join("recipes", "newsletter", "adapters.ts"))));
    const blob = await readFile(path.join(dir, "recipes", "contact", "README.md"), "utf8");
    assert.match(blob, /WEB3FORMS_ACCESS_KEY/);
    assert.equal(/sk_live_|sk_test_|AKIA[0-9A-Z]{16}/.test(blob), false);
    await assert.rejects(() => scaffold("astro-default", dir, { recipes: ["nope"] }), /Unknown recipes/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function runPnpm(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd,
      shell: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const keep = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      if (output.length > 24000) output = output.slice(-24000);
    };
    child.stdout?.on("data", keep);
    child.stderr?.on("data", keep);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm ${args.join(" ")} exited ${code ?? "unknown"}\n${output}`));
    });
  });
}

test("each starter builds and the blank bundle omits unused libraries", { timeout: 600_000 }, async () => {
  if (process.env.HH_SKIP_TEMPLATE_BUILD === "1") return;
  const root = await mkdtemp(path.join(tmpdir(), "hh-starters-"));
  const html: Record<TemplateId, string> = {
    "astro-default": path.join("dist", "index.html"),
    "next-app": path.join("out", "index.html"),
    "vite-react-world": path.join("dist", "index.html"),
  };
  try {
    for (const template of listTemplates()) {
      const outDir = path.join(root, template.id);
      await scaffold(template.id, outDir, { recipes: [] });
      await runPnpm(outDir, ["install", "--frozen-lockfile"]);
      await runPnpm(outDir, ["build"]);
      const page = path.join(outDir, html[template.id]);
      const used = await reportBlankBundle(page);
      assert.deepEqual(used, [], `${template.id} blank bundle loaded ${used.join(", ")}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
