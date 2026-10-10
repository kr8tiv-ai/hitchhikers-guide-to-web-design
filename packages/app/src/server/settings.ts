/**
 * Desk settings: voice, model, effort, and the xAI speech-to-text rate.
 * The numbers come from packages/voice/src/xai-stt.ts. They are not copied here.
 * The app boundary allows only the engine dependency, so the rate card is a file URL import.
 * Acceptance is written beside config.json. voiceEngine stays local until that file matches the current card.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ConfigError,
  LockHeld,
  loadConfig,
  parseConfig,
  replaceViaTemp,
  withStateLock,
  type Effort,
  type GuideConfig,
} from "@hitchhiker/engine";
import { escapeHtml } from "../card.ts";
import { VOICE_PRIVACY_HELP } from "../client/voice-engine.ts";

export const STT_QUOTE_FILENAME = "stt-quote.json";

const VOICES = ["browser", "local", "xai"] as const;
const EFFORTS = ["medium", "high", "xhigh"] as const;

export type VoiceChoice = (typeof VOICES)[number];

const REFUSE_XAI = "xAI speech-to-text stays off until you accept the rate.";
const RATES_URL = new URL("../../../voice/src/xai-stt.ts", import.meta.url);

interface RateSide {
  ratePerHour: number;
  unitsPerHour: number;
  priceText: string;
}

interface XaiSttRates {
  rest: RateSide;
  streaming: RateSide;
}

interface QuoteFile {
  voiceInput: VoiceChoice;
  accepted: boolean;
  restPerHour: number | null;
  streamingPerHour: number | null;
  restPriceText: string | null;
  streamingPriceText: string | null;
}

interface SettingsInput {
  voice: VoiceChoice;
  model: string;
  effort: Effort;
  acceptQuote: boolean;
}

export interface SettingsView {
  voice: VoiceChoice;
  model: string;
  effort: Effort;
  accepted: boolean;
  restPriceText: string;
  streamingPriceText: string;
  restPerHour: number;
  streamingPerHour: number;
  note: string | null;
}

export interface SettingsFlash {
  kind: "ok" | "warn";
  text: string;
}

export interface SettingsPostResult {
  status: 200 | 400 | 409 | 500;
  error: string | null;
  view: SettingsView;
}

let cachedRates: XaiSttRates | null = null;

export async function loadSettingsView(projectDir: string): Promise<SettingsView> {
  const rates = await loadXaiSttRates();
  const config = loadConfig(projectDir);
  const quote = await readQuoteFile(projectDir);
  return viewFrom(config, quote, rates);
}

export function settingsStatus(view: SettingsView): string {
  if (view.voice === "xai" && view.accepted) return "xAI speech-to-text is on.";
  if (view.accepted) return "The rate is accepted. xAI speech-to-text is off.";
  return "xAI speech-to-text is off.";
}

export function settingsSavedLine(view: SettingsView): string {
  if (view.voice === "xai") return "Saved. xAI speech-to-text is on at the accepted rate.";
  if (view.voice === "browser") return "Saved. Browser speech is on. xAI stays off.";
  if (view.accepted) return "Saved. The rate is on file. Speech stays on this machine.";
  return "Saved. Speech stays on this machine.";
}

export function renderSettingsMain(
  view: SettingsView,
  token: string,
  flash: SettingsFlash | null,
): string {
  const flashHtml =
    flash === null
      ? ""
      : `<p class="${flash.kind === "warn" ? "hh-qcard__push" : "hh-qcard__notice"}" role="status">${escapeHtml(flash.text)}</p>`;
  const note =
    view.note === null ? "" : `<p class="hh-qcard__push">${escapeHtml(view.note)}</p>`;
  const acceptedLine = view.accepted
    ? `<p class="hh-qcard__why">These rates are on file.</p>`
    : "";
  return `<form class="hh-qcard hh-rise hh-rise--2" method="post" action="/settings" data-settings-form data-accepted="${view.accepted ? "true" : "false"}">
      <h1 class="hh-qcard__title">Settings</h1>
      <p class="hh-qcard__why">Voice, model, and effort for this project. The rate sits here before xAI speech-to-text can be turned on.</p>
      ${flashHtml}
      <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
      <div data-settings="voice">
        <p class="hh-qcard__label" id="settings-voice-label">Voice</p>
        <div class="hh-qcard__actions" role="radiogroup" aria-labelledby="settings-voice-label">
          ${choice("voice", "browser", "Browser", view.voice === "browser")}
          ${choice("voice", "local", "Local", view.voice === "local")}
          ${choice("voice", "xai", "xAI", view.voice === "xai")}
        </div>
        <p class="hh-qcard__why">${escapeHtml(VOICE_PRIVACY_HELP)} Local whisper is used only when it is installed and this browser has no speech recognition. xAI is billed at the rate below and stays off until you accept that rate.</p>
        ${note}
      </div>
      <div data-settings="rate">
        <p class="hh-qcard__label">Speech-to-text rate</p>
        <p data-stt-rate="rest" data-per-hour="${view.restPerHour}"><span class="hh-kicker">REST</span> ${escapeHtml(view.restPriceText)} per hour.</p>
        <p data-stt-rate="streaming" data-per-hour="${view.streamingPerHour}"><span class="hh-kicker">Streaming</span> ${escapeHtml(view.streamingPriceText)} per hour.</p>
        ${acceptedLine}
        <label class="hh-btn hh-btn--secondary">
          <input type="checkbox" name="acceptQuote" value="yes"${view.accepted ? " checked" : ""} />
          I accept these rates
        </label>
      </div>
      <div data-settings="model">
        <label class="hh-qcard__label" for="settings-model">Model</label>
        <div class="hh-qcard__actions">
          <input class="hh-btn hh-btn--secondary" id="settings-model" name="model" type="text" maxlength="80" autocomplete="off" spellcheck="false" value="${escapeHtml(view.model)}" />
        </div>
        <p class="hh-qcard__why">grok-4.7 is the usual model.</p>
      </div>
      <div data-settings="effort">
        <p class="hh-qcard__label" id="settings-effort-label">Effort</p>
        <div class="hh-qcard__actions" role="radiogroup" aria-labelledby="settings-effort-label">
          ${choice("effort", "medium", "Medium", view.effort === "medium")}
          ${choice("effort", "high", "High", view.effort === "high")}
          ${choice("effort", "xhigh", "Extra high", view.effort === "xhigh")}
        </div>
      </div>
      <div class="hh-qcard__actions">
        <button class="hh-btn hh-btn--primary" type="submit">Save settings</button>
      </div>
    </form>`;
}

export async function applySettingsPost(
  projectDir: string,
  raw: string,
  contentType: string,
): Promise<SettingsPostResult> {
  const rates = await loadXaiSttRates();
  const current = loadConfig(projectDir);
  const previous = await readQuoteFile(projectDir);
  const view = viewFrom(current, previous, rates);
  const parsed = parseSettingsBody(raw, contentType, current.model);
  if ("error" in parsed) return { status: 400, error: parsed.error, view };

  const quote = nextQuote(previous, parsed, rates);
  if (parsed.voice === "xai" && !acceptanceMatches(quote, rates)) {
    return { status: 409, error: REFUSE_XAI, view };
  }

  const next: GuideConfig = {
    ...current,
    model: parsed.model,
    effort: parsed.effort,
    voiceEngine: parsed.voice === "xai" ? "xai" : "local",
    ai: {
      model: parsed.model,
      timeoutMs: current.ai.timeoutMs,
      effort: { ...current.ai.effort, default: parsed.effort },
    },
  };

  try {
    const checked = parseConfig(next);
    const dir = path.join(projectDir, ".hitchhiker");
    await withStateLock(projectDir, async () => {
      await replaceViaTemp(path.join(dir, STT_QUOTE_FILENAME), quoteJson(quote));
      await replaceViaTemp(path.join(dir, "config.json"), `${JSON.stringify(checked, null, 2)}\n`);
    });
  } catch (error: unknown) {
    if (error instanceof LockHeld) {
      return { status: 409, error: "The project is busy. Try again.", view };
    }
    if (error instanceof ConfigError) return { status: 400, error: error.message, view };
    return { status: 500, error: "Settings did not save.", view };
  }

  const saved = await loadSettingsView(projectDir);
  return { status: 200, error: null, view: saved };
}

function choice(name: string, value: string, label: string, on: boolean): string {
  const tone = on ? "hh-btn hh-btn--primary" : "hh-btn hh-btn--secondary";
  const mark = on ? " checked" : "";
  return `<label class="${tone}"><input type="radio" name="${name}" value="${value}"${mark} /> ${label}</label>`;
}

async function loadXaiSttRates(): Promise<XaiSttRates> {
  if (cachedRates !== null) return cachedRates;
  const loaded: unknown = await import(RATES_URL.href);
  const rates = readRates(loaded);
  cachedRates = rates;
  return rates;
}

function readRates(loaded: unknown): XaiSttRates {
  if (!isRecord(loaded)) throw new Error("Speech-to-text rates could not be read.");
  const rates = loaded.XAI_STT_RATES;
  if (!isRecord(rates) || !isRateSide(rates.rest) || !isRateSide(rates.streaming)) {
    throw new Error("Speech-to-text rates could not be read.");
  }
  return { rest: rates.rest, streaming: rates.streaming };
}

function isRateSide(value: unknown): value is RateSide {
  if (!isRecord(value)) return false;
  return (
    typeof value.ratePerHour === "number" &&
    Number.isFinite(value.ratePerHour) &&
    value.ratePerHour > 0 &&
    typeof value.unitsPerHour === "number" &&
    typeof value.priceText === "string" &&
    value.priceText.length > 0
  );
}

function viewFrom(config: GuideConfig, quote: QuoteFile | null, rates: XaiSttRates): SettingsView {
  const accepted = acceptanceMatches(quote, rates);
  const effort = isEffort(config.ai.effort.default) ? config.ai.effort.default : config.effort;
  return {
    voice: displayedVoice(config, quote, accepted),
    model: config.ai.model,
    effort,
    accepted,
    restPriceText: rates.rest.priceText,
    streamingPriceText: rates.streaming.priceText,
    restPerHour: rates.rest.ratePerHour,
    streamingPerHour: rates.streaming.ratePerHour,
    note:
      config.voiceEngine === "xai" && !accepted
        ? "The config names xAI speech-to-text, and the rate is not accepted, so this page keeps the free engine."
        : null,
  };
}

function displayedVoice(
  config: GuideConfig,
  quote: QuoteFile | null,
  accepted: boolean,
): VoiceChoice {
  if (config.voiceEngine === "xai" && accepted) return "xai";
  if (quote?.voiceInput === "local") return "local";
  return "browser";
}

function nextQuote(previous: QuoteFile | null, input: SettingsInput, rates: XaiSttRates): QuoteFile {
  if (input.acceptQuote) {
    return {
      voiceInput: input.voice,
      accepted: true,
      restPerHour: rates.rest.ratePerHour,
      streamingPerHour: rates.streaming.ratePerHour,
      restPriceText: rates.rest.priceText,
      streamingPriceText: rates.streaming.priceText,
    };
  }
  if (acceptanceMatches(previous, rates)) {
    return {
      voiceInput: input.voice,
      accepted: true,
      restPerHour: previous.restPerHour,
      streamingPerHour: previous.streamingPerHour,
      restPriceText: previous.restPriceText,
      streamingPriceText: previous.streamingPriceText,
    };
  }
  return {
    voiceInput: input.voice,
    accepted: false,
    restPerHour: null,
    streamingPerHour: null,
    restPriceText: null,
    streamingPriceText: null,
  };
}

function acceptanceMatches(
  file: QuoteFile | null,
  rates: XaiSttRates,
): file is QuoteFile & {
  accepted: true;
  restPerHour: number;
  streamingPerHour: number;
  restPriceText: string;
  streamingPriceText: string;
} {
  return (
    file !== null &&
    file.accepted &&
    file.restPerHour === rates.rest.ratePerHour &&
    file.streamingPerHour === rates.streaming.ratePerHour &&
    file.restPriceText === rates.rest.priceText &&
    file.streamingPriceText === rates.streaming.priceText
  );
}

function parseSettingsBody(
  raw: string,
  contentType: string,
  currentModel: string,
): SettingsInput | { error: string } {
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  let voice: unknown;
  let model: unknown;
  let effort: unknown;
  let acceptQuote = false;
  if (mime === "application/json") {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return { error: "The desk could not read that request." };
    }
    if (!isRecord(value)) return { error: "The desk could not read that request." };
    voice = value.voice;
    model = value.model;
    effort = value.effort;
    acceptQuote = value.acceptQuote === true || value.acceptQuote === "yes";
  } else if (mime === "application/x-www-form-urlencoded") {
    const params = new URLSearchParams(raw);
    voice = params.get("voice");
    model = params.get("model");
    effort = params.get("effort");
    acceptQuote = params.getAll("acceptQuote").includes("yes");
  } else {
    return { error: "The desk could not read that request." };
  }

  if (typeof voice !== "string" || !isVoice(voice)) {
    return { error: "Voice must be browser speech, local whisper, or xAI." };
  }
  if (typeof effort !== "string" || !isEffort(effort)) {
    return { error: "Effort must be medium, high, or xhigh." };
  }
  if (typeof model !== "string") return { error: "Model must be a short name such as grok-4.7." };
  const trimmed = model.trim();
  if (!modelAllowed(trimmed, currentModel)) {
    return { error: "Model must be a short name such as grok-4.7." };
  }
  return { voice, model: trimmed, effort, acceptQuote };
}

function modelAllowed(value: string, current: string): boolean {
  if (value.length === 0 || value.length > 80) return false;
  if (/[\0\r\n<>]/.test(value)) return false;
  if (value === current) return true;
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
}

function isVoice(value: string): value is VoiceChoice {
  return (VOICES as readonly string[]).includes(value);
}

function isEffort(value: string): value is Effort {
  return (EFFORTS as readonly string[]).includes(value);
}

async function readQuoteFile(projectDir: string): Promise<QuoteFile | null> {
  let text: string;
  try {
    text = await readFile(path.join(projectDir, ".hitchhiker", STT_QUOTE_FILENAME), "utf8");
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
  return parseQuote(text);
}

function parseQuote(text: string): QuoteFile | null {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  if (typeof value.voiceInput !== "string" || !isVoice(value.voiceInput)) return null;
  return {
    voiceInput: value.voiceInput,
    accepted: value.accepted === true,
    restPerHour: typeof value.restPerHour === "number" ? value.restPerHour : null,
    streamingPerHour: typeof value.streamingPerHour === "number" ? value.streamingPerHour : null,
    restPriceText: typeof value.restPriceText === "string" ? value.restPriceText : null,
    streamingPriceText: typeof value.streamingPriceText === "string" ? value.streamingPriceText : null,
  };
}

function quoteJson(file: QuoteFile): string {
  const body: Record<string, string | number | boolean> = {
    voiceInput: file.voiceInput,
    accepted: file.accepted,
  };
  if (
    file.accepted &&
    file.restPerHour !== null &&
    file.streamingPerHour !== null &&
    file.restPriceText !== null &&
    file.streamingPriceText !== null
  ) {
    body.restPerHour = file.restPerHour;
    body.streamingPerHour = file.streamingPerHour;
    body.restPriceText = file.restPriceText;
    body.streamingPriceText = file.streamingPriceText;
  }
  return `${JSON.stringify(body, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}
