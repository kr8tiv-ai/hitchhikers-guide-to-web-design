/**
 * Live desk hooks for reference screenshots and key-page renders.
 * Installed only on the live server path, next to section stills.
 * Tests leave the runners unset. The billed API provider is not attached.
 */

import { pathToFileURL } from "node:url";
import {
  collectReferenceShots,
  draftKeyPageRenders,
  packagedModule,
  recordReferenceCaptureFailure,
  resolveGrokCommand,
  setPageRenderRunner,
  setReferenceCaptureRunner,
  type SpawnLike,
} from "@hitchhiker/engine";
import { spawnGrok } from "./section-stills-hook.ts";

interface ReferenceBrowser {
  openPage(viewport: { width: number; height: number }): Promise<{
    goto?(url: string): Promise<void>;
    content(): Promise<string>;
    screenshot(options?: { fullPage?: boolean }): Promise<Uint8Array>;
    close?(): Promise<void>;
  }>;
  close(): Promise<void>;
}

interface CrawlerModule {
  captureReferenceSite(
    url: string,
    deps: {
      openPage: ReferenceBrowser["openPage"];
      fetchImpl?: typeof fetch;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<Array<{ kind: "fold" | "full"; pageUrl: string; bytes: Uint8Array }>>;
  openReferenceBrowser(): Promise<ReferenceBrowser>;
}

interface MediaModule {
  readMediaSettings(projectDir: string): { browser: boolean };
}

/** Installs both runners and returns before any browser or image call. */
export function attachReferenceWork(projectDir: string): void {
  setReferenceCaptureRunner(projectDir, (dir) => captureProject(dir));
  setPageRenderRunner(projectDir, (dir) => draftProject(dir));
}

async function captureProject(projectDir: string): Promise<void> {
  const holder: { browser: ReferenceBrowser | null } = { browser: null };
  try {
    const href = pathToFileURL(packagedModule("crawler", "src/reference-shots.ts")).href;
    const crawler = (await import(href)) as CrawlerModule;
    await collectReferenceShots(projectDir, {
      capture: async (url, options) => {
        if (holder.browser === null) holder.browser = await crawler.openReferenceBrowser();
        const browser = holder.browser;
        if (browser === null) throw new Error("Reference browser did not open.");
        return crawler.captureReferenceSite(url, {
          openPage: (viewport) => browser.openPage(viewport),
          fetchImpl: globalThis.fetch,
          timeoutMs: options.timeoutMs,
          signal: options.signal,
        });
      },
    });
  } catch (error) {
    const message = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : "Reference capture failed.";
    recordReferenceCaptureFailure(projectDir, message);
  } finally {
    if (holder.browser !== null) await holder.browser.close().catch(() => undefined);
  }
}

async function draftProject(projectDir: string): Promise<void> {
  const href = pathToFileURL(packagedModule("assets", "src/section-generate.ts")).href;
  const media = (await import(href)) as MediaModule;
  const settings = media.readMediaSettings(projectDir);
  let command = "grok";
  try {
    command = resolveGrokCommand(process.env);
  } catch {
    command = "grok";
  }
  const spawn: SpawnLike = (request) => spawnGrok({ ...request, command });
  if (settings.browser) {
    const browser = await import("./imagine-browser.ts");
    const browserDriver = await browser.embeddedImagineDriver(projectDir);
    await draftKeyPageRenders(projectDir, { spawn, env: process.env, browserDriver });
    return;
  }
  await draftKeyPageRenders(projectDir, { spawn, env: process.env });
}
