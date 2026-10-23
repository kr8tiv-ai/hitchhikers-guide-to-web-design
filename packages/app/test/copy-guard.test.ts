/**
 * User-facing constants. Internal words stay out of the card and the voice lines.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ANSWER_PROGRESS, GUIDE_FAIL_LINE, READING_LINE, jargonHits } from "@hitchhiker/engine";
import {
  OTHER_CHOICE_LABEL,
  SKIP_CONFIRM,
  SKIP_LABEL,
  SUGGEST_LABEL,
  VOICE_SERVICE_NOTE,
} from "../src/card.ts";
import {
  LONG_WAIT_NOTE,
  READ_THIS_IN,
  VOICE_BLOCKED,
  VOICE_CAP_NOTICE,
  VOICE_FAILED,
  VOICE_FIRST_ALLOW,
  VOICE_HEARD,
  VOICE_LABEL_IDLE,
  VOICE_LABEL_STOP,
  VOICE_LISTENING,
  VOICE_LIVE_STARTED,
  VOICE_LIVE_STOPPED,
  VOICE_NETWORK,
  VOICE_NO_MIC,
  VOICE_NO_TRANSCRIPT,
  VOICE_RELEASE_EMPTY,
  VOICE_SILENT,
  VOICE_UNSUPPORTED,
} from "../src/client/desk.ts";
import { modeNote } from "../src/server/card.ts";

const LINES = [
  OTHER_CHOICE_LABEL,
  SKIP_CONFIRM,
  SKIP_LABEL,
  SUGGEST_LABEL,
  VOICE_SERVICE_NOTE,
  READ_THIS_IN,
  LONG_WAIT_NOTE,
  VOICE_BLOCKED,
  VOICE_CAP_NOTICE,
  VOICE_FAILED,
  VOICE_FIRST_ALLOW,
  VOICE_HEARD,
  VOICE_LABEL_IDLE,
  VOICE_LABEL_STOP,
  VOICE_LISTENING,
  VOICE_LIVE_STARTED,
  VOICE_LIVE_STOPPED,
  VOICE_NETWORK,
  VOICE_NO_MIC,
  VOICE_NO_TRANSCRIPT,
  VOICE_RELEASE_EMPTY,
  VOICE_SILENT,
  VOICE_UNSUPPORTED,
  READING_LINE,
  GUIDE_FAIL_LINE,
  ...ANSWER_PROGRESS,
  modeNote("express"),
  modeNote("standard"),
  modeNote("deep"),
];

test("exported desk lines do not use internal jargon", () => {
  const hits = LINES.flatMap((line) => jargonHits(line).map((hit) => `${hit}: ${line}`));
  assert.deepEqual(hits, []);
});
