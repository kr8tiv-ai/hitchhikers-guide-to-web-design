/**
 * Desk flags for the voice selector. xAI is on only when config names it.
 * The rate flag is the settings acceptance check, not a second, weaker copy.
 * A probe that throws leaves every flag false, so a paid engine cannot turn on by accident.
 */

import { loadConfig } from "@hitchhiker/engine";
import { loadSettingsView } from "./settings.ts";

export interface VoiceDeskFlags {
  xaiSetting: boolean;
  rateAccepted: boolean;
  localWhisper: boolean;
}

const WHISPER_URL = new URL("../../../voice/src/whisper.ts", import.meta.url);

export async function readVoiceDeskFlags(projectDir: string): Promise<VoiceDeskFlags> {
  try {
    const config = loadConfig(projectDir);
    const view = await loadSettingsView(projectDir);
    return {
      xaiSetting: config.voiceEngine === "xai",
      rateAccepted: view.accepted === true,
      localWhisper: await detectLocal(),
    };
  } catch {
    return { xaiSetting: false, rateAccepted: false, localWhisper: false };
  }
}

async function detectLocal(): Promise<boolean> {
  try {
    const loaded: unknown = await import(WHISPER_URL.href);
    if (typeof loaded !== "object" || loaded === null || !("detectLocalWhisper" in loaded)) return false;
    const detect = loaded.detectLocalWhisper;
    if (typeof detect !== "function") return false;
    const found: unknown = detect();
    return found === true;
  } catch {
    return false;
  }
}
