import type { AnswerRecord, GuideState, Question } from "@hitchhiker/engine";

/**
 * Phase map and per-module interview progress.
 * Phase names are the locked list. Comparison is exact.
 * A SKIPPED answer renders as assumed. A question with no record is to do.
 */

const PHASE_NAMES = [
  "Don't Panic",
  "Babel Fish",
  "Deep Thought",
  "Improbability Drive",
  "Mostly Harmless",
  "So Long and Thanks for All the Fish",
] as const;

export const PHASES: readonly string[] = PHASE_NAMES;

type PhaseName = (typeof PHASE_NAMES)[number];

const STATUS_KEYS = ["answered", "suggested", "assumed", "soft", "imported", "todo"] as const;

type StatusKey = (typeof STATUS_KEYS)[number];

const STATUS_LABEL: Record<StatusKey, string> = {
  answered: "answered",
  suggested: "suggested",
  assumed: "assumed",
  soft: "soft",
  imported: "imported",
  todo: "to do",
};

function isPhase(value: string): value is PhaseName {
  return (PHASE_NAMES as readonly string[]).includes(value);
}

function phaseNote(name: PhaseName): string {
  switch (name) {
    case "Don't Panic":
      return "The interview. Save it and come back.";
    case "Babel Fish":
      return "Brand kit, after the brief is approved.";
    case "Deep Thought":
      return "Spec, prompts, and the stack.";
    case "Improbability Drive":
      return "The build, one prompt at a time.";
    case "Mostly Harmless":
      return "Gates, then another pass if you want one.";
    case "So Long and Thanks for All the Fish":
      return "Deploy, only after a yes.";
    default: {
      const unexpected: never = name;
      return unexpected;
    }
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function moduleTitle(slug: string): string {
  const words = slug.split("-").filter((word) => word.length > 0);
  const first = words[0];
  if (first === undefined) return "Module";
  const head = first.charAt(0).toUpperCase() + first.slice(1);
  return [head, ...words.slice(1)].join(" ");
}

function statusKey(status: AnswerRecord["status"]): Exclude<StatusKey, "todo"> {
  switch (status) {
    case "ANSWERED":
      return "answered";
    case "SUGGESTED":
      return "suggested";
    case "SKIPPED":
      return "assumed";
    case "SOFT":
      return "soft";
    case "IMPORTED":
      return "imported";
    default: {
      const unexpected: never = status;
      throw new Error(`Unknown answer status: ${String(unexpected)}`);
    }
  }
}

function statusLine(key: StatusKey, ids: readonly string[]): string {
  const label = STATUS_LABEL[key];
  const names = ids.map((id) => escapeHtml(id)).join(", ");
  const body = names.length === 0 ? `${ids.length} ${label}.` : `${ids.length} ${label}. ${names}.`;
  return `<span class="hh-map__note" data-status="${key}" data-count="${ids.length}">${body}</span>`;
}

/**
 * Six locked phases, in order. The phase on `state` is the only item with
 * `data-current="true"`. `nextAction` is escaped and shown on that item.
 * Any other phase string throws. `dont panic` is not Don't Panic.
 */
export function renderMap(state: GuideState): string {
  if (!isPhase(state.phase)) {
    throw new Error(`Unknown phase: ${state.phase}`);
  }
  const currentPhase = state.phase;
  const escapedNext = escapeHtml(state.nextAction);
  const items = PHASE_NAMES.map((name, index) => {
    const current = name === currentPhase;
    const number = String(index + 1).padStart(2, "0");
    const classes = current ? "hh-map__item hh-map__item--current" : "hh-map__item";
    const currentAttr = current ? ' data-current="true"' : "";
    const note = current && escapedNext.length > 0 ? escapedNext : phaseNote(name);
    const meter = current
      ? '\n              <span class="hh-map__meter" aria-hidden="true"><span class="hh-map__meter-fill"></span></span>'
      : "";
    return `            <li class="${classes}"${currentAttr}>
              <span class="hh-map__index">${number}</span>
              <span class="hh-map__name">${escapeHtml(name)}</span>
              <span class="hh-map__note">${note}</span>${meter}
            </li>`;
  });
  return `<ol class="hh-map" aria-label="Guide map">\n${items.join("\n")}\n</ol>`;
}

/**
 * One row per interview module, in tree order.
 * Counts and ids are answered, suggested, assumed (SKIPPED), soft, imported, and to do.
 * The last record for an id wins. An id the tree does not ask is ignored.
 */
export function renderGuideMap(answers: AnswerRecord[], tree: Question[]): string {
  const latest = new Map<string, AnswerRecord>();
  for (const answer of answers) {
    latest.set(answer.id, answer);
  }

  const modules: Array<{ name: string; buckets: Record<StatusKey, string[]> }> = [];
  const indexByName = new Map<string, number>();
  const seen = new Set<string>();

  for (const question of tree) {
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    let index = indexByName.get(question.module);
    if (index === undefined) {
      index = modules.length;
      indexByName.set(question.module, index);
      modules.push({
        name: question.module,
        buckets: { answered: [], suggested: [], assumed: [], soft: [], imported: [], todo: [] },
      });
    }
    const row = modules[index];
    if (row === undefined) continue;
    const record = latest.get(question.id);
    const key = record === undefined ? "todo" : statusKey(record.status);
    row.buckets[key].push(question.id);
  }

  const items = modules.map((row) => {
    const lines = STATUS_KEYS.map((key) => `              ${statusLine(key, row.buckets[key])}`);
    return `            <li class="hh-map__item" data-module="${escapeAttr(row.name)}">
              <span class="hh-map__name">${escapeHtml(moduleTitle(row.name))}</span>
${lines.join("\n")}
            </li>`;
  });
  const body = items.length === 0 ? "" : `\n${items.join("\n")}\n`;
  return `<ol class="hh-map" aria-label="Interview modules">${body}</ol>`;
}
