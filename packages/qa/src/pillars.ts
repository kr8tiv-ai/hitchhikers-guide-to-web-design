/**
 * Eight-pillar review rollup (Zaphod, prompt 110).
 *
 * v2 §11.3 still describes six visual pillars scored 1–4, plus brand
 * dimensions scored 1–10. This module is the rollup that prompt specifies:
 * copy, visuals, color, type, spacing, experience, motion, and brand, each
 * PASS, FIX, or BLOCKER. Motion and brand stay. Dropping either leaves them
 * in `missing` and sets worst to BLOCKER.
 *
 * The caller supplies the rows. A motion BLOCKER is how two scroll owners
 * surface. A brand BLOCKER is how an invented testimonial surfaces. This
 * function does not read pixels, screenshot files, or the network.
 *
 * Absence is reported. An empty note, a duplicate name, an unknown name, a
 * status outside the union, or a note that contains "replace GSAP" throws.
 * Replacing GSAP is not an allowed fix.
 */

export type PillarName =
  | "copy"
  | "visuals"
  | "color"
  | "type"
  | "spacing"
  | "experience"
  | "motion"
  | "brand";

export type PillarStatus = "PASS" | "FIX" | "BLOCKER";

const PILLAR_NAMES = [
  "copy",
  "visuals",
  "color",
  "type",
  "spacing",
  "experience",
  "motion",
  "brand",
] as const satisfies readonly PillarName[];

const PILLAR_NAME_SET: ReadonlySet<string> = new Set(PILLAR_NAMES);

const PILLAR_STATUS_SET: ReadonlySet<string> = new Set<PillarStatus>([
  "PASS",
  "FIX",
  "BLOCKER",
]);

/** Higher rank wins. BLOCKER beats FIX beats PASS. */
const STATUS_RANK: Record<PillarStatus, number> = {
  PASS: 0,
  FIX: 1,
  BLOCKER: 2,
};

const REPLACE_GSAP = "replace gsap";

function isPillarName(value: string): value is PillarName {
  return PILLAR_NAME_SET.has(value);
}

function isPillarStatus(value: string): value is PillarStatus {
  return PILLAR_STATUS_SET.has(value);
}

export function summarizePillars(
  rows: Array<{ name: PillarName; status: PillarStatus; note: string }>,
): { worst: PillarStatus; missing: PillarName[] } {
  const seen = new Set<PillarName>();
  const validated: Array<{ name: PillarName; status: PillarStatus; note: string }> = [];

  for (const row of rows) {
    const name: string = row.name;
    if (!isPillarName(name)) {
      throw new Error(`Unknown pillar name: ${JSON.stringify(name)}`);
    }
    const status: string = row.status;
    if (!isPillarStatus(status)) {
      throw new Error(`Unknown pillar status: ${JSON.stringify(status)}`);
    }
    if (typeof row.note !== "string" || row.note.trim().length === 0) {
      throw new Error(`Empty note for pillar ${name}. A missing note is invalid.`);
    }
    if (row.note.toLowerCase().includes(REPLACE_GSAP)) {
      throw new Error(
        `Note for pillar ${name} contains "replace GSAP". Replacing GSAP is not an allowed fix.`,
      );
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate pillar name: ${name}`);
    }
    seen.add(name);
    validated.push({ name, status, note: row.note });
  }

  const missing: PillarName[] = [];
  for (const name of PILLAR_NAMES) {
    if (!seen.has(name)) missing.push(name);
  }

  let worst: PillarStatus = missing.length > 0 ? "BLOCKER" : "PASS";
  for (const row of validated) {
    if (STATUS_RANK[row.status] > STATUS_RANK[worst]) {
      worst = row.status;
    }
  }

  return { worst, missing };
}
