/**
 * Idea 26. Defects are graded blocker, major, or minor, and name the
 * project they were seen on. A blocker stays open until an Elevate pass
 * records a retest. Idea 2 caps the rounds. This log records the defects.
 */

export const DEFECT_SEVERITIES = ["blocker", "major", "minor"] as const;

export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

export interface DefectRetest {
  elevatePass: string;
  result: "pass" | "fail";
}

export interface DefectRecord {
  id: string;
  severity: DefectSeverity;
  project: string;
  state: "open" | "closed";
  retest: DefectRetest | null;
}

export interface DefectLogJudgement {
  ok: boolean;
  problems: string[];
}

export interface DefectClose {
  ok: boolean;
  record: DefectRecord;
  problems: string[];
}

function isSeverity(value: string): value is DefectSeverity {
  return (DEFECT_SEVERITIES as readonly string[]).includes(value);
}

function copyRecord(record: DefectRecord): DefectRecord {
  return {
    id: record.id,
    severity: record.severity,
    project: record.project,
    state: record.state,
    retest: record.retest === null
      ? null
      : { elevatePass: record.retest.elevatePass, result: record.retest.result },
  };
}

/** A closed blocker with no retest fails. Other severities may stay open. */
export function judgeDefectLog(records: readonly DefectRecord[]): DefectLogJudgement {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const id = record.id.trim();
    const label = id === "" ? "(unnamed)" : id;
    if (id === "") problems.push("A defect is missing an id.");
    else if (seen.has(id)) problems.push(`${label} is listed twice.`);
    seen.add(id);
    if (!isSeverity(record.severity)) problems.push(`${label} has no severity.`);
    if (record.project.trim() === "") problems.push(`${label} names no project.`);
    if (record.severity !== "blocker" || record.state !== "closed") continue;
    if (record.retest === null || record.retest.elevatePass.trim() === "") {
      problems.push(`${label} is a closed blocker without a retest.`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Attach the retest from one Elevate pass. Records with no result stay
 * as they were. The input array is not mutated.
 */
export function retestAfterElevate(
  records: readonly DefectRecord[],
  elevatePass: string,
  results: Readonly<Record<string, "pass" | "fail">>,
): DefectRecord[] {
  const pass = elevatePass.trim();
  return records.map((record) => {
    const next = copyRecord(record);
    if (pass === "") return next;
    const result = results[record.id];
    if (result !== "pass" && result !== "fail") return next;
    next.retest = { elevatePass: pass, result };
    return next;
  });
}

/** A blocker with no retest stays open. */
export function closeDefect(record: DefectRecord): DefectClose {
  const next = copyRecord(record);
  if (next.severity === "blocker" && (next.retest === null || next.retest.elevatePass.trim() === "")) {
    next.state = "open";
    const label = next.id.trim() === "" ? "(unnamed)" : next.id.trim();
    return {
      ok: false,
      record: next,
      problems: [`${label} is a blocker and cannot close without a retest.`],
    };
  }
  next.state = "closed";
  return { ok: true, record: next, problems: [] };
}
