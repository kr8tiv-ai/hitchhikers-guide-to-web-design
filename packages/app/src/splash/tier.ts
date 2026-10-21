/**
 * Splash GPU budget (242c).
 *
 * A low GPU drops particle counts. It does not drop resolution below the
 * form-factor cap, and it does not swap the scene for a still.
 * The still is only for reduced motion, reduced data, Save-Data, or no WebGL.
 *
 * This differs from the 241c customer-hero recipe, where a software renderer
 * or a major performance caveat becomes an art-directed still. That hero
 * carries a post chain. This splash does not. Software GL (SwiftShader,
 * llvmpipe, the Windows basic renderer) stays on tier 1 with a short particle
 * list so the pause test and the phone still have a scene.
 *
 * Width chooses the DPR cap only. A phone keeps the scene.
 */

export type SplashTier = 0 | 1 | 2 | 3;
export type SplashForm = "phone" | "tablet" | "desktop";
export type SplashMode = "poster" | "scene";

export interface SplashSignals {
  reducedMotion: boolean;
  reducedData: boolean;
  saveData: boolean;
  webgl: boolean;
  /** UNMASKED_RENDERER_WEBGL, or "" when the context is not up yet. */
  renderer: string;
  /** True when the context only came up with a major performance caveat. */
  performanceCaveat: boolean;
  width: number;
  devicePixelRatio: number;
}

export interface SplashCounts {
  stars: number;
  comets: number;
  debris: number;
  tail: number;
}

export interface SplashBudget {
  mode: SplashMode;
  tier: SplashTier;
  form: SplashForm;
  dpr: number;
  counts: SplashCounts;
}

export const PHONE_DPR_CAP = 1.5;
export const DESK_DPR_CAP = 3;

const COUNTS: Record<Exclude<SplashTier, 0>, SplashCounts> = {
  1: { stars: 160, comets: 2, debris: 3, tail: 20 },
  2: { stars: 420, comets: 3, debris: 5, tail: 32 },
  3: { stars: 860, comets: 4, debris: 7, tail: 42 },
};

const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|microsoft basic render|software/i;
const LOW_GL = /intel\(r\) hd|hd graphics|uhd graphics [45]\d\d|gma\s/i;

export function splashForm(width: number): SplashForm {
  if (!Number.isFinite(width) || width < 768) return "phone";
  if (width < 1100) return "tablet";
  return "desktop";
}

/** Poster only when motion, data, or WebGL itself is off. Width is not a still. */
export function splashUsesPoster(signals: SplashSignals): boolean {
  if (signals.reducedMotion || signals.reducedData || signals.saveData) return true;
  return signals.webgl === false;
}

/**
 * Tier 0 is the poster. Otherwise a weak renderer is tier 1 or 2.
 * Particle count follows this tier. DPR does not.
 */
export function splashTier(signals: SplashSignals): SplashTier {
  if (splashUsesPoster(signals)) return 0;
  const renderer = signals.renderer;
  if (signals.performanceCaveat || SOFTWARE_GL.test(renderer)) return 1;
  if (LOW_GL.test(renderer)) return 2;
  return 3;
}

/**
 * Native device pixels, capped by form factor.
 * Tier does not lower the cap. Pass a tier so callers cannot "save" a phone
 * by also dropping DPR. The tier is accepted and ignored on purpose.
 */
export function capSplashDpr(form: SplashForm, devicePixelRatio: number, tier: SplashTier): number {
  void tier;
  const device = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const cap = form === "phone" ? PHONE_DPR_CAP : DESK_DPR_CAP;
  return Math.min(device, cap);
}

export function splashCounts(tier: SplashTier): SplashCounts {
  if (tier === 0) return { stars: 0, comets: 0, debris: 0, tail: 0 };
  return COUNTS[tier];
}

export function splashBudget(signals: SplashSignals): SplashBudget {
  const form = splashForm(signals.width);
  const tier = splashTier(signals);
  return {
    mode: tier === 0 ? "poster" : "scene",
    tier,
    form,
    dpr: capSplashDpr(form, signals.devicePixelRatio, tier),
    counts: splashCounts(tier),
  };
}
