/**
 * Optional 60/30/10 palette proportion (audit 13).
 *
 * Dominant, secondary, and accent are shares of the page. A miss is a
 * flag. The check can be off. It does not ban a colour, a library, or
 * a technique. An accent that covers half the page is the flag the
 * fixture looks for.
 */

export const PALETTE_TARGETS = { dominant: 0.6, secondary: 0.3, accent: 0.1 } as const;

/** Inclusive distance from a target share. 0.08 on 0.60 still passes. */
export const PALETTE_TOLERANCE = 0.08;

const ROLES = ["dominant", "secondary", "accent"] as const;

export interface PaletteShare {
  dominant: number;
  secondary: number;
  accent: number;
}

export interface PaletteProportionInput {
  enabled: boolean;
  shares: PaletteShare;
}

export interface PaletteProportionResult {
  flagged: boolean;
  reasons: string[];
}

function shareText(value: number): string {
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function readShare(name: string, value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} is ${String(value)}. Expected a share from 0 to 1.`);
  }
  return value;
}

function outside(share: number, target: number): boolean {
  return Math.abs(share - target) > PALETTE_TOLERANCE + 1e-9;
}

/** Flags a proportion miss. Disabled means the check is off. */
export function checkPaletteProportion(input: PaletteProportionInput): PaletteProportionResult {
  if (!input.enabled) return { flagged: false, reasons: [] };
  const shares = {
    dominant: readShare("dominant", input.shares.dominant),
    secondary: readShare("secondary", input.shares.secondary),
    accent: readShare("accent", input.shares.accent),
  };
  const reasons: string[] = [];
  for (const role of ROLES) {
    if (role === "accent" && shares.accent >= 0.5) {
      reasons.push("Accent covers half the page.");
      continue;
    }
    const share = shares[role];
    const target = PALETTE_TARGETS[role];
    if (outside(share, target)) {
      const label = role.charAt(0).toUpperCase() + role.slice(1);
      reasons.push(`${label} is ${shareText(share)}. The target is ${shareText(target)}.`);
    }
  }
  return { flagged: reasons.length > 0, reasons };
}
