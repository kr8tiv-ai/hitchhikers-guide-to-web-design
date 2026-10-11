/**
 * Pinned whisper.cpp nightly b5454.
 * The versioned release v1.9.5 (2026-10-06) published no release assets.
 * That release points at nightly tag b5454, which has the official binaries.
 * SHA-256 values are the GitHub release asset digest field, retrieved 2026-10-10.
 * Model SHA-256 values are the Hugging Face lfs.oid for ggerganov/whisper.cpp, retrieved 2026-10-10.
 * winget id oschwartz10612.Poppler is the community Poppler package. Assumed, not re-queried.
 */

export interface WhisperArchive {
  platform: "win32" | "linux";
  arch: string;
  file: string;
  url: string;
  bytes: number;
  sha256: string;
}

export interface WhisperModelPin {
  id: string;
  label: string;
  url: string;
  bytes: number;
  sha256: string;
}

export interface ManagerRecipe {
  id: string;
  manager: string;
  platform: "win32" | "darwin" | "linux";
  argv: readonly string[];
  manual: string;
  needsElevation: boolean;
}

export const WHISPER_RELEASE = "b5454";

export const WHISPER_REPO = "https://github.com/ggml-org/whisper.cpp";

export const GROK_DOCS = "https://x.ai/docs/build/overview";

export const GROK_INSTALL_SH = "https://x.ai/cli/install.sh";

export const GROK_INSTALL_PS1 = "https://x.ai/cli/install.ps1";

export const PLAYWRIGHT_DOCS = "https://playwright.dev/docs/browsers";

export const POPPLER_HOME = "https://poppler.freedesktop.org/";

export const WHISPER_ARCHIVES: readonly WhisperArchive[] = [
  {
    platform: "win32",
    arch: "x64",
    file: "whisper-bin-x64.zip",
    url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip",
    bytes: 8928640,
    sha256: "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb",
  },
  {
    platform: "win32",
    arch: "arm64",
    file: "whisper-bin-win-cpu-arm64.zip",
    url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-win-cpu-arm64.zip",
    bytes: 4371193,
    sha256: "28c37e7b598c3d9bbfef94f3bd67f2ee6f12b7c86f3da5edcf5e4308d615ff6d",
  },
  {
    platform: "win32",
    arch: "ia32",
    file: "whisper-bin-Win32.zip",
    url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-Win32.zip",
    bytes: 5523979,
    sha256: "b6cb078ee5d4df0f9dcdb4f820210c59bd6534c84fdb13c35bc8a51d1233451f",
  },
  {
    platform: "linux",
    arch: "x64",
    file: "whisper-bin-ubuntu-x64.tar.gz",
    url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-ubuntu-x64.tar.gz",
    bytes: 10364195,
    sha256: "a72becf15d7917f990f6313867a52638b82b7f9ef237fb0c980dac56a135781c",
  },
  {
    platform: "linux",
    arch: "arm64",
    file: "whisper-bin-ubuntu-arm64.tar.gz",
    url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-ubuntu-arm64.tar.gz",
    bytes: 4608377,
    sha256: "6b95ebfc60447df48e70ef00a73bdc3f41679ed2d01ef465827206a2ff325149",
  },
];

export const WHISPER_MODELS: readonly WhisperModelPin[] = [
  {
    id: "ggml-tiny.bin",
    label: "tiny",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
    bytes: 77691713,
    sha256: "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
  },
  {
    id: "ggml-tiny.en.bin",
    label: "tiny.en",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
    bytes: 77704715,
    sha256: "921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f",
  },
  {
    id: "ggml-base.bin",
    label: "base",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
    bytes: 147951465,
    sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
  },
  {
    id: "ggml-base.en.bin",
    label: "base.en",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
    bytes: 147964211,
    sha256: "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
  },
];

export const DEFAULT_WHISPER_MODEL = "ggml-tiny.bin";

export const POPPLER_RECIPES: readonly ManagerRecipe[] = [
  {
    id: "pdftotext-winget",
    manager: "winget",
    platform: "win32",
    argv: ["winget", "install", "--disable-interactivity", "--exact", "--id", "oschwartz10612.Poppler"],
    manual: "winget install --disable-interactivity --exact --id oschwartz10612.Poppler",
    needsElevation: true,
  },
  {
    id: "pdftotext-choco",
    manager: "choco",
    platform: "win32",
    argv: ["choco", "install", "poppler", "-y"],
    manual: "choco install poppler -y",
    needsElevation: true,
  },
  {
    id: "pdftotext-scoop",
    manager: "scoop",
    platform: "win32",
    argv: ["scoop", "install", "poppler"],
    manual: "scoop install poppler",
    needsElevation: false,
  },
  {
    id: "pdftotext-brew",
    manager: "brew",
    platform: "darwin",
    argv: ["brew", "install", "poppler"],
    manual: "brew install poppler",
    needsElevation: false,
  },
  {
    id: "pdftotext-apt",
    manager: "apt-get",
    platform: "linux",
    argv: ["sudo", "apt-get", "install", "-y", "poppler-utils"],
    manual: "sudo apt-get install -y poppler-utils",
    needsElevation: true,
  },
  {
    id: "pdftotext-dnf",
    manager: "dnf",
    platform: "linux",
    argv: ["sudo", "dnf", "install", "-y", "poppler-utils"],
    manual: "sudo dnf install -y poppler-utils",
    needsElevation: true,
  },
  {
    id: "pdftotext-pacman",
    manager: "pacman",
    platform: "linux",
    argv: ["sudo", "pacman", "-S", "--noconfirm", "poppler"],
    manual: "sudo pacman -S --noconfirm poppler",
    needsElevation: true,
  },
  {
    id: "pdftotext-zypper",
    manager: "zypper",
    platform: "linux",
    argv: ["sudo", "zypper", "install", "-y", "poppler-tools"],
    manual: "sudo zypper install -y poppler-tools",
    needsElevation: true,
  },
];

export function whisperAssetUrl(file: string): string {
  const pin = WHISPER_ARCHIVES.find((item) => item.file === file);
  if (pin === undefined) throw new Error(`Unknown whisper archive: ${file}`);
  return pin.url;
}

export function whisperModelUrl(file: string): string {
  const pin = WHISPER_MODELS.find((item) => item.id === file);
  if (pin === undefined) throw new Error(`Unknown whisper model: ${file}`);
  return pin.url;
}

export function recipeUrls(): string[] {
  const urls = [
    WHISPER_REPO,
    GROK_DOCS,
    GROK_INSTALL_SH,
    GROK_INSTALL_PS1,
    PLAYWRIGHT_DOCS,
    POPPLER_HOME,
  ];
  for (const archive of WHISPER_ARCHIVES) urls.push(whisperAssetUrl(archive.file));
  for (const model of WHISPER_MODELS) urls.push(whisperModelUrl(model.id));
  return urls;
}
