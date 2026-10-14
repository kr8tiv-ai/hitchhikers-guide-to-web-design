/**
 * Maps each brief requirement onto a build task.
 * A requirement is covered only when some task lists its id.
 * The message is the sentence the desk shows when approval is refused.
 */

export interface CoverageRequirement {
  id: string;
  label: string;
}

export interface CoverageTask {
  requirements: readonly string[];
}

export interface CoverageGap {
  id: string;
  label: string;
}

export interface PlanCoverage {
  ok: boolean;
  uncovered: CoverageGap[];
}

export class PlanCoverageError extends Error {
  readonly uncovered: CoverageGap[];

  constructor(uncovered: readonly CoverageGap[]) {
    const gaps = uncovered.map((item) => ({ id: item.id, label: item.label }));
    super(planCoverageMessage(gaps));
    this.name = "PlanCoverageError";
    this.uncovered = gaps;
  }
}

export function planCoverageMessage(uncovered: readonly CoverageGap[]): string {
  if (uncovered.length === 0) return "";
  const parts = uncovered.map((item) => `${item.label} (${item.id})`);
  return `These requirements have no build task: ${parts.join(", ")}.`;
}

export function checkPlanCoverage(
  requirements: readonly CoverageRequirement[],
  tasks: readonly CoverageTask[],
): PlanCoverage {
  const covered = new Set<string>();
  for (const task of tasks) {
    for (const id of task.requirements) covered.add(id);
  }
  const uncovered: CoverageGap[] = [];
  for (const requirement of requirements) {
    if (!covered.has(requirement.id)) {
      uncovered.push({ id: requirement.id, label: requirement.label });
    }
  }
  return { ok: uncovered.length === 0, uncovered };
}
