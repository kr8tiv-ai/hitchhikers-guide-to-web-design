/**
 * Idea 19. Four variants of one section, then a combine step.
 * The combine writes a new artifact. The approved direction stays as it was.
 * A single variant fails even when its regions are filled in.
 */

export const PARALLEL_VARIANT_COUNT = 4;

export interface SectionVariant {
  id: string;
  sectionId: string;
  regions: Readonly<Record<string, string>>;
}

export interface VariantPick {
  region: string;
  variantId: string;
}

export interface ApprovedDirection {
  id: string;
  sectionId: string;
  regions: Readonly<Record<string, string>>;
}

export interface CombineRegion {
  region: string;
  variantId: string;
  value: string;
}

export interface CombineArtifact {
  id: string;
  approvedDirectionId: string;
  sectionId: string;
  variantIds: string[];
  regions: CombineRegion[];
}

export interface CombineResult {
  ok: boolean;
  problems: string[];
  artifact: CombineArtifact | null;
}

function blank(value: string): boolean {
  return value.trim() === "";
}

/**
 * Build a combine artifact from four variants. Does not write into
 * `approved`. Returns no artifact when the run is short of four.
 */
export function combineSectionVariants(input: {
  approved: ApprovedDirection;
  variants: readonly SectionVariant[];
  picks: readonly VariantPick[];
}): CombineResult {
  const problems: string[] = [];
  const ids = input.variants.map((variant) => variant.id.trim());
  if (input.variants.length !== PARALLEL_VARIANT_COUNT) {
    problems.push(
      `A section needs four variants. This run returned ${input.variants.length}.`,
    );
  }
  const unique = new Set(ids.filter((id) => id !== ""));
  if (ids.some((id) => id === "") || unique.size !== ids.length) {
    problems.push("Variant ids must be present and unique.");
  }
  for (const variant of input.variants) {
    if (variant.sectionId !== input.approved.sectionId) {
      problems.push(`Variant ${variant.id} is not section ${input.approved.sectionId}.`);
    }
  }
  if (input.picks.length === 0) problems.push("The combine record names no region.");
  const byId = new Map(input.variants.map((variant) => [variant.id.trim(), variant]));
  const regions: CombineRegion[] = [];
  const seenRegions = new Set<string>();
  for (const pick of input.picks) {
    const region = pick.region.trim();
    const variantId = pick.variantId.trim();
    if (blank(region) || seenRegions.has(region)) {
      problems.push("Each combine region is named once.");
      continue;
    }
    seenRegions.add(region);
    const variant = byId.get(variantId);
    if (variant === undefined) {
      problems.push(`Region ${region} names variant ${variantId}, which is not in the four.`);
      continue;
    }
    const value = variant.regions[region];
    if (typeof value !== "string" || value.trim() === "") {
      problems.push(`Variant ${variantId} has no ${region} region.`);
      continue;
    }
    regions.push({ region, variantId, value });
  }
  if (problems.length > 0) return { ok: false, problems, artifact: null };
  const artifactId = `${input.approved.id}::combine`;
  if (artifactId === input.approved.id) {
    return {
      ok: false,
      problems: ["The combine artifact id matches the approved direction."],
      artifact: null,
    };
  }
  return {
    ok: true,
    problems: [],
    artifact: {
      id: artifactId,
      approvedDirectionId: input.approved.id,
      sectionId: input.approved.sectionId,
      variantIds: input.variants.map((variant) => variant.id),
      regions,
    },
  };
}
