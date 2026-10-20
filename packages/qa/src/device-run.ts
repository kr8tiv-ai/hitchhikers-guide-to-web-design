/**
 * Live device-matrix run. Tests stub the hooks in device-matrix.ts.
 * This wires WebKit, Chromium, screenshots, the detail pass, and scroll strips.
 */

import { buildDeviceMatrix, runDeviceMatrix, type DeviceMap, type DeviceMatrixRun } from "./device-matrix.ts";
import { detailChecksIn } from "./detail-pass.ts";
import {
  captureDeviceShot,
  captureDeviceStrip,
  ensureChromium,
  ensureWebKit,
  withProjectBrowser,
} from "./playwright-opener.ts";

export async function captureLiveDeviceMatrix(
  url: string,
  sections: readonly string[],
  outDir: string,
  devices: DeviceMap,
): Promise<DeviceMatrixRun> {
  const projects = buildDeviceMatrix(devices);
  return runDeviceMatrix(projects, sections, {
    engineReady(browser) {
      return browser === "webkit" ? ensureWebKit().then(() => undefined) : ensureChromium().then(() => undefined);
    },
    screenshot(project, kind) {
      return captureDeviceShot(url, project, outDir, kind).then(() => undefined);
    },
    detail(project) {
      return withProjectBrowser(project, (browser) =>
        detailChecksIn(browser, url, project.context.viewport),
      ).then(() => undefined);
    },
    scrollStrip(project, section) {
      return captureDeviceStrip(url, project, outDir, section).then(() => undefined);
    },
  });
}
