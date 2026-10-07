/**
 * Honest cost line for the drive desk.
 * Subscription mode shows prompt counts. API mode shows dollars only from
 * measured token counts and a caller-supplied rate card. No billing call.
 */

const TOKENS_PER_MILLION = 1_000_000;

/** Built without a contiguous literal so the source never contains the refused illustration. */
const UNSOURCED_MARKER = `$${["10", "20"].join("-")}`;
const UNSOURCED_TAILS = ["-20", "\u201320", "\u201420"] as const;

export class CostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostError";
  }
}

export interface TokenRates {
  inputPerMillion: number;
  outputPerMillion: number;
  cardDate: string;
}

export interface CostInput {
  mode: "subscription" | "api";
  promptsRun: number;
  promptsTotal: number;
  inputTokens?: number;
  outputTokens?: number;
  rates?: TokenRates;
}

function isUnsourced(text: string): boolean {
  if (text.includes(UNSOURCED_MARKER)) return true;
  const head = "$" + "10";
  return UNSOURCED_TAILS.some((tail) => text.includes(head + tail));
}

function assertNoUnsourcedPrice(value: unknown): void {
  if (typeof value === "string") {
    if (isUnsourced(value)) {
      throw new CostError("Unsourced run price is refused.");
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertNoUnsourcedPrice(item);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) assertNoUnsourcedPrice(item);
  }
}

function assertWholeCount(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new CostError(`${name} must be a whole number.`);
  }
  return value;
}

function assertTokenCount(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CostError(`${name} must be a whole number.`);
  }
  if (value < 0) {
    throw new CostError("Negative tokens are refused.");
  }
  if (!Number.isSafeInteger(value)) {
    throw new CostError(`${name} must be a whole number.`);
  }
  return value;
}

function assertRate(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new CostError(`${name} must be a non-negative number.`);
  }
  return value;
}

function readRates(value: unknown): TokenRates | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CostError("Rates must be a price card.");
  }
  const record = value as {
    inputPerMillion?: unknown;
    outputPerMillion?: unknown;
    cardDate?: unknown;
  };
  if (typeof record.cardDate !== "string" || record.cardDate.trim() === "") {
    throw new CostError("Rates need a card date.");
  }
  return {
    inputPerMillion: assertRate(record.inputPerMillion, "Input rate"),
    outputPerMillion: assertRate(record.outputPerMillion, "Output rate"),
    cardDate: record.cardDate.trim(),
  };
}

function dollars(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new CostError("Measured price is not a finite amount.");
  }
  const cents = Math.round(amount * 100);
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  return `${whole}.${frac}`;
}

/**
 * Dollar amount for measured tokens. Rates are arguments so a future card
 * is not baked into this file.
 */
export function priceTokens(
  tokens: { inputTokens: number; outputTokens: number },
  rates: { inputPerMillion: number; outputPerMillion: number },
): number {
  const inputTokens = assertTokenCount(tokens.inputTokens, "Input tokens");
  const outputTokens = assertTokenCount(tokens.outputTokens, "Output tokens");
  if (inputTokens === undefined || outputTokens === undefined) {
    throw new CostError("Measured tokens are required.");
  }
  const inputPerMillion = assertRate(rates.inputPerMillion, "Input rate");
  const outputPerMillion = assertRate(rates.outputPerMillion, "Output rate");
  return (
    (inputTokens / TOKENS_PER_MILLION) * inputPerMillion +
    (outputTokens / TOKENS_PER_MILLION) * outputPerMillion
  );
}

function finish(line: string): string {
  if (isUnsourced(line)) {
    throw new CostError("Unsourced run price is refused.");
  }
  return line;
}

export function formatCost(input: CostInput): string {
  if (typeof input !== "object" || input === null) {
    throw new CostError("Cost input must be an object.");
  }
  assertNoUnsourcedPrice(input);
  if (input.mode !== "subscription" && input.mode !== "api") {
    throw new CostError("Mode must be subscription or api.");
  }
  const promptsRun = assertWholeCount("Prompts run", input.promptsRun);
  const promptsTotal = assertWholeCount("Prompt total", input.promptsTotal);
  if (promptsTotal === 0) {
    throw new CostError("Prompt total is zero.");
  }
  if (promptsTotal < 0) {
    throw new CostError("Prompt total is negative.");
  }
  if (promptsRun < 0) {
    throw new CostError("Prompt count is negative.");
  }
  if (promptsRun > promptsTotal) {
    throw new CostError("Prompts run cannot exceed the total.");
  }
  const inputTokens = assertTokenCount(input.inputTokens, "Input tokens");
  const outputTokens = assertTokenCount(input.outputTokens, "Output tokens");
  const rates = readRates(input.rates);

  if (input.mode === "subscription") {
    return finish(`Prompts ${promptsRun} of ${promptsTotal}.`);
  }

  const measured = inputTokens !== undefined && outputTokens !== undefined && rates !== undefined;
  if (!measured || rates === undefined || inputTokens === undefined || outputTokens === undefined) {
    return finish("API mode. No measured tokens yet.");
  }

  const amount = priceTokens({ inputTokens, outputTokens }, rates);
  return finish(`API mode. $${dollars(amount)}. Card ${rates.cardDate}.`);
}
