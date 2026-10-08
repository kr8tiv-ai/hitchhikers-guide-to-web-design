/**
 * QA-REPORT.md body (prompt 138, v2 §12 and §18).
 *
 * One section for the phone gate, accessibility, weight, and the jury,
 * then an overall PASS or BLOCKER. Overall is BLOCKER when any gate is
 * not PASS or the jury is not PASS. A passing phone section names the
 * real mobile run and the four Lighthouse scores. Dollar amounts are
 * left out. Angle brackets are stripped so the markdown stays plain.
 * This does not write a file and does not claim an award.
 */

export interface QaReportInput {
  phone: { status: "PASS" | "BLOCKER"; reasons: string[] };
  a11y: { status: "PASS" | "BLOCKER"; notes: string[] };
  weight: { status: "PASS" | "BLOCKER"; reasons: string[] };
  juryStatus: "PASS" | "FAIL";
  juryTotal: number;
}

const PHONE_SCORES = ["Performance", "Accessibility", "Best Practices", "SEO"] as const;

function plain(value: string): string {
  return value.replaceAll("<", "").replaceAll("$", "").replaceAll("!", "").trim();
}

function cleanList(items: readonly string[]): string[] {
  const lines: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const text = plain(item);
    if (text.length > 0) lines.push(text);
  }
  return lines;
}

function bullets(items: readonly string[]): string[] {
  return items.map((item) => `- ${item}`);
}

function phoneLines(status: QaReportInput["phone"]["status"], reasons: readonly string[]): string[] {
  const cleaned = cleanList(reasons);
  if (status !== "PASS") return cleaned.length === 0 ? ["no detail"] : bullets(cleaned);
  return ["real mobile", ...PHONE_SCORES.map((score) => `- ${score}`), ...bullets(cleaned)];
}

function gateLines(status: "PASS" | "BLOCKER", items: readonly string[]): string[] {
  const cleaned = cleanList(items);
  if (status !== "PASS" && cleaned.length === 0) return ["no detail"];
  return bullets(cleaned);
}

function oneDecimal(value: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0.0";
  return value.toFixed(1);
}

function failureLines(input: QaReportInput): string[] {
  const lines: string[] = [];
  if (input.phone.status !== "PASS") {
    lines.push(cleanList(input.phone.reasons).length === 0 ? "Phone: no detail" : "Phone is BLOCKER.");
  }
  if (input.a11y.status !== "PASS") {
    lines.push(cleanList(input.a11y.notes).length === 0 ? "Accessibility: no detail" : "Accessibility is BLOCKER.");
  }
  if (input.weight.status !== "PASS") {
    lines.push(cleanList(input.weight.reasons).length === 0 ? "Weight: no detail" : "Weight is BLOCKER.");
  }
  if (input.juryStatus !== "PASS") lines.push("Jury is FAIL.");
  if (lines.length === 0) lines.push("no detail");
  return lines;
}

function overallStatus(input: QaReportInput): "PASS" | "BLOCKER" {
  if (input.phone.status !== "PASS") return "BLOCKER";
  if (input.a11y.status !== "PASS") return "BLOCKER";
  if (input.weight.status !== "PASS") return "BLOCKER";
  if (input.juryStatus !== "PASS") return "BLOCKER";
  return "PASS";
}

function section(title: string, status: string, lines: readonly string[]): string {
  const body = lines.length > 0 ? `\n${lines.join("\n")}` : "";
  return `## ${title}\n\nStatus: ${status}${body}`;
}

/** Markdown for QA-REPORT.md. The caller prints or stores it. */
export function renderQaReport(input: QaReportInput): string {
  const overall = overallStatus(input);
  const parts = [
    section("Phone", input.phone.status, phoneLines(input.phone.status, input.phone.reasons)),
    section("Accessibility", input.a11y.status, gateLines(input.a11y.status, input.a11y.notes)),
    section("Weight", input.weight.status, gateLines(input.weight.status, input.weight.reasons)),
    section("Jury", input.juryStatus, [`Total: ${oneDecimal(input.juryTotal)}`]),
    section("Overall", overall, overall === "BLOCKER" ? failureLines(input) : []),
  ];
  return `${parts.join("\n\n")}\n`;
}
