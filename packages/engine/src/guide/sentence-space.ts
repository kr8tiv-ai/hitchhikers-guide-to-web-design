/**
 * One space after a sentence, everywhere two fragments are joined.
 * A space that is already there stays one space. Only an uppercase
 * letter starts the next sentence, so "logo.png" stays one token.
 * URLs, decimals, abbreviations, and file extensions are left alone.
 */

const ABBREVIATION = /(?:^|[\s(])(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|U\.S|U\.K)\.$/i;
const FILE_EXT = /^(?:png|jpe?g|gif|webp|svg|avif|pdf|html?|css|jsx?|mjs|cjs|tsx?|json|md|ya?ml|woff2?|ttf|otf|mp4|webm|mp3|ico|zip|gz|txt)(?![A-Za-z])/i;

export function spaceAfterTerminal(text: string): string {
  return text.replace(/([.!?;])([A-Z])/g, (match, punct: string, letter: string, offset: number, whole: string) => {
    const before = whole.slice(0, offset + 1);
    if (/https?:\/\/\S*$/.test(before) || /www\.\S*$/.test(before)) return match;
    if (punct === "." && ABBREVIATION.test(before)) return match;
    if (punct === "." && /(?:^|[\s(])[A-Za-z]\.$/.test(before)) return match;
    if (punct === "." && FILE_EXT.test(whole.slice(offset + 1))) return match;
    return `${punct} ${letter}`;
  });
}
