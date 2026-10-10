/**
 * Text the anti-slop check should see. TypeScript operators such as !==
 * are not copy. String literals and templates are.
 */

const EXTRACT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"]);

function extractStrings(source: string): string {
  const parts: string[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const quote = source[index];
    if (quote !== "\"" && quote !== "'" && quote !== "`") continue;
    let cursor = index + 1;
    let body = "";
    let closed = false;
    while (cursor < source.length) {
      const char = source[cursor];
      if (char === "\\") {
        body += source[cursor + 1] ?? "";
        cursor += 2;
        continue;
      }
      if (quote === "`" && char === "$" && source[cursor + 1] === "{") {
        cursor += 2;
        let depth = 1;
        while (cursor < source.length && depth > 0) {
          const nested = source[cursor];
          if (nested === "{") depth += 1;
          else if (nested === "}") depth -= 1;
          cursor += 1;
        }
        body += " ";
        continue;
      }
      if (char === quote) {
        parts.push(body);
        index = cursor;
        closed = true;
        break;
      }
      body += char ?? "";
      cursor += 1;
    }
    if (!closed) break;
  }
  return parts.join("\n");
}

/** `.ts` yields string contents. Stylesheets and markdown stay whole. */
export function visibleCopy(source: string, ext: string): string {
  const normalized = ext.toLowerCase();
  if (EXTRACT.has(normalized)) return extractStrings(source);
  return source;
}
