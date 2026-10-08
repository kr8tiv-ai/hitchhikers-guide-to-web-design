/**
 * Release check for leaked keys in text.
 *
 * The xai- rule requires eight alphanumerics after the prefix so a document
 * can name the prefix. Bearer uses the same floor so a short word after the
 * scheme is not a token. The private-key banner is built from words so this
 * file does not contain the string it detects. This module does not read the
 * network, the environment, or the keychain.
 */

interface Rule {
  rule: string;
  pattern: RegExp;
}

/** Eight characters. A shorter run is a mention, not a key. */
const TOKEN_FLOOR = 8;

const PRIVATE_KEY_BANNER = ["BEGIN", "PRIVATE", "KEY"].join(" ");

function rules(): readonly Rule[] {
  return [
    { rule: "xai-key", pattern: new RegExp(`xai-[A-Za-z0-9]{${TOKEN_FLOOR},}`, "g") },
    {
      rule: "bearer",
      pattern: new RegExp(`Bearer [A-Za-z0-9._~+/=-]{${TOKEN_FLOOR},}`, "g"),
    },
    { rule: "private-key", pattern: new RegExp(PRIVATE_KEY_BANNER, "g") },
  ];
}

export function scanText(text: string): Array<{ rule: string; index: number }> {
  if (text.length === 0) return [];
  const hits: Array<{ rule: string; index: number }> = [];
  for (const { rule, pattern } of rules()) {
    for (const match of text.matchAll(pattern)) {
      hits.push({ rule, index: match.index });
    }
  }
  hits.sort((left, right) => {
    if (left.index !== right.index) return left.index - right.index;
    if (left.rule < right.rule) return -1;
    if (left.rule > right.rule) return 1;
    return 0;
  });
  return hits;
}
