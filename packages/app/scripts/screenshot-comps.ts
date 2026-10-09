import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const compDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/design/comps",
);
const outDir = path.join(compDir, "screens");

const pages = ["desk", "dashboard", "brand-kit"] as const;
const widths = [375, 768, 1440] as const;
const themes = ["light", "dark"] as const;

const viewportHeight: Record<(typeof widths)[number], number> = {
  375: 812,
  768: 1024,
  1440: 900,
};

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const theme of themes) {
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: viewportHeight[width] },
        deviceScaleFactor: 1,
        colorScheme: theme,
      });
      for (const name of pages) {
        const page = await context.newPage();
        await page.addInitScript((value: string) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        const target = pathToFileURL(path.join(compDir, `${name}.html`)).href;
        await page.goto(target, { waitUntil: "load" });
        const overflow = await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => resolve());
            });
          });
          await Promise.all(document.getAnimations().map((item) => item.finished));
          return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
        });
        if (overflow) {
          console.error(`OVERFLOW ${name} ${width} ${theme}`);
        }
        const file = path.join(outDir, `${name}-${width}-${theme}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const bytes = (await stat(file)).size;
        console.log(`${path.basename(file)} ${bytes}`);
        await page.close();
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
