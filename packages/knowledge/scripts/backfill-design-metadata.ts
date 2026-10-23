/**
 * Fill industry, palette, and typography on award site entries that predate those fields.
 * Manual command only. Not part of CI or a build. Uses the same Grok spec build as ingest.
 *
 * Flags:
 *   --concurrency <n>   entries in flight at once (default 2)
 *   --limit <n>         stop after n entries
 * Only entry files missing a field are touched, so a stopped run can simply be started again.
 */
import { spawn } from "node:child_process";
import { readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DesignEntry } from "../src/design-library.ts";
import { briefFields } from "../src/ingest-pipeline.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "design-library", "entries");
const argv = process.argv.slice(2);
const concurrency = Number(flag("--concurrency") ?? "2");
const limit = Number(flag("--limit") ?? "0");
const TIMEOUT_MS = 15 * 60 * 1000;

function flag(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function missing(entry: DesignEntry): boolean {
  return entry.kind === "site" && (entry.provenance?.length ?? 0) > 0 && (entry.industry === undefined || entry.palette === undefined || entry.typography === undefined);
}

function ask(entry: DesignEntry): Promise<unknown> {
  const prompt = [
    "Return only JSON with fields industry, palette, typography for this public website.",
    "industry: the client's industry or sector in one to four lowercase words, for example automotive, fashion, architecture, music, spirits, fintech, studio portfolio, museum.",
    "palette: an object { note, hex }. hex is one to five uppercase #RRGGBB colours read from the page or its CSS. note is one sentence on how the colours are used.",
    "typography: one sentence on the type system, such as serif display over grotesk body. Name a font only when the page or its CSS states it.",
    "No URL, no exclamation mark, no em dash in prose fields. Do not copy the page.",
    `Title: ${entry.title}`,
    `URL: ${entry.url}`,
    `Our notes: ${entry.notes}`,
  ].join("\n");
  return new Promise((resolve, reject) => {
    const child = spawn("grok", ["--no-auto-update", "--no-alt-screen", "-m", "grok-4.7-build-fast", "--effort", "xhigh", "-p", prompt], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Grok timed out."));
    }, TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.resume();
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const start = stdout.indexOf("{");
      const end = stdout.lastIndexOf("}");
      if (code !== 0 || start === -1 || end === -1) {
        reject(new Error(`Grok did not return JSON (exit ${code}).`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.slice(start, end + 1)));
      } catch {
        reject(new Error("Grok returned JSON that could not be parsed."));
      }
    });
  });
}

async function main(): Promise<void> {
  let queue = readdirSync(root)
    .filter((name) => name.endsWith(".json"))
    .filter((name) => missing(JSON.parse(readFileSync(path.join(root, name), "utf8")) as DesignEntry));
  if (limit > 0) queue = queue.slice(0, limit);
  console.log(`${new Date().toISOString()} backfill start: ${queue.length} entries, concurrency ${concurrency}`);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < queue.length) {
      const name = queue[cursor] as string;
      cursor += 1;
      const file = path.join(root, name);
      try {
        const before = JSON.parse(readFileSync(file, "utf8")) as DesignEntry;
        const fields = briefFields((await ask(before)) as Parameters<typeof briefFields>[0]);
        const after = JSON.parse(readFileSync(file, "utf8")) as DesignEntry;
        if (after.industry === undefined && fields.industry !== undefined) after.industry = fields.industry;
        if (after.palette === undefined && fields.palette?.note !== undefined && fields.palette.hex !== undefined) after.palette = { note: fields.palette.note, hex: fields.palette.hex };
        if (after.typography === undefined && fields.typography !== undefined) after.typography = fields.typography;
        writeFileSync(`${file}.tmp`, `${JSON.stringify(after, null, 2)}\n`, "utf8");
        renameSync(`${file}.tmp`, file);
        console.log(`${new Date().toISOString()} filled ${after.id} :: ${after.industry ?? "-"} | ${(after.palette?.hex ?? []).join(" ")} | ${after.typography === undefined ? "-" : "type ok"}`);
      } catch (error) {
        console.log(`${new Date().toISOString()} failed ${name} :: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, () => worker()));
  console.log(`${new Date().toISOString()} backfill done`);
}

void main();
