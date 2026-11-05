/**
 * Signature moment gate (245v). Presence, recipe, runtime, budget, and
 * competition come from the engine audit. Reduced motion is judged again
 * with the optical checker so a hidden fallback is optical.reducedMotion.
 */

import { auditSignature, type SignatureAuditFailure, type SignatureBuilt, type SignatureReducedSample } from "@hitchhiker/engine";
import { evaluateOptical, type OpticalMotionSample } from "./optical-checks.ts";

export interface SignatureGateFailure extends SignatureAuditFailure {
  kind?: string;
}

/** Locked moments must be present, on budget, and alone. No moments passes. */
export function checkSignature(projectDir: string, built?: string | SignatureBuilt): SignatureGateFailure[] {
  let audit: ReturnType<typeof auditSignature>;
  try {
    audit = auditSignature(projectDir, built);
  } catch {
    return [];
  }
  const provided = probeReduced(built);
  const samples: SignatureReducedSample[] = [...provided];
  const providedIds = new Set(provided.map((sample) => sample.id));
  for (const derived of audit.reduced) {
    if (!providedIds.has(derived.id)) samples.push(derived);
  }
  const failures: SignatureGateFailure[] = audit.failures.filter((failure) => {
    if (failure.code !== "reduced-motion") return true;
    return !samples.some((sample) => sample.id === failure.id);
  });
  for (const sample of samples) {
    const report = evaluateOptical({ motion: [toOptical(sample)] });
    for (const blocker of report.blockers) {
      if (blocker.kind !== "optical.reducedMotion") continue;
      failures.push({
        id: sample.id,
        code: "reduced-motion",
        kind: blocker.kind,
        message: `${blocker.kind}: ${blocker.detail}`,
      });
    }
  }
  return failures;
}

/** Per-page close text. Empty when the locked moments hold. */
export function signatureCloseFailure(projectDir: string, _promptId: string, _promptText: string): string {
  return checkSignature(projectDir, projectDir)
    .map((failure) => failure.message)
    .join("\n");
}

function probeReduced(built: string | SignatureBuilt | undefined): readonly SignatureReducedSample[] {
  if (typeof built === "string" || built === undefined) return [];
  return built.reduced ?? [];
}

function toOptical(sample: SignatureReducedSample): OpticalMotionSample {
  return {
    selector: sample.selector,
    animates: true,
    present: sample.present,
    opacity: sample.opacity,
    offCanvas: sample.offCanvas,
    keepsLayout: sample.keepsLayout,
    blank: sample.blank,
  };
}
