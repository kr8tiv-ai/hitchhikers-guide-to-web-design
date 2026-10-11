/**
 * Live-install results. The harness in scripts/verify-installs.ts is the
 * check. A row stays "unverified" until that harness has run the download
 * on a machine and the note says why. Unit tests do not move a row to pass.
 */

export type AuditState = "pass" | "fail-fixed" | "unverified";

export interface AuditEntry {
  id: string;
  tool: string;
  model: string;
  file: string;
  bytes: number | null;
  checksum: string;
  state: AuditState;
  tested: string;
  note: string;
}

export const AUDIT_ENTRIES: readonly AuditEntry[] = [
  { id: "grok", tool: "grok", model: "", file: "@xai-official/grok", bytes: null, checksum: "npm registry", state: "pass", tested: "2026-10-11", note: "Installed with npm --prefix in scratch. Desk check saw grok." },
  { id: "playwright", tool: "playwright", model: "chromium", file: "playwright install chromium", bytes: null, checksum: "playwright CLI", state: "pass", tested: "2026-10-11", note: "Chromium installed under PLAYWRIGHT_BROWSERS_PATH in scratch. Desk check saw playwright." },
  { id: "whisper-bin-win32-x64", tool: "whisper", model: "", file: "whisper-bin-x64.zip", bytes: 8928640, checksum: "sha256", state: "pass", tested: "2026-10-11", note: "SHA-256 matched. Smoke ok. Desk check saw whisper." },
  { id: "whisper-bin-win32-arm64", tool: "whisper", model: "", file: "whisper-bin-win-cpu-arm64.zip", bytes: 4371193, checksum: "sha256", state: "unverified", tested: "2026-10-11", note: "SHA-256 matched. Binary not executed because this machine is win32-x64." },
  { id: "whisper-bin-win32-ia32", tool: "whisper", model: "", file: "whisper-bin-Win32.zip", bytes: 5523979, checksum: "sha256", state: "unverified", tested: "2026-10-11", note: "SHA-256 matched. Binary not executed because this machine is win32-x64." },
  { id: "whisper-bin-linux-x64", tool: "whisper", model: "", file: "whisper-bin-ubuntu-x64.tar.gz", bytes: 10364195, checksum: "sha256", state: "unverified", tested: "2026-10-11", note: "SHA-256 matched. Binary not executed because this machine is win32-x64." },
  { id: "whisper-bin-linux-arm64", tool: "whisper", model: "", file: "whisper-bin-ubuntu-arm64.tar.gz", bytes: 4608377, checksum: "sha256", state: "unverified", tested: "2026-10-11", note: "SHA-256 matched. Binary not executed because this machine is win32-x64." },
  { id: "whisper-darwin", tool: "whisper", model: "", file: "brew install whisper-cpp", bytes: null, checksum: "package-manager", state: "unverified", tested: "2026-10-11", note: "macOS command is covered by unit tests. It was not executed on Windows." },
  { id: "whisper-model-tiny", tool: "whisper", model: "tiny", file: "ggml-tiny.bin", bytes: 77691713, checksum: "sha256", state: "pass", tested: "2026-10-11", note: "SHA-256 matched. A one-second silent wav loaded. Desk check saw whisper." },
  { id: "whisper-model-tiny.en", tool: "whisper", model: "tiny.en", file: "ggml-tiny.en.bin", bytes: 77704715, checksum: "sha256", state: "pass", tested: "2026-10-11", note: "SHA-256 matched. A one-second silent wav loaded. Desk check saw whisper." },
  { id: "whisper-model-base", tool: "whisper", model: "base", file: "ggml-base.bin", bytes: 147951465, checksum: "sha256", state: "pass", tested: "2026-10-11", note: "SHA-256 matched. A one-second silent wav loaded. Desk check saw whisper." },
  { id: "whisper-model-base.en", tool: "whisper", model: "base.en", file: "ggml-base.en.bin", bytes: 147964211, checksum: "sha256", state: "pass", tested: "2026-10-11", note: "SHA-256 matched. A one-second silent wav loaded. Desk check saw whisper." },
  { id: "pdftotext-win32", tool: "pdftotext", model: "", file: "oschwartz10612.Poppler", bytes: null, checksum: "package-manager", state: "unverified", tested: "2026-10-11", note: "winget, choco, and scoop install onto the user or machine. No scratch prefix, so the installer was not run." },
  { id: "pdftotext-darwin", tool: "pdftotext", model: "", file: "brew install poppler", bytes: null, checksum: "package-manager", state: "unverified", tested: "2026-10-11", note: "macOS command is covered by unit tests. It was not executed on Windows." },
  { id: "pdftotext-linux", tool: "pdftotext", model: "", file: "poppler-utils", bytes: null, checksum: "package-manager", state: "unverified", tested: "2026-10-11", note: "Linux commands are covered by unit tests. They were not executed on Windows." },
];

export function auditEntry(id: string): AuditEntry | null {
  return AUDIT_ENTRIES.find((entry) => entry.id === id) ?? null;
}

export function describeVerification(ids: readonly string[]): { state: AuditState; note: string } {
  const rows = ids.map((id) => auditEntry(id)).filter((entry): entry is AuditEntry => entry !== null);
  if (rows.length === 0) {
    return { state: "unverified", note: "Unverified. This install has no recorded check." };
  }
  const unverified = rows.filter((entry) => entry.state === "unverified");
  if (unverified.length > 0) {
    const detail = unverified.map((entry) => `${entry.file}: ${entry.note}`).join(" ");
    return { state: "unverified", note: `Unverified. ${detail}` };
  }
  const fixed = rows.some((entry) => entry.state === "fail-fixed");
  const tested = rows.map((entry) => entry.tested).find((value) => value.length > 0) ?? "";
  if (fixed) {
    return {
      state: "fail-fixed",
      note: `Checked on ${tested}. A broken download was fixed, then the checksum and smoke check passed.`,
    };
  }
  return {
    state: "pass",
    note: `Checked on ${tested}. The download, checksum, and smoke check passed.`,
  };
}

export function auditIdsFor(tool: string, platform: NodeJS.Platform, arch: string, modelLabel: string | null): string[] {
  if (tool === "grok") return ["grok"];
  if (tool === "playwright") return ["playwright"];
  if (tool === "pdftotext") {
    if (platform === "darwin") return ["pdftotext-darwin"];
    if (platform === "linux") return ["pdftotext-linux"];
    return ["pdftotext-win32"];
  }
  if (platform === "darwin") return ["whisper-darwin"];
  const bin = platform === "linux"
    ? arch === "arm64" ? "whisper-bin-linux-arm64" : "whisper-bin-linux-x64"
    : arch === "arm64"
      ? "whisper-bin-win32-arm64"
      : arch === "ia32"
        ? "whisper-bin-win32-ia32"
        : "whisper-bin-win32-x64";
  const model = modelLabel === null || modelLabel.length === 0 ? "whisper-model-tiny" : `whisper-model-${modelLabel}`;
  return [bin, model];
}
