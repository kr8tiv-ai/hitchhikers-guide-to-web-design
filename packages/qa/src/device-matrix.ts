/**
 * Device matrix for generated sites (audit 7, harness idea 24).
 *
 * Viewports come from the installed Playwright device list. A missing key
 * or a missing browser fails the run. 390 and 430 are width checks. Desktop
 * 1440 and 1920 override the Desktop Chrome descriptor. They are not keys.
 * Playwright WebKit stands in for iOS Safari. It is not a real iPhone.
 *
 * Phone widths 375, 390, and 430, tablet widths 768 and 1024, and desktop
 * widths 1440 and 1920 are also checked on Chromium, on WebKit (the iOS
 * stand-in), and on a Chromium project that keeps the Pixel descriptor.
 * Those checks are not Playwright device keys. The report keeps
 * EMULATION_LIMITS word for word.
 */

export const PHONE_CLASS_WIDTHS = [390, 430] as const;

export const MATRIX_PHONE_WIDTHS = [375, 390, 430] as const;

export const MATRIX_TABLET_WIDTHS = [768, 1024] as const;

export const MATRIX_DESKTOP_WIDTHS = [1440, 1920] as const;

export const MATRIX_WIDTH_ENGINES = ["chromium", "webkit", "pixel"] as const;

export const TABLET_CHECK_HEIGHT = 1024;

export const DESKTOP_VIEWPORT_HEIGHT = 900;

export const WIDTH_CHECK_HEIGHT = 812;

export const EMULATION_LIMITS = [
  "Playwright WebKit is not iOS Safari. A green matrix run is not a real iPhone.",
  "Do not assert a GPU tier inside an emulated project. The page asks for a tier. The phone measures it.",
  "Do not assert a fixed safe-area pixel inset. The device descriptor has no env(safe-area-inset) value.",
  "Do not assert that a video element reached playing. Assert muted, playsinline, and poster.",
  "BrowserStack and LambdaTest stay optional. They are not a gate.",
] as const;

export const OPTIONAL_ENGINES = [
  { name: "firefox", priority: "P1", required: false },
  { name: "edge", priority: "P1", required: false },
] as const;

export const OPTIONAL_DEVICE_LABS = ["BrowserStack", "LambdaTest"] as const;

export type MatrixBrowser = "chromium" | "webkit";

export interface DeviceDescriptor {
  userAgent: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  defaultBrowserType: MatrixBrowser | "firefox";
}

export type DeviceMap = Record<string, DeviceDescriptor | undefined>;

export interface DeviceContext {
  userAgent: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  defaultBrowserType: MatrixBrowser;
}

export type ProjectPriority = "P0" | "required";

export type ProjectRole =
  | "ios-safari"
  | "android-chrome"
  | "ipad"
  | "android-tablet"
  | "desktop"
  | "width"
  | "tablet-width"
  | "se-sweep";

export type MatrixWidthEngine = (typeof MATRIX_WIDTH_ENGINES)[number];

export type MatrixWidthKind = "phone" | "tablet" | "desktop";

/** A width check. It spreads a user agent and does not invent a device key. */
export interface WidthCheck {
  width: number;
  kind: MatrixWidthKind;
  engine: MatrixWidthEngine;
}

export interface DeviceProject {
  id: string;
  priority: ProjectPriority;
  role: ProjectRole;
  browser: MatrixBrowser;
  /** True only for the WebKit iPhone 15 portrait project. */
  p0Phone: boolean;
  requestedKey: string | null;
  descriptorKey: string | null;
  fallbackNote: string | null;
  /** Set only for the 375/390/430, 768/1024, and 1440/1920 width checks. */
  widthCheck?: WidthCheck;
  context: DeviceContext;
}

export interface ProjectCapture {
  projectId: string;
  browser: MatrixBrowser;
  shots: readonly ["full", "fold"];
  detail: true;
  scrollStrips: readonly string[];
}

export interface WidthCoverage {
  width: number;
  kind: MatrixWidthKind;
  engine: MatrixWidthEngine;
  projectId: string;
}

export interface DeviceMatrixRun {
  projects: readonly DeviceProject[];
  captures: readonly ProjectCapture[];
  /** EMULATION_LIMITS, copied through unchanged. */
  limits: readonly string[];
  coverage: readonly WidthCoverage[];
  optionalEngines: typeof OPTIONAL_ENGINES;
  optionalLabs: typeof OPTIONAL_DEVICE_LABS;
}

export interface MatrixHooks {
  engineReady(browser: MatrixBrowser): Promise<void> | void;
  screenshot(project: DeviceProject, kind: "full" | "fold"): Promise<void>;
  detail(project: DeviceProject): Promise<void>;
  scrollStrip(project: DeviceProject, section: string): Promise<void>;
}

interface DeviceRow {
  id: string;
  key: string;
  fallback?: string;
  priority: ProjectPriority;
  role: ProjectRole;
  browser: MatrixBrowser;
  p0Phone: boolean;
}

const ROWS: readonly DeviceRow[] = [
  { id: "iphone-15", key: "iPhone 15", priority: "P0", role: "ios-safari", browser: "webkit", p0Phone: true },
  {
    id: "iphone-15-landscape",
    key: "iPhone 15 landscape",
    priority: "P0",
    role: "ios-safari",
    browser: "webkit",
    p0Phone: false,
  },
  { id: "pixel-7", key: "Pixel 7", priority: "P0", role: "android-chrome", browser: "chromium", p0Phone: false },
  {
    id: "pixel-7-landscape",
    key: "Pixel 7 landscape",
    priority: "P0",
    role: "android-chrome",
    browser: "chromium",
    p0Phone: false,
  },
  { id: "ipad-pro-11", key: "iPad Pro 11", priority: "required", role: "ipad", browser: "webkit", p0Phone: false },
  {
    id: "ipad-pro-11-landscape",
    key: "iPad Pro 11 landscape",
    priority: "required",
    role: "ipad",
    browser: "webkit",
    p0Phone: false,
  },
  {
    id: "galaxy-tab-s9",
    key: "Galaxy Tab S9",
    fallback: "Galaxy Tab S4",
    priority: "required",
    role: "android-tablet",
    browser: "chromium",
    p0Phone: false,
  },
  {
    id: "galaxy-tab-s9-landscape",
    key: "Galaxy Tab S9 landscape",
    fallback: "Galaxy Tab S4 landscape",
    priority: "required",
    role: "android-tablet",
    browser: "chromium",
    p0Phone: false,
  },
];

export function missingDescriptorMessage(key: string): string {
  return `Device descriptor "${key}" is missing from the installed Playwright device list. The matrix spreads that descriptor and does not invent a viewport.`;
}

const SE_ROW: DeviceRow = {
  id: "iphone-se",
  key: "iPhone SE",
  priority: "required",
  role: "se-sweep",
  browser: "webkit",
  p0Phone: false,
};

export function stateSweepProjects(devices: DeviceMap, observe?: (key: string) => void): DeviceProject[] {
  const projects = buildDeviceMatrix(devices, observe);
  projects.push(projectFromRow(devices, SE_ROW, observe));
  return projects;
}

export function buildDeviceMatrix(devices: DeviceMap, observe?: (key: string) => void): DeviceProject[] {
  const projects = ROWS.map((row) => projectFromRow(devices, row, observe));
  projects.push(desktopProject(devices, 1440, observe), desktopProject(devices, 1920, observe));
  const pixel = readRequired(devices, "Pixel 7", observe);
  for (const width of PHONE_CLASS_WIDTHS) projects.push(widthProject(width, pixel));
  projects.push(...widthGrid(devices, observe));
  const phone = projects.find((item) => item.p0Phone && item.browser === "webkit");
  if (phone === undefined) {
    throw new Error("iOS Safari (WebKit iPhone 15) is the P0 phone and is missing from the device matrix.");
  }
  return projects;
}

export async function runDeviceMatrix(
  projects: readonly DeviceProject[],
  sections: readonly string[],
  hooks: MatrixHooks,
): Promise<DeviceMatrixRun> {
  if (!projects.some((item) => item.p0Phone && item.browser === "webkit")) {
    throw new Error("iOS Safari (WebKit iPhone 15) is the P0 phone and is missing from the device matrix.");
  }
  if (projects.some((item) => item.browser === "webkit")) await hooks.engineReady("webkit");
  if (projects.some((item) => item.browser === "chromium")) await hooks.engineReady("chromium");

  const captures: ProjectCapture[] = [];
  for (const item of projects) {
    await hooks.screenshot(item, "full");
    await hooks.screenshot(item, "fold");
    await hooks.detail(item);
    const strips: string[] = [];
    for (const section of sections) {
      await hooks.scrollStrip(item, section);
      strips.push(section);
    }
    captures.push({
      projectId: item.id,
      browser: item.browser,
      shots: ["full", "fold"],
      detail: true,
      scrollStrips: strips,
    });
  }
  return {
    projects,
    captures,
    limits: EMULATION_LIMITS,
    coverage: widthCoverage(projects),
    optionalEngines: OPTIONAL_ENGINES,
    optionalLabs: OPTIONAL_DEVICE_LABS,
  };
}

export function widthCoverage(projects: readonly DeviceProject[]): WidthCoverage[] {
  const covered: WidthCoverage[] = [];
  for (const item of projects) {
    if (item.widthCheck === undefined) continue;
    covered.push({ ...item.widthCheck, projectId: item.id });
  }
  return covered;
}

function projectFromRow(devices: DeviceMap, row: DeviceRow, observe?: (key: string) => void): DeviceProject {
  const resolved = resolveKey(devices, row.key, row.fallback, observe);
  const raw = readRequired(devices, resolved.key, observe);
  assertBrowser(row, raw.defaultBrowserType);
  return {
    id: row.id,
    priority: row.priority,
    role: row.role,
    browser: row.browser,
    p0Phone: row.p0Phone,
    requestedKey: row.key,
    descriptorKey: resolved.key,
    fallbackNote: resolved.note,
    context: spread(raw, row.browser),
  };
}

function desktopProject(devices: DeviceMap, width: 1440 | 1920, observe?: (key: string) => void): DeviceProject {
  const raw = readRequired(devices, "Desktop Chrome", observe);
  assertEngine(raw.defaultBrowserType, "chromium", "Desktop Chrome");
  const context = spread(raw, "chromium");
  context.viewport = { width, height: DESKTOP_VIEWPORT_HEIGHT };
  context.deviceScaleFactor = 1;
  context.isMobile = false;
  context.hasTouch = false;
  return {
    id: `desktop-${width}`,
    priority: "P0",
    role: "desktop",
    browser: "chromium",
    p0Phone: false,
    requestedKey: "Desktop Chrome",
    descriptorKey: "Desktop Chrome",
    fallbackNote: null,
    context,
  };
}

const WIDTH_ROWS: readonly { width: number; kind: MatrixWidthKind; height: number }[] = [
  ...MATRIX_PHONE_WIDTHS.map((width) => ({ width, kind: "phone" as const, height: WIDTH_CHECK_HEIGHT })),
  ...MATRIX_TABLET_WIDTHS.map((width) => ({ width, kind: "tablet" as const, height: TABLET_CHECK_HEIGHT })),
  ...MATRIX_DESKTOP_WIDTHS.map((width) => ({ width, kind: "desktop" as const, height: DESKTOP_VIEWPORT_HEIGHT })),
];

function widthGrid(devices: DeviceMap, observe?: (key: string) => void): DeviceProject[] {
  const chrome = readRequired(devices, "Desktop Chrome", observe);
  const iphone = readRequired(devices, "iPhone 15", observe);
  const pixel = readRequired(devices, "Pixel 7", observe);
  assertEngine(chrome.defaultBrowserType, "chromium", "Desktop Chrome");
  assertEngine(iphone.defaultBrowserType, "webkit", "iPhone 15");
  assertEngine(pixel.defaultBrowserType, "chromium", "Pixel 7");
  const source: Record<MatrixWidthEngine, DeviceDescriptor> = {
    chromium: chrome,
    webkit: iphone,
    pixel,
  };
  const projects: DeviceProject[] = [];
  for (const row of WIDTH_ROWS) {
    for (const engine of MATRIX_WIDTH_ENGINES) {
      const browser: MatrixBrowser = engine === "webkit" ? "webkit" : "chromium";
      const touch = row.kind !== "desktop";
      const check: WidthCheck = { width: row.width, kind: row.kind, engine };
      projects.push({
        id: `matrix-${engine}-${row.width}`,
        priority: "required",
        role: row.kind === "desktop" ? "desktop" : row.kind === "tablet" ? "tablet-width" : "width",
        browser,
        p0Phone: false,
        requestedKey: null,
        descriptorKey: null,
        fallbackNote: "Width check. Not a Playwright device key.",
        widthCheck: check,
        context: {
          userAgent: source[engine].userAgent,
          viewport: { width: row.width, height: row.height },
          deviceScaleFactor: 1,
          isMobile: touch,
          hasTouch: touch,
          defaultBrowserType: browser,
        },
      });
    }
  }
  return projects;
}

function widthProject(width: 390 | 430, pixel: DeviceDescriptor): DeviceProject {
  return {
    id: `width-${width}`,
    priority: "required",
    role: "width",
    browser: "chromium",
    p0Phone: false,
    requestedKey: null,
    descriptorKey: null,
    fallbackNote: "Width check. Not a Playwright device key.",
    context: {
      userAgent: pixel.userAgent,
      viewport: { width, height: WIDTH_CHECK_HEIGHT },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      defaultBrowserType: "chromium",
    },
  };
}

function resolveKey(
  devices: DeviceMap,
  key: string,
  fallback: string | undefined,
  observe?: (key: string) => void,
): { key: string; note: string | null } {
  observe?.(key);
  if (devices[key] !== undefined) return { key, note: null };
  if (fallback !== undefined) {
    observe?.(fallback);
    if (devices[fallback] !== undefined) {
      return {
        key: fallback,
        note: `Installed Playwright has no "${key}". Using "${fallback}".`,
      };
    }
  }
  throw new Error(missingDescriptorMessage(key));
}

function readRequired(devices: DeviceMap, key: string, observe?: (key: string) => void): DeviceDescriptor {
  observe?.(key);
  const raw = devices[key];
  if (raw === undefined) throw new Error(missingDescriptorMessage(key));
  if (!positive(raw.viewport?.width) || !positive(raw.viewport?.height)) {
    throw new Error(`Device descriptor "${key}" is missing a viewport. The matrix does not invent one.`);
  }
  if (!positive(raw.deviceScaleFactor)) {
    throw new Error(`Device descriptor "${key}" is missing a device scale factor. The matrix does not invent one.`);
  }
  if (typeof raw.isMobile !== "boolean" || typeof raw.hasTouch !== "boolean") {
    throw new Error(`Device descriptor "${key}" is missing isMobile or hasTouch. The matrix does not invent them.`);
  }
  if (typeof raw.userAgent !== "string" || raw.userAgent.length === 0) {
    throw new Error(`Device descriptor "${key}" is missing a user agent. The matrix does not invent one.`);
  }
  return raw;
}

function assertBrowser(row: DeviceRow, actual: DeviceDescriptor["defaultBrowserType"]): void {
  if (row.key === "iPhone 15" && actual !== "webkit") {
    throw new Error(
      `Device descriptor "iPhone 15" uses ${actual}. iOS Safari is the P0 phone and needs WebKit.`,
    );
  }
  assertEngine(actual, row.browser, row.key);
}

function assertEngine(
  actual: DeviceDescriptor["defaultBrowserType"],
  expected: MatrixBrowser,
  key: string,
): void {
  if (actual === expected) return;
  throw new Error(`Device descriptor "${key}" uses ${actual}. The matrix needs ${expected} for this project.`);
}

function spread(raw: DeviceDescriptor, browser: MatrixBrowser): DeviceContext {
  return {
    userAgent: raw.userAgent,
    viewport: { width: raw.viewport.width, height: raw.viewport.height },
    deviceScaleFactor: raw.deviceScaleFactor,
    isMobile: raw.isMobile,
    hasTouch: raw.hasTouch,
    defaultBrowserType: browser,
  };
}

function positive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
