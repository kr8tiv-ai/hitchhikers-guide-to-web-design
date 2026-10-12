/**
 * Generated preview tile. No image, no external href, no font load.
 * The hash of the url picks one of three compositions for the family.
 */

export interface TileEntry {
  family: string;
  id: string;
  url: string;
}

const FAMILIES = [
  "editorial",
  "brutalist",
  "3d-webgl",
  "scroll-gsap",
  "dark-luxury",
  "playful",
  "minimal",
  "saas",
  "architecture-real-estate",
  "portfolio",
  "ecommerce",
  "culture-art",
  "fashion-beauty",
  "hospitality-food",
  "photography",
  "nonprofit-events",
  "dev-tools-craft",
] as const;

type Mix = readonly [number, number, number, number, number, number, number, number];

export function renderTile(entry: TileEntry): string {
  const family = FAMILIES.includes(entry.family as (typeof FAMILIES)[number]) ? entry.family : "open";
  const words = mix(entry.url);
  const composition = words[0] % 3;
  const body = draw(family, composition, words);
  return `<svg class="hh-site__tile" role="img" aria-label="Abstract tile for the ${family} family" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice"><rect width="320" height="180" fill="var(--color-ink)"/>${body}</svg>`;
}

function mix(url: string): Mix {
  const out = [0, 1, 2, 3, 4, 5, 6, 7].map((round) => {
    let hash = 2166136261;
    const salted = `${url}:${round}`;
    for (let index = 0; index < salted.length; index += 1) {
      hash ^= salted.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  });
  const [a, b, c, d, e, f, g, h] = out;
  return [a ?? 0, b ?? 0, c ?? 0, d ?? 0, e ?? 0, f ?? 0, g ?? 0, h ?? 0];
}

function unit(words: Mix, index: number, span: number, origin: number): number {
  const word = words[index % words.length] ?? 0;
  return origin + (word % span);
}

function draw(family: string, composition: number, words: Mix): string {
  if (family === "brutalist") return brutalist(composition, words);
  if (family === "3d-webgl") return webgl(composition, words);
  if (family === "scroll-gsap") return scroll(composition, words);
  if (family === "dark-luxury") return luxury(composition, words);
  if (family === "playful") return playful(composition, words);
  if (family === "nonprofit-events") return nonprofit(composition, words);
  if (family === "minimal") return minimal(composition, words);
  if (family === "saas") return saas(composition, words);
  if (family === "architecture-real-estate") return architecture(composition, words);
  if (family === "ecommerce") return commerce(composition, words);
  if (family === "photography") return photo(composition, words);
  if (family === "fashion-beauty") return fashion(composition, words);
  if (family === "hospitality-food") return plate(composition, words);
  if (family === "dev-tools-craft") return craft(composition, words);
  if (family === "portfolio") return frames(composition, words);
  if (family === "culture-art") return culture(composition, words);
  return editorial(composition, words);
}

function editorial(composition: number, words: Mix): string {
  const x = unit(words, 1, 40, 28);
  const gap = 18 + (words[2] % 10);
  if (composition === 0) {
    return `<rect x="24" y="28" width="2" height="124" fill="var(--color-accent)"/><rect x="${x}" y="36" width="72" height="108" fill="var(--color-surface)"/><rect x="${x + 84}" y="36" width="${gap + 40}" height="64" fill="var(--color-plate)"/>`;
  }
  if (composition === 1) {
    return `<rect x="20" y="24" width="280" height="2" fill="var(--color-line)"/><rect x="${x}" y="44" width="46" height="100" fill="var(--color-surface)"/><rect x="${x + 58}" y="44" width="46" height="100" fill="var(--color-plate)"/><rect x="${x + 116}" y="44" width="46" height="72" fill="var(--color-surface)"/>`;
  }
  return `<rect x="36" y="40" width="2" height="100" fill="var(--color-accent)"/><rect x="52" y="${unit(words, 3, 24, 40)}" width="180" height="8" fill="var(--color-surface)"/><rect x="52" y="96" width="120" height="8" fill="var(--color-muted)"/>`;
}

function brutalist(composition: number, words: Mix): string {
  const w = 80 + (words[1] % 70);
  const h = 50 + (words[2] % 40);
  if (composition === 0) {
    return `<rect x="16" y="20" width="${w}" height="${h}" fill="var(--color-surface)"/><rect x="${140 + (words[3] % 30)}" y="78" width="140" height="70" fill="var(--color-accent)"/>`;
  }
  if (composition === 1) {
    return `<rect x="0" y="0" width="140" height="180" fill="var(--color-plate)"/><rect x="150" y="24" width="146" height="36" fill="var(--color-surface)"/><rect x="150" y="72" width="100" height="84" fill="var(--color-accent)"/>`;
  }
  return `<rect x="20" y="30" width="280" height="28" fill="var(--color-surface)"/><rect x="20" y="70" width="180" height="80" fill="var(--color-accent)"/><rect x="210" y="70" width="90" height="80" fill="var(--color-plate)"/>`;
}

function webgl(composition: number, words: Mix): string {
  const cx = 110 + (words[1] % 100);
  const cy = 70 + (words[2] % 40);
  if (composition === 0) {
    return `<ellipse cx="${cx}" cy="${cy}" rx="78" ry="48" fill="none" stroke="var(--color-surface)" stroke-width="2"/><ellipse cx="${cx}" cy="${cy}" rx="48" ry="28" fill="none" stroke="var(--color-accent)" stroke-width="2"/><ellipse cx="${cx}" cy="${cy}" rx="18" ry="10" fill="var(--color-plate)"/>`;
  }
  if (composition === 1) {
    return `<ellipse cx="160" cy="90" rx="90" ry="36" fill="none" stroke="var(--color-muted)" stroke-width="2"/><ellipse cx="${cx}" cy="90" rx="50" ry="50" fill="none" stroke="var(--color-surface)" stroke-width="3"/><ellipse cx="${cx}" cy="90" rx="16" ry="16" fill="var(--color-accent)"/>`;
  }
  return `<ellipse cx="100" cy="90" rx="40" ry="40" fill="var(--color-plate)"/><ellipse cx="170" cy="80" rx="56" ry="34" fill="none" stroke="var(--color-surface)" stroke-width="2"/><ellipse cx="220" cy="110" rx="30" ry="18" fill="none" stroke="var(--color-accent)" stroke-width="2"/>`;
}

function scroll(composition: number, words: Mix): string {
  const bars = [0, 1, 2, 3, 4].map((index) => {
    const height = 30 + ((words[(index + composition) % words.length] ?? 0) % 90);
    const x = 28 + index * 56;
    const y = 150 - height;
    return `<rect x="${x}" y="${y}" width="28" height="${height}" fill="${index % 2 === 0 ? "var(--color-surface)" : "var(--color-accent)"}"/>`;
  });
  if (composition === 2) {
    return `<rect x="24" y="24" width="272" height="2" fill="var(--color-line)"/>${bars.join("")}`;
  }
  return bars.join("");
}

function luxury(composition: number, words: Mix): string {
  const radius = 70 + (words[1] % 30);
  const sweep = composition === 0 ? "0 0 1" : composition === 1 ? "0 1 1" : "1 0 1";
  return `<path d="M40 130 A ${radius} ${radius} 0 ${sweep} 280 50" fill="none" stroke="var(--color-accent)" stroke-width="1.5"/><rect x="36" y="148" width="64" height="2" fill="var(--color-surface)"/>`;
}

function playful(composition: number, words: Mix): string {
  const cx = 70 + (words[1] % 50);
  const cy = 60 + (words[2] % 30);
  const dots =
    composition === 2
      ? `<circle cx="${cx + 120}" cy="${cy + 20}" r="16" fill="var(--color-plate)"/><circle cx="${cx + 160}" cy="${cy - 10}" r="8" fill="var(--color-surface)"/>`
      : "";
  return `<circle cx="${cx}" cy="${cy}" r="${18 + (words[3] % 16)}" fill="var(--color-accent)"/><circle cx="${cx + 70}" cy="${cy + 36}" r="22" fill="var(--color-surface)"/>${dots}<path d="M40 140 C 90 ${110 + (words[4] % 20)}, 150 160, 280 ${120 + (words[5] % 20)}" fill="none" stroke="var(--color-muted)" stroke-width="3"/>`;
}

function minimal(composition: number, words: Mix): string {
  const y = 70 + (words[1] % 40);
  const x = 48 + (words[2] % 180);
  if (composition === 1) {
    return `<rect x="40" y="${y}" width="160" height="1" fill="var(--color-surface)"/><circle cx="${x}" cy="${y}" r="3" fill="var(--color-accent)"/>`;
  }
  if (composition === 2) {
    return `<rect x="36" y="90" width="80" height="1" fill="var(--color-muted)"/><circle cx="200" cy="90" r="4" fill="var(--color-accent)"/>`;
  }
  return `<rect x="32" y="${y}" width="220" height="1" fill="var(--color-surface)"/><circle cx="${x}" cy="${y}" r="3.5" fill="var(--color-accent)"/>`;
}

function architecture(composition: number, words: Mix): string {
  const left = 60 + (words[1] % 40);
  const right = 180 + (words[2] % 40);
  const horizon = composition === 1 ? 100 : 120;
  return `<rect x="24" y="${horizon}" width="272" height="1" fill="var(--color-surface)"/><rect x="${left}" y="${horizon - 70}" width="8" height="70" fill="var(--color-accent)"/><rect x="${right}" y="${horizon - (40 + (words[3] % 30))}" width="6" height="${40 + (words[3] % 30)}" fill="var(--color-plate)"/>`;
}

function commerce(composition: number, words: Mix): string {
  const size = 64 + (words[1] % 24);
  const x = composition === 0 ? 40 : 120;
  return `<rect x="${x}" y="36" width="${size}" height="${size}" fill="var(--color-surface)"/><rect x="${x}" y="${112 + (words[2] % 8)}" width="${size}" height="2" fill="var(--color-accent)"/>`;
}

function photo(composition: number, words: Mix): string {
  const inset = composition === 2 ? 16 : 28;
  return `<rect x="${inset}" y="20" width="${320 - inset * 2}" height="120" fill="var(--color-plate)"/><rect x="${inset}" y="148" width="${40 + (words[1] % 40)}" height="4" fill="var(--color-surface)"/>`;
}

function fashion(composition: number, words: Mix): string {
  const x = 120 + (words[1] % 40);
  const w = composition === 1 ? 36 : 48;
  return `<rect x="${x}" y="16" width="${w}" height="148" fill="var(--color-surface)"/><rect x="28" y="${80 + (words[2] % 20)}" width="80" height="1" fill="var(--color-accent)"/>`;
}

function plate(composition: number, words: Mix): string {
  const cx = 100 + (words[1] % 80);
  return `<circle cx="${cx}" cy="88" r="${36 + composition * 6}" fill="none" stroke="var(--color-surface)" stroke-width="2"/><rect x="48" y="150" width="120" height="2" fill="var(--color-accent)"/>`;
}

function craft(composition: number, words: Mix): string {
  const cells: string[] = [
    `<rect x="24" y="24" width="12" height="12" fill="var(--color-accent)"/>`,
  ];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const on = ((words[(row + col + composition) % words.length] ?? 0) + row + col) % 3 !== 0;
      if (!on) continue;
      cells.push(
        `<rect x="${28 + col * 46}" y="${32 + row * 46}" width="18" height="6" fill="${col % 2 === 0 ? "var(--color-surface)" : "var(--color-accent)"}"/>`,
      );
    }
  }
  return cells.join("");
}

function nonprofit(composition: number, words: Mix): string {
  const y = 48 + (words[1] % 20);
  const shift = composition * 12;
  return `<circle cx="${54 + shift}" cy="${y}" r="14" fill="var(--color-accent)"/><circle cx="${110 + shift}" cy="${y + 8}" r="10" fill="var(--color-surface)"/><circle cx="${160 + shift}" cy="${y}" r="8" fill="var(--color-plate)"/><rect x="40" y="140" width="${120 + (words[2] % 40)}" height="6" fill="var(--color-muted)"/>`;
}

function saas(composition: number, words: Mix): string {
  const y = 64 + (words[1] % 24);
  const x = 80 + (words[2] % 80);
  return `<rect x="36" y="${y}" width="${140 + composition * 16}" height="1" fill="var(--color-surface)"/><rect x="36" y="${y + 28}" width="72" height="1" fill="var(--color-line)"/><circle cx="${x}" cy="${y}" r="3" fill="var(--color-accent)"/>`;
}

function culture(composition: number, words: Mix): string {
  const x = 40 + (words[1] % 30);
  return `<rect x="${x}" y="${28 + composition * 8}" width="150" height="96" fill="var(--color-plate)"/><rect x="${x + 18}" y="46" width="70" height="48" fill="none" stroke="var(--color-accent)" stroke-width="2"/>`;
}

function frames(composition: number, words: Mix): string {
  const shift = words[1] % 24;
  if (composition === 1) {
    return `<rect x="${30 + shift}" y="28" width="120" height="80" fill="none" stroke="var(--color-surface)" stroke-width="2"/><rect x="${70 + shift}" y="56" width="140" height="90" fill="none" stroke="var(--color-accent)" stroke-width="2"/>`;
  }
  return `<rect x="36" y="32" width="100" height="120" fill="none" stroke="var(--color-surface)" stroke-width="2"/><rect x="${150 + (words[2] % 20)}" y="48" width="90" height="70" fill="var(--color-plate)"/>`;
}
