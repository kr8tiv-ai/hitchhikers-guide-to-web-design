import { type ChildProcess, spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const cassetteDir = path.resolve(here, "..", "..", "engine", "test", "cassettes", "guide");

test("replays ten Towel and Tea turns at 375, including pushback, four cards, and brief approval", async ({ page }) => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "hh-live-guide-"));
  await mkdir(path.join(projectDir, "interview"), { recursive: true });
  await mkdir(path.join(projectDir, ".hitchhiker", "uploads"), { recursive: true });
  await copyFile(path.join(cassetteDir, "tree.yaml"), path.join(projectDir, "interview", "tree.yaml"));
  await writeFile(path.join(projectDir, ".hitchhiker", "uploads", "tins.jpg"), "");
  await writeFile(
    path.join(projectDir, ".hitchhiker", "facts.json"),
    JSON.stringify({ industry: "tea", crawlNotes: ["menu"] }),
  );

  const serverFile = path.resolve(here, "../src/server/server.ts");
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", childSource()],
    {
      env: {
        ...process.env,
        HH_GUIDE_REPLAY: "1",
        HH_GUIDE_CASSETTE: path.join(cassetteDir, "turns.json"),
        HH_GALLERY_FILE: path.join(cassetteDir, "gallery.json"),
        HH_E2E_PROJECT: projectDir,
        HH_E2E_SERVER: pathToFileURL(serverFile).href,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  try {
    const url = await readUrl(child);
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(url);
    await page.locator('[data-region="question"][data-live="true"]').waitFor();
    await expect(page.locator("#hh-card-ask")).toContainText("Is this shop yours?");
    await expect(page.locator("#transcript")).not.toContainText("right number of hands");
    const fits = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth <= root.clientWidth + 1;
    });
    expect(fits).toBe(true);

    await say(page, "The shop is mine, Towel and Tea.", "right number of hands", "DP-0.2");
    await say(page, "it's fine", "one concrete detail the shop site should keep", "DP-0.2");
    await expect(page.locator(".hh-qcard__push")).toContainText("it's fine");
    await expect(page.locator("#hh-card-draft")).toHaveValue("");
    await say(page, "it's fine", "one page, tool, or URL", "DP-0.2");
    await say(page, "it's fine", "That note is soft", "DP-0.3");
    await say(page, "I have used a site builder for a menu page.", "A site builder is a real rung", "DP-0.4");
    await say(page, "A logo sketch and a photo of the tins.", "why does this site exist", "DP-2.1");
    await say(page, "The site exists so a neighbor can order tea without calling.", "real sites should we walk", "DP-5.2");

    await page.locator('[data-action="suggest"]').click();
    await expect(page.locator("[data-question-id='DP-5.2']")).toBeVisible();
    await expect(page.locator("[data-assumed='suggested']")).toBeVisible();
    await expect(page.locator("[data-gallery='godly']")).toHaveCount(2);
    await expect(page.locator("[data-gallery='awwwards']")).toHaveCount(2);
    await expect(page.locator("[data-suggest-option]")).toHaveCount(4);
    await page.locator('[data-action="answer"]').click();
    await expect(page.locator("[data-question-id='DP-5.3']")).toBeVisible();
    await expect(page.locator("#hh-card-ask")).toContainText("three words");

    await say(
      page,
      "Warm paper, steam, and a quiet counter. Never neon, never loud, never generic.",
      "motion level",
      "DP-6.2",
    );
    await say(page, "Calm, about a three, enough to feel considered.", "Guide Entry is next", null);
    await expect(page.locator("#transcript")).toContainText("What did I get wrong?");
    await expect(page.locator("#transcript")).toContainText("Here is what I heard");
    expect(errors).toEqual([]);

    const engine = pathToFileURL(path.resolve(here, "../../engine/src/index.ts")).href;
    const script = path.join(projectDir, "run-brief.mts");
    await writeFile(script, briefSource(engine), "utf8");
    const output = await runNode(script, {
      ...process.env,
      HH_GUIDE_CASSETTE: path.join(cassetteDir, "turns.json"),
      HH_E2E_PROJECT: projectDir,
    });
    expect(output).toContain("approved");
    const brief = await readFile(path.join(projectDir, ".hitchhiker", "SITE-BRIEF.md"), "utf8");
    expect(brief).toContain("# Site Brief");
    expect(brief).toContain("quieter than before");
    expect(brief.includes("!")).toBe(false);
  } finally {
    await stopChild(child);
    await rm(projectDir, { recursive: true, force: true });
  }
});

async function say(page: Page, text: string, ask: string, id: string | null): Promise<void> {
  await page.locator("#hh-card-draft").fill(text);
  await page.locator('[data-action="answer"]').click();
  if (id !== null) await expect(page.locator(`[data-question-id="${id}"]`)).toBeVisible();
  await expect(page.locator("#hh-card-ask")).toContainText(ask);
}

function childSource(): string {
  return `
    const specifier = process.env.HH_E2E_SERVER;
    const projectDir = process.env.HH_E2E_PROJECT;
    const loaded = await import(specifier);
    const handle = await loaded.startServer({ projectDir, open: false });
    process.stdout.write(handle.url + "\\n");
  `;
}

function briefSource(engineHref: string): string {
  return `
    import { readFileSync } from "node:fs";
    import { briefLoop, guideThinkFromScript } from ${JSON.stringify(engineHref)};
    const cassette = process.env.HH_GUIDE_CASSETTE;
    const projectDir = process.env.HH_E2E_PROJECT;
    if (cassette === undefined || projectDir === undefined) throw new Error("missing brief env");
    const think = guideThinkFromScript(readFileSync(cassette, "utf8"));
    const session = { projectDir, depth: "deep", language: "en", pushes: {} };
    const loop = briefLoop(session, { think });
    const draft = await loop.next();
    if (draft.value === undefined || draft.value.approved) throw new Error("draft was not offered");
    const revised = await loop.next("The vibe should say warm paper.");
    if (revised.value === undefined || revised.value.approved) throw new Error("revision was not offered");
    if (revised.value.draft.goal !== draft.value.draft.goal) throw new Error("a field outside the correction changed");
    const approved = await loop.next("approve");
    if (approved.value === undefined || approved.value.approved !== true) throw new Error("brief was not approved");
    process.stdout.write("approved\\n");
  `;
}

function readUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`desk did not print a URL\n${stderr}`));
    }, 20_000);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      const line = stdout.split("\n").find((item) => item.startsWith("http://127.0.0.1:"));
      if (line !== undefined) {
        clearTimeout(timer);
        resolve(line.trim());
      }
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`desk exited ${code ?? "null"}\n${stderr}\n${stdout}`));
    });
  });
}

function runNode(script: string, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", script], {
      env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`brief script exited ${code ?? "null"}\n${stderr}\n${stdout}`));
    });
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
