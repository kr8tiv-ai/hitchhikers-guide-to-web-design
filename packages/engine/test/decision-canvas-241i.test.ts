/**
 * BUG-058 idea 31. The decision log keeps every rejected direction.
 * A later phase can still name them. Nothing in the log is deleted.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  decisionLogPath,
  notePhaseFinished,
  readDecisionLog,
  recordDirectionChoice,
  rejectedDirectionNames,
} from "../src/brand/decision-canvas.ts";
import type { DirectionDeal } from "../src/brand/directions.ts";
import { removeTempDir } from "./remove-temp.ts";

const deal: DirectionDeal = {
  pickedId: null,
  directions: [
    {
      id: "dir-north",
      name: "North kiln",
      description: "A kiln and a quiet yard.",
      citationId: "north",
      title: "North",
      url: "https://example.com/north",
      display: "Fraunces",
      body: "Literata",
      sectionOrder: ["hero", "story"],
      hue: "#1f6b4a",
    },
    {
      id: "dir-south",
      name: "South yard",
      description: "A yard palette.",
      citationId: "south",
      title: "South",
      url: "https://example.com/south",
      display: "Newsreader",
      body: "Source Serif 4",
      sectionOrder: ["hero", "gallery"],
      hue: "#8c4a2f",
    },
    {
      id: "dir-west",
      name: "West road",
      description: "A road order.",
      citationId: "west",
      title: "West",
      url: "https://example.com/west",
      display: "Bodoni Moda",
      body: "Literata",
      sectionOrder: ["hero", "footer"],
      hue: "#1d4e89",
    },
  ],
};

test("a later phase can still name the rejected directions", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-decisions-"));
  try {
    const written = recordDirectionChoice(
      dir,
      deal,
      "dir-north",
      {
        "dir-north": "The quieter type fits the brief.",
        "dir-south": "The yard palette fights the paper.",
        "dir-west": "The road order repeats the hero.",
      },
      "2026-10-20T12:00:00.000Z",
    );
    assert.equal(written.filter((entry) => entry.status === "rejected").length, 2);
    assert.deepEqual(rejectedDirectionNames(dir), ["South yard", "West road"]);

    const before = readFileSync(decisionLogPath(dir), "utf8");
    const rejectedLines = before.split(/\r?\n/).filter((line) => line.includes("\"status\":\"rejected\""));
    notePhaseFinished(dir, "brand", "The brand phase finished with the north pick.", "2026-10-20T13:00:00.000Z");
    const after = readFileSync(decisionLogPath(dir), "utf8");
    for (const line of rejectedLines) assert.equal(after.includes(line), true);
    assert.equal(after.length > before.length, true);
    assert.deepEqual(rejectedDirectionNames(dir), ["South yard", "West road"]);

    const phase = readDecisionLog(dir).filter((entry) => entry.status === "phase");
    assert.equal(phase.length, 1);
    assert.equal(phase[0]?.name, "brand");
    assert.match(phase[0]?.reason ?? "", /north pick/);
  } finally {
    removeTempDir(dir);
  }
});
