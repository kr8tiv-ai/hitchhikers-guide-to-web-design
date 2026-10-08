/**
 * Theme toggle for a page that cannot run an inline script.
 * Importing this module from Node does nothing: there is no document.
 */

interface ThemeToggle {
  textContent: string | null;
  addEventListener(type: "click", listener: () => void): void;
}

interface ThemeRoot {
  dataset: { theme?: string };
  querySelector(selector: string): ThemeToggle | null;
}

function night(root: ThemeRoot, match: (query: string) => { matches: boolean }): boolean {
  if (root.dataset.theme === "dark") return true;
  if (root.dataset.theme === "light") return false;
  return match("(prefers-color-scheme: dark)").matches;
}

export function mountTheme(root: ThemeRoot, match: (query: string) => { matches: boolean }): void {
  const toggle = root.querySelector("[data-theme-toggle]");
  const paint = (): void => {
    if (toggle !== null) toggle.textContent = night(root, match) ? "Day desk" : "Night desk";
  };
  paint();
  if (toggle === null) return;
  toggle.addEventListener("click", () => {
    root.dataset.theme = night(root, match) ? "light" : "dark";
    paint();
  });
}

function browserRoot(): ThemeRoot | null {
  const host = globalThis as { document?: { documentElement?: ThemeRoot } };
  const element = host.document?.documentElement;
  if (element === undefined || typeof element.querySelector !== "function") return null;
  return element;
}

const detected = browserRoot();
if (detected !== null && typeof globalThis.matchMedia === "function") {
  mountTheme(detected, (query) => globalThis.matchMedia(query));
}
