/**
 * Options for a child that must not open a console on Windows.
 * A detached Windows child gets its own console, so `detached` is forced
 * off on win32. Callers still pass stdio, cwd, env, and timeout.
 * `shell` stays off: a shell is another console host.
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
