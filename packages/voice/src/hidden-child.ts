/**
 * Local copy of packages/engine/src/hidden-child.ts.
 * This package cannot depend on @hitchhiker/engine
 * (packages/engine/src/boundaries.ts).
 * A detached Windows child gets its own console, so `detached` is forced
 * off on win32. `shell` stays off.
 */

export function hiddenChildOptions<T extends object>(
  extra?: T,
): T & { windowsHide: true; shell: false; detached: boolean } {
  const base = (extra ?? {}) as T & { detached?: boolean };
  return {
    ...base,
    shell: false,
    windowsHide: true,
    detached: process.platform === "win32" ? false : base.detached === true,
  };
}
