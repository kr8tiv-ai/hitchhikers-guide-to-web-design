import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderShell } from "../src/shell.ts";

const indexPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../index.html");
writeFileSync(indexPath, renderShell(), "utf8");
