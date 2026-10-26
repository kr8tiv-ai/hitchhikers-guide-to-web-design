/**
 * BUG-070: a closing recap that still asks a question keeps an answerable card.
 * Answer, Suggest for me, and Skip are the three controls. Answering it
 * stores the motion fact and then shows Guide Entry is next.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { settleResponse } from "./settle-guide-job.ts";
import { removeTempDir } from "./remove-temp.ts";

const ASK =
  "Here is what I heard. You said the home page is a short calm film, and you also said no video at launch. Should I treat the film as gentle motion only, with no video file?";
const RESOLUTION = "Treat the film as gentle motion only, with no video file.";

const TREE = `questions:
  - id: DP-6.3
    module: motion
    depth: [express, standard, deep]
    ask: "How should the home page move?"
    why: "Motion sets the first screen."
    input: [text]
    skip_default: "Motion not stated."
    writes:
      - "SITE-BRIEF.md"
  - id: DP-9.5
    module: motion
    depth: [express, standard, deep]
    ask: "Anything else the Guide should know?"
    why: "A last open field."
    input: [text]
    skip_default: "Nothing else."
    writes:
      - "SITE-BRIEF.md"
`;

function tokenFrom(html: string): string {
  const matched = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(html);
  assert.ok(matched?.[1]);
  return matched[1];
}

test("the recap question has Answer, Suggest for me, and Skip, then Guide Entry is next", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-recap-card-"));
  mkdirSync(path.join(dir, "interview"), { recursive: true });
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, "interview", "tree.yaml"), TREE);
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    `${JSON.stringify({
      version: 1,
      answers: [
        { id: "DP-6.3", status: "ANSWERED", value: "The home page is a short calm film." },
        { id: "DP-9.5", status: "ANSWERED", value: "No video at launch." },
      ],
      cursor: 2,
      pushedIds: [],
    })}\n`,
  );
  writeFileSync(
    path.join(dir, ".hitchhiker", "guide-session.json"),
    `${JSON.stringify({
      version: 1,
      language: "en",
      pushes: {},
      shown: [],
      pendingClose: { questionId: "DP-6.3", ask: ASK, recap: ASK },
    })}\n`,
  );
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      open: false,
      guideThink: () => {
        throw new Error("The recap answer must not call the model.");
      },
    });
    const html = await (await fetch(handle.url)).text();
    assert.match(html, /id="hh-card-draft"/);
    assert.match(html, /data-action="answer"/);
    assert.match(html, /data-action="suggest"/);
    assert.match(html, /data-action="skip"/);
    assert.match(html, /Should I treat the film/);
    assert.equal(html.includes("Guide Entry is next."), false);
    const posted = await settleResponse(
      await fetch(new URL("/api/answer", handle.url), {
        method: "POST",
        headers: { "content-type": "application/json", "x-hh-csrf": tokenFrom(html) },
        body: JSON.stringify({ questionId: "DP-6.3", text: RESOLUTION }),
      }),
    );
    const body = JSON.parse(posted.text) as { error?: string; done?: boolean; session?: { cardHtml?: string } };
    assert.equal(posted.status, 200, body.error ?? posted.text);
    assert.equal(body.done, true);
    const again = await (await fetch(handle.url)).text();
    assert.match(again, /Guide Entry is next\./);
    assert.equal(again.includes('id="hh-card-draft"'), false);
    const saved = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "interview.json"), "utf8")) as {
      answers: Array<{ id: string; value: string }>;
    };
    assert.equal(saved.answers.find((answer) => answer.id === "DP-6.3")?.value, RESOLUTION);
  } finally {
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});
