/**
 * Lighthouse presets for the phone, the desktop, and a tablet (audit 10).
 *
 * Screen, user agent, and throttling come from the Lighthouse this repo
 * installed (@lhci/cli 0.15.1, Lighthouse 12.6.1). Desktop Dense 4G is
 * printed from that copy. The numbers are not copied out of a blog.
 * Tablet has no official preset: desktop throttling and form factor, on
 * an 820 by 1180 viewport at device scale 2.
 * The TBT "good" line is the installed score curve's p10, per form factor.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export interface ThrottlingProfile {
  rttMs: number;
  throughputKbps: number;
  requestLatencyMs: number;
  downloadThroughputKbps: number;
  uploadThroughputKbps: number;
  cpuSlowdownMultiplier: number;
}

export interface ScreenEmulation {
  mobile: boolean;
  width: number;
  height: number;
  deviceScaleFactor: number;
  disabled: boolean;
}

export interface LhPreset {
  id: "mobile" | "desktop" | "tablet";
  formFactor: "mobile" | "desktop";
  throttlingMethod: "simulate";
  throttling: ThrottlingProfile;
  screenEmulation: ScreenEmulation;
  userAgent: string;
  /** Installed Total Blocking Time p10 for this form factor. Not a second cutoff. */
  tbtGoodMs: number;
}

/** Desktop scoring on a tablet-sized viewport. Lighthouse has no tablet preset. */
export const TABLET_VIEWPORT = { width: 820, height: 1180, deviceScaleFactor: 2 } as const;

/**
 * A real device turns emulation off. The lab presets above stay emulated.
 * emulation.md: screenEmulation.disabled and cpuSlowdownMultiplier 1.
 */
export const REAL_DEVICE_EMULATION = {
  screenEmulationDisabled: true,
  cpuSlowdownMultiplier: 1,
} as const;

const THROTTLE_FIELDS = [
  "rttMs",
  "throughputKbps",
  "requestLatencyMs",
  "downloadThroughputKbps",
  "uploadThroughputKbps",
  "cpuSlowdownMultiplier",
] as const;

interface InstalledConstants {
  throttling: { mobileSlow4G: ThrottlingProfile; desktopDense4G: ThrottlingProfile };
  screenEmulationMetrics: { mobile: ScreenEmulation; desktop: ScreenEmulation };
  userAgents: { mobile: string; desktop: string };
}

function lighthouseFile(relative: string): string {
  const require = createRequire(import.meta.url);
  const cliPkg = require.resolve("@lhci/cli/package.json");
  const fromCli = createRequire(cliPkg);
  return fromCli.resolve(`lighthouse/${relative}`);
}

function readThrottle(value: unknown, name: string): ThrottlingProfile {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Installed Lighthouse is missing throttling.${name}.`);
  }
  const record = value as Record<string, unknown>;
  const out = {} as ThrottlingProfile;
  for (const field of THROTTLE_FIELDS) {
    const item = record[field];
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0) {
      throw new Error(`Installed Lighthouse throttling.${name}.${field} is ${String(item)}.`);
    }
    out[field] = item;
  }
  return out;
}

function readScreen(value: unknown, name: string): ScreenEmulation {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Installed Lighthouse is missing screenEmulation.${name}.`);
  }
  const record = value as Record<string, unknown>;
  const width = record.width;
  const height = record.height;
  const deviceScaleFactor = record.deviceScaleFactor;
  if (typeof record.mobile !== "boolean" || typeof record.disabled !== "boolean") {
    throw new Error(`Installed Lighthouse screenEmulation.${name} is missing mobile or disabled.`);
  }
  if (typeof width !== "number" || typeof height !== "number" || typeof deviceScaleFactor !== "number") {
    throw new Error(`Installed Lighthouse screenEmulation.${name} is missing a viewport.`);
  }
  return { mobile: record.mobile, width, height, deviceScaleFactor, disabled: record.disabled };
}

/**
 * p10 from the installed Total Blocking Time audit. The curve is the cutoff.
 * The audit's JSDoc names `desktop` before `defaultOptions`, so a first-match
 * scan would read the phone curve. Stay inside one form-factor block.
 */
export function installedTbtP10(formFactor: "mobile" | "desktop"): number {
  const source = readFileSync(lighthouseFile("core/audits/metrics/total-blocking-time.js"), "utf8");
  const match = new RegExp(
    `${formFactor}:\\s*\\{(?:(?!\\b(?:mobile|desktop):)[\\s\\S])*?scoring:\\s*\\{[\\s\\S]*?p10:\\s*(\\d+)`,
  ).exec(source);
  const digits = match?.[1];
  if (digits === undefined) {
    throw new Error(`Installed Lighthouse has no ${formFactor} Total Blocking Time p10.`);
  }
  return Number(digits);
}

async function installedConstants(): Promise<InstalledConstants> {
  const href = pathToFileURL(lighthouseFile("core/config/constants.js")).href;
  const loaded = (await import(href)) as Partial<InstalledConstants>;
  if (loaded.throttling === undefined || loaded.screenEmulationMetrics === undefined || loaded.userAgents === undefined) {
    throw new Error("Installed Lighthouse constants did not export throttling, screen, and user agent.");
  }
  return loaded as InstalledConstants;
}

/**
 * The six Dense 4G fields, read from the installed preset.
 * Returns the line the report prints. It does not write to the console.
 */
export function printDesktopThrottling(profile: ThrottlingProfile): string {
  return THROTTLE_FIELDS.map((field) => `${field}=${profile[field]}`).join(" ");
}

/** Mobile, desktop, and tablet presets. Desktop throttling is the installed profile. */
export async function loadInstalledPresets(): Promise<readonly [LhPreset, LhPreset, LhPreset]> {
  const constants = await installedConstants();
  const mobileThrottle = readThrottle(constants.throttling.mobileSlow4G, "mobileSlow4G");
  const desktopThrottle = readThrottle(constants.throttling.desktopDense4G, "desktopDense4G");
  const mobileScreen = readScreen(constants.screenEmulationMetrics.mobile, "mobile");
  const desktopScreen = readScreen(constants.screenEmulationMetrics.desktop, "desktop");
  const mobileTbt = installedTbtP10("mobile");
  const desktopTbt = installedTbtP10("desktop");
  if (mobileScreen.mobile !== true) {
    throw new Error("Installed mobile screen emulation is not mobile. formFactor would disagree.");
  }
  if (desktopScreen.mobile !== false) {
    throw new Error("Installed desktop screen emulation is mobile. formFactor would disagree.");
  }
  const mobile: LhPreset = {
    id: "mobile",
    formFactor: "mobile",
    throttlingMethod: "simulate",
    throttling: mobileThrottle,
    screenEmulation: mobileScreen,
    userAgent: constants.userAgents.mobile,
    tbtGoodMs: mobileTbt,
  };
  const desktop: LhPreset = {
    id: "desktop",
    formFactor: "desktop",
    throttlingMethod: "simulate",
    throttling: desktopThrottle,
    screenEmulation: desktopScreen,
    userAgent: constants.userAgents.desktop,
    tbtGoodMs: desktopTbt,
  };
  const tablet: LhPreset = {
    id: "tablet",
    formFactor: "desktop",
    throttlingMethod: "simulate",
    throttling: desktopThrottle,
    screenEmulation: {
      mobile: false,
      width: TABLET_VIEWPORT.width,
      height: TABLET_VIEWPORT.height,
      deviceScaleFactor: TABLET_VIEWPORT.deviceScaleFactor,
      disabled: false,
    },
    userAgent: constants.userAgents.desktop,
    tbtGoodMs: desktopTbt,
  };
  return [mobile, desktop, tablet];
}
