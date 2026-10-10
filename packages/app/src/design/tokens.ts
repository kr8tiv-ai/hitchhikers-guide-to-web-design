export const color: Record<
  | "surface"
  | "ink"
  | "muted"
  | "accent"
  | "accentInk"
  | "success"
  | "warning"
  | "danger"
  | "focus",
  { light: string; dark: string }
> = {
  surface: { light: "#f3ebdd", dark: "#12100e" },
  ink: { light: "#1c1612", dark: "#f4ede3" },
  muted: { light: "#564a40", dark: "#b0a090" },
  accent: { light: "#8e2f1a", dark: "#e6a15c" },
  accentInk: { light: "#fbf6ee", dark: "#1a120c" },
  success: { light: "#1b5c3a", dark: "#9dceb6" },
  warning: { light: "#7a4208", dark: "#f0c98a" },
  danger: { light: "#8e2430", dark: "#f0b0a6" },
  focus: { light: "#1c1612", dark: "#f4ede3" },
};

export const space: readonly number[] = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128];

export const radius: Record<"sm" | "md" | "lg" | "pill", string> = {
  sm: "2px",
  md: "4px",
  lg: "10px",
  pill: "999px",
};

export const motion: {
  durations: Record<"fast" | "base" | "slow", number>;
  easings: Record<"out" | "inOut" | "spring", string>;
} = {
  durations: { fast: 140, base: 280, slow: 560 },
  easings: {
    out: "cubic-bezier(0.16, 1, 0.3, 1)",
    inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    spring: "cubic-bezier(0.22, 1.2, 0.36, 1)",
  },
};

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(input: string): Rgb {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  const raw = match?.[1];
  if (raw === undefined) {
    throw new Error(`Unsupported colour: ${input}`);
  }
  const full = raw.length === 3 ? raw.replace(/[0-9a-f]/gi, (channel) => channel + channel) : raw;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function channel(value: number): number {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(fg: string, bg: string): number {
  const lighter = Math.max(luminance(parseHex(fg)), luminance(parseHex(bg)));
  const darker = Math.min(luminance(parseHex(fg)), luminance(parseHex(bg)));
  return (lighter + 0.05) / (darker + 0.05);
}
