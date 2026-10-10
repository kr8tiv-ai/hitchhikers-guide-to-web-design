/**
 * File names that are legal on Windows, macOS, and Linux.
 * Reserved device names, trailing dots and spaces, and separators are rewritten.
 * Letters outside ASCII stay, including a OneDrive path the user already chose.
 */

const RESERVED =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.[^.]*)?$/i;

const MAX_STEM = 80;

export function sanitizeProjectName(name: string): string {
  let cleaned = name.normalize("NFC");
  cleaned = cleaned.replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/[. ]+$/g, "");
  cleaned = cleaned.replace(/^\.+/g, "");
  if (cleaned.length === 0) return "project";
  if (cleaned.length > MAX_STEM) {
    cleaned = cleaned.slice(0, MAX_STEM).replace(/[. ]+$/g, "");
  }
  if (cleaned.length === 0) return "project";
  if (RESERVED.test(cleaned)) {
    cleaned = `${cleaned} project`;
    if (cleaned.length > MAX_STEM) cleaned = cleaned.slice(0, MAX_STEM).trim();
  }
  return cleaned.length === 0 ? "project" : cleaned;
}
