import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { think as engineThink, type ThinkResult } from "../src/ai/index.ts";
import { BRAND_SECTIONS } from "../src/brand/approve.ts";
import { acquire, release, LockHeld, STATE_LOCK_NAME } from "../src/lock.ts";
import type { AnswerRecord } from "../src/required.ts";
import { onPhaseStart, savePartial, loadPartial, writeBack, type BeforeJumpAnswer, type BeforeJumpCard, type BeforeJumpPhase } from "../src/phases/before-jump-hook.ts";

type ThinkFn = typeof engineThink;

const SETTLED_HOST =
  "Hostinger. Domain owned at Namecheap. DNS records are at Cloudflare. Email is on the domain.";

const FILLERS = [
  "What should the launch announcement avoid claiming?",
  "Which page should the launch announcement link to first?",
  "Who should read the launch announcement before it is sent?",
];

const PHASES: readonly BeforeJumpPhase[] = [
  "babel-fish",
  "deep-thought",
  "improbability-drive",
  "mostly-harmless",
  "so-long",
];

const PHASE_LABEL: Record<BeforeJumpPhase, string> = {
  "babel-fish": "Babel Fish",
  "deep-thought": "Deep Thought",
  "improbability-drive": "Improbability Drive",
  "mostly-harmless": "Mostly Harmless",
  "so-long": "So Long and Thanks for All the Fish",
};

function record(id: string, status: AnswerRecord["status"], value: string): AnswerRecord {
  return { id, status, value };
}

function closedAnswers(overrides: AnswerRecord[] = []): AnswerRecord[] {
  const base: AnswerRecord[] = [
    record("DP-2.1", "ANSWERED", "A night stall for regulars."),
    record("DP-2.6", "ANSWERED", "Night stall regulars."),
    record("DP-2.2", "ANSWERED", "Reserve a seat."),
    record("DP-5.3", "ANSWERED", "paper, ink, night"),
    record("DP-6.2", "ANSWERED", "4"),
    record("DP-9.2", "ANSWERED", SETTLED_HOST),
    record("DP-3.8", "ANSWERED", "Plausible. No cookie banner."),
    record("DP-9.1", "ANSWERED", "2026-11-01"),
    record("DP-8.4", "ANSWERED", "Privacy and terms."),
    record("DP-8.2", "SKIPPED", "Customer testimonials from the stall."),
  ];
  const map = new Map<string, AnswerRecord>();
  for (const item of base) map.set(item.id, item);
  for (const item of overrides) map.set(item.id, item);
  return [...map.values()];
}

function approvals(flags: Partial<Record<(typeof BRAND_SECTIONS)[number], boolean>> = {}): Record<string, boolean> {
  const all: Record<string, boolean> = {};
  for (const section of BRAND_SECTIONS) all[section] = true;
  return { ...all, ...flags };
}

function quietThink(): ThinkFn {
  const fn = async <T>(): Promise<ThinkResult<T>> => ({
    value: { contradicts: false, section: "" } as T,
    raw: "{}",
    durationMs: 0,
    cassette: "hit",
  });
  return fn as ThinkFn;
}

function boomThink(): ThinkFn {
  const fn = async (): Promise<ThinkResult<never>> => {
    throw new Error("think should not run when nothing is answered");
  };
  return fn as ThinkFn;
}

function mustCard(card: BeforeJumpCard | undefined): BeforeJumpCard {
  if (card === undefined) throw new Error("missing card");
  return card;
}

function hitch(dir: string): string {
  return path.join(dir, ".hitchhiker");
}

async function project(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "hh-before-jump-"));
  mkdirSync(hitch(dir), { recursive: true });
  return dir;
}

function writeInterview(dir: string, answers: AnswerRecord[], cursor = 3): void {
  const body = {
    note: "keep",
    version: 1,
    answers,
    cursor,
    pushedIds: ["DP-0.1"],
  };
  writeFileSync(path.join(hitch(dir), "interview.json"), `${JSON.stringify(body, null, 2)}\n`);
}

function writeApprovalFile(dir: string, flags: Record<string, boolean>): void {
  writeFileSync(path.join(hitch(dir), "brand-approval.json"), `${JSON.stringify(flags, null, 2)}\n`);
}

function writeLegal(dir: string): void {
  writeFileSync(path.join(hitch(dir), "LEGAL.md"), "# LEGAL\n\nPrivacy and terms.\n");
}

function brandDoc(status: "draft" | "approved"): string {
  const sections = BRAND_SECTIONS.map((section) => `## ${section[0]?.toUpperCase()}${section.slice(1)}\n\nKeep ${section}.\n`).join("\n");
  return `# BRAND\n\nStatus: ${status}\n\n${sections}`;
}

function readText(file: string): string {
  return readFileSync(file, "utf8");
}

function reply(card: BeforeJumpCard, text: string, action: BeforeJumpAnswer["action"] = "answer"): BeforeJumpAnswer {
  return {
    id: card.id,
    action,
    text,
    target: card.target,
    field: card.field,
    answerId: card.answerId,
  };
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

test("writeBack stores a brief field in SITE-BRIEF and interview.json", async () => {
  const dir = await project();
  try {
    writeInterview(dir, closedAnswers(), 3);
    const written = await writeBack(dir, {
      id: "DP-2.1",
      action: "answer",
      text: "A night stall for regulars who stay late.",
      target: "brief",
      field: "goal",
      answerId: "DP-2.1",
    });
    assert.equal(written, path.join(hitch(dir), "SITE-BRIEF.md"));
    const brief = readText(written);
    assert.match(brief, /## Goal\n\nA night stall for regulars who stay late\./);
    const interview = JSON.parse(readText(path.join(hitch(dir), "interview.json"))) as {
      note: string;
      cursor: number;
      pushedIds: string[];
      answers: AnswerRecord[];
    };
    assert.equal(interview.note, "keep");
    assert.equal(interview.cursor, 3);
    assert.deepEqual(interview.pushedIds, ["DP-0.1"]);
    const goals = interview.answers.filter((item) => item.id === "DP-2.1" && item.status === "ANSWERED");
    assert.equal(goals.at(-1)?.value, "A night stall for regulars who stay late.");
    await writeBack(dir, {
      id: "DP-2.1",
      action: "answer",
      text: "A night stall for regulars who stay late.",
      target: "brief",
      field: "goal",
      answerId: "DP-2.1",
    });
    const again = JSON.parse(readText(path.join(hitch(dir), "interview.json"))) as { answers: AnswerRecord[] };
    const dupes = again.answers.filter((item) => item.id === "DP-2.1" && item.value === "A night stall for regulars who stay late.");
    assert.equal(dupes.length, 1);
    const ids = JSON.parse(readText(path.join(hitch(dir), "before-we-jump.json"))) as { answered: string[] };
    assert.ok(ids.answered.includes("DP-2.1"));
  } finally {
    cleanup(dir);
  }
});

test("writeBack splices a brand section without approving it", async () => {
  const dir = await project();
  try {
    writeApprovalFile(dir, approvals({ logo: false }));
    const written = await writeBack(dir, {
      id: "brand:logo",
      action: "answer",
      text: "A brass wordmark, drawn once.",
      target: "brand",
      field: "logo",
      answerId: null,
    });
    assert.equal(path.basename(written), "BRAND.md");
    const brand = readText(written);
    assert.match(brand, /## Logo\n\nA brass wordmark, drawn once\./);
    assert.match(brand, /^Status: draft$/m);
    const flags = JSON.parse(readText(path.join(hitch(dir), "brand-approval.json"))) as { logo: boolean };
    assert.equal(flags.logo, false);
  } finally {
    cleanup(dir);
  }
});

test("writeBack renders VOICE.md through the voice writer", async () => {
  const dir = await project();
  try {
    const written = await writeBack(dir, {
      id: "DP-0.5",
      action: "answer",
      text: "Read the posts, do not post.",
      target: "voice",
      field: "x",
      answerId: "DP-0.5",
    });
    assert.equal(path.basename(written), "VOICE.md");
    const voice = readText(written);
    assert.match(voice, /^# VOICE$/m);
    assert.match(voice, /## x\n\nRead the posts, do not post\./);
    assert.equal(voice.includes("!"), false);
  } finally {
    cleanup(dir);
  }
});

test("writeBack renders MOTION.md through the motion planner", async () => {
  const dir = await project();
  try {
    const written = await writeBack(dir, {
      id: "DP-6.2",
      action: "answer",
      text: "Keep it at 7.",
      target: "motion",
      field: "appetite",
      answerId: "DP-6.2",
    });
    assert.equal(path.basename(written), "MOTION.md");
    const motion = readText(written);
    assert.match(motion, /Appetite: 7 of 10/);
    assert.match(motion, /## appetite\n\nKeep it at 7\./);
  } finally {
    cleanup(dir);
  }
});

test("writeBack renders STACK-DECISION through decideStack", async () => {
  const dir = await project();
  try {
    const written = await writeBack(dir, {
      id: "stack",
      action: "answer",
      text: "Use astro for the marketing site.",
      target: "stack",
      field: "pick",
      answerId: null,
    });
    assert.equal(written, path.join(hitch(dir), "research", "STACK-DECISION.md"));
    const stack = readText(written);
    assert.match(stack, /^# STACK-DECISION$/m);
    assert.match(stack, /## Pick\n\nastro\n/);
    assert.match(stack, /## Before we jump\n\nUse astro for the marketing site\./);
  } finally {
    cleanup(dir);
  }
});

test("writeBack stores deploy settings and the config target", async () => {
  const dir = await project();
  try {
    const written = await writeBack(dir, {
      id: "DP-9.2",
      action: "answer",
      text: "Hostinger, the recommended host.",
      target: "deploy",
      field: "deployTarget",
      answerId: "DP-9.2",
    });
    assert.equal(path.basename(written), "DEPLOY.md");
    assert.match(readText(written), /^- deployTarget: hostinger$/m);
    const config = JSON.parse(readText(path.join(hitch(dir), "config.json"))) as { deployTarget: string };
    assert.equal(config.deployTarget, "hostinger");
    await writeBack(dir, {
      id: "domain",
      action: "answer",
      text: "stall.example, registrar is Namecheap.",
      target: "deploy",
      field: "domain",
      answerId: null,
    });
    const deploy = readText(path.join(hitch(dir), "DEPLOY.md"));
    assert.match(deploy, /^- deployTarget: hostinger$/m);
    assert.match(deploy, /^- domain: stall\.example, registrar is Namecheap\.$/m);
    const again = JSON.parse(readText(path.join(hitch(dir), "config.json"))) as { deployTarget: string };
    assert.equal(again.deployTarget, "hostinger");
  } finally {
    cleanup(dir);
  }
});

test("writeBack refuses an approved section until it is reopened", async () => {
  const dir = await project();
  try {
    const brand = brandDoc("approved");
    writeFileSync(path.join(hitch(dir), "BRAND.md"), brand);
    writeApprovalFile(dir, approvals());
    const blocked = await writeBack(dir, {
      id: "brand:logo",
      action: "answer",
      text: "A brass wordmark, drawn once.",
      target: "brand",
      field: "logo",
      answerId: null,
    });
    assert.equal(blocked, "blocked:logo");
    assert.equal(readText(path.join(hitch(dir), "BRAND.md")), brand);
    assert.equal(readFileSync(path.join(hitch(dir), "brand-approval.json"), "utf8").includes('"logo": true'), true);
  } finally {
    cleanup(dir);
  }
});

test("writeBack throws while the state lock is held and leaves files untouched", async () => {
  const dir = await project();
  const interview = path.join(hitch(dir), "interview.json");
  const sentinel = `${JSON.stringify({ version: 1, answers: [], cursor: 3, pushedIds: [] }, null, 2)}\n`;
  writeFileSync(interview, sentinel);
  const info = await acquire(path.join(hitch(dir), STATE_LOCK_NAME));
  try {
    await assert.rejects(
      writeBack(dir, {
        id: "DP-2.1",
        action: "answer",
        text: "A night stall for regulars.",
        target: "brief",
        field: "goal",
        answerId: "DP-2.1",
      }),
      (error: unknown) => error instanceof LockHeld,
    );
    assert.equal(readText(interview), sentinel);
    assert.equal(existsSync(path.join(hitch(dir), "SITE-BRIEF.md")), false);
  } finally {
    await release(path.join(hitch(dir), STATE_LOCK_NAME), info.pid);
    cleanup(dir);
  }
});

test("a closed project shows the jump card and asks nothing", async () => {
  const dir = await project();
  try {
    writeInterview(dir, closedAnswers());
    writeApprovalFile(dir, approvals());
    writeLegal(dir);
    let thinkCalls = 0;
    const think = boomThink();
    const wrapped: ThinkFn = (async (req, deps) => {
      thinkCalls += 1;
      return think(req, deps);
    }) as ThinkFn;
    const seen: BeforeJumpCard[] = [];
    const result = await onPhaseStart("deep-thought", dir, {
      ask: async (cards) => {
        seen.push(...cards);
        return [];
      },
      think: wrapped,
    });
    assert.equal(result.asked, 0);
    assert.deepEqual(result.written, []);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.ask, "Nothing open. Jumping.");
    assert.equal(seen[0]?.target, "jump");
    assert.match(seen[0]?.why ?? "", /Deep Thought/);
    assert.equal(thinkCalls, 0);
    for (const filler of FILLERS) assert.equal(seen.some((card) => card.ask === filler), false);
  } finally {
    cleanup(dir);
  }
});

test("two real gaps drop the filler and land in the owning files", async () => {
  const dir = await project();
  try {
    writeInterview(dir, closedAnswers());
    writeApprovalFile(dir, approvals({ logo: false }));
    const result = await onPhaseStart("deep-thought", dir, {
      ask: async (cards) => {
        assert.deepEqual(cards.map((card) => card.id), ["brand:logo", "legal"]);
        assert.equal(cards.some((card) => FILLERS.includes(card.ask)), false);
        assert.equal(cards.some((card) => /testimonial/i.test(card.ask)), false);
        assert.match(cards[0]?.why ?? "", /Deep Thought/);
        return [
          reply(mustCard(cards[0]), "A brass wordmark, drawn once."),
          reply(mustCard(cards[1]), "Privacy and terms, both."),
        ];
      },
      think: quietThink(),
    });
    assert.equal(result.asked, 2);
    const brand = readText(path.join(hitch(dir), "BRAND.md"));
    const brief = readText(path.join(hitch(dir), "SITE-BRIEF.md"));
    assert.match(brand, /A brass wordmark, drawn once\./);
    assert.match(brief, /## legal\n\nPrivacy and terms, both\./);
    const flags = JSON.parse(readText(path.join(hitch(dir), "brand-approval.json"))) as { logo: boolean };
    assert.equal(flags.logo, false);
    const again = await onPhaseStart("deep-thought", dir, {
      ask: async (cards) => {
        assert.equal(cards.some((card) => card.id === "brand:logo" || card.id === "legal"), false);
        return [];
      },
      think: quietThink(),
    });
    assert.equal(again.asked, 0);
  } finally {
    cleanup(dir);
  }
});

test("an Express ASSUMED default is re-asked once and then stored", async () => {
  const dir = await project();
  try {
    writeInterview(dir, [
      ...closedAnswers(),
      record("DP-0.5", "SKIPPED", "ASSUMED: No X connection."),
    ]);
    writeApprovalFile(dir, approvals({ voice: false }));
    writeLegal(dir);
    writeFileSync(path.join(hitch(dir), "before-we-jump.json"), `${JSON.stringify({
      version: 1,
      ids: ["DP-0.5"],
      flagged: [{ id: "DP-0.5", value: "ASSUMED: No X connection." }],
    }, null, 2)}\n`);
    const first = await onPhaseStart("babel-fish", dir, {
      ask: async (cards) => {
        assert.deepEqual(cards.map((card) => card.id), ["brand:voice", "DP-0.5"]);
        assert.match(cards[1]?.ask ?? "", /Express default/);
        assert.equal(cards[1]?.target, "voice");
        assert.equal(cards[1]?.field, "x");
        return [
          reply(mustCard(cards[0]), "", "skip"),
          reply(mustCard(cards[1]), "Read the posts, do not post."),
        ];
      },
      think: quietThink(),
    });
    assert.equal(first.asked, 2);
    const voice = readText(path.join(hitch(dir), "VOICE.md"));
    assert.match(voice, /^# VOICE$/m);
    assert.match(voice, /## x\n\nRead the posts, do not post\./);
    const interview = JSON.parse(readText(path.join(hitch(dir), "interview.json"))) as {
      cursor: number;
      answers: AnswerRecord[];
    };
    assert.equal(interview.cursor, 3);
    assert.equal(interview.answers.filter((item) => item.id === "DP-0.5").at(-1)?.status, "ANSWERED");
    await onPhaseStart("mostly-harmless", dir, {
      ask: async (cards) => {
        assert.equal(cards.some((card) => card.id === "DP-0.5"), false);
        assert.equal(cards.some((card) => /Express default/.test(card.ask)), false);
        return [];
      },
      think: quietThink(),
    });
    const jump = JSON.parse(readText(path.join(hitch(dir), "before-we-jump.json"))) as {
      ids: string[];
      flagged: Array<{ id: string }>;
    };
    assert.deepEqual(jump.ids, ["DP-0.5"]);
    assert.equal(jump.flagged[0]?.id, "DP-0.5");
  } finally {
    cleanup(dir);
  }
});

test("every phase start uses the same file-built list", async () => {
  const dir = await project();
  try {
    writeInterview(dir, closedAnswers());
    writeApprovalFile(dir, approvals({ logo: false }));
    let firstIds: string[] = [];
    for (const phase of PHASES) {
      await onPhaseStart(phase, dir, {
        ask: async (cards) => {
          assert.ok(cards.length >= 1);
          assert.ok(cards.length <= 8);
          assert.match(cards[0]?.why ?? "", new RegExp(PHASE_LABEL[phase].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
          const ids = cards.map((card) => card.id);
          if (firstIds.length === 0) firstIds = ids;
          else assert.deepEqual(ids, firstIds);
          return [];
        },
        think: boomThink(),
      });
    }
    assert.deepEqual(firstIds, ["brand:logo", "legal"]);
  } finally {
    cleanup(dir);
  }
});

test("more than eight open items keep eight and list the rest as ASSUMED", async () => {
  const dir = await project();
  try {
    writeFileSync(path.join(hitch(dir), "before-we-jump.json"), `${JSON.stringify({
      version: 1,
      ids: ["DP-0.5"],
      flagged: [{ id: "DP-0.5", value: "ASSUMED: No X connection." }],
    }, null, 2)}\n`);
    await onPhaseStart("so-long", dir, {
      ask: async (cards) => {
        assert.equal(cards.length, 8);
        assert.equal(cards[0]?.id, "DP-9.2");
        assert.equal(cards[1]?.id, "brand:purpose");
        assert.equal(cards[7]?.id, "overflow");
        assert.equal(cards[7]?.target, "assumed");
        assert.match(cards[7]?.ask ?? "", /more items are still open/);
        assert.equal(cards.some((card) => FILLERS.includes(card.ask)), false);
        assert.equal(cards.some((card) => /testimonial/i.test(card.ask)), false);
        return [];
      },
      think: boomThink(),
    });
    const jump = JSON.parse(readText(path.join(hitch(dir), "before-we-jump.json"))) as {
      ids: string[];
      flagged: Array<{ id: string }>;
      assumed: Array<{ status: string; kind: string; phase: string; note: string }>;
    };
    assert.deepEqual(jump.ids, ["DP-0.5"]);
    assert.equal(jump.flagged[0]?.id, "DP-0.5");
    const note = jump.assumed.find((item) => item.kind === "overflow" && item.phase === "so-long");
    assert.equal(note?.status, "ASSUMED");
    assert.match(note?.note ?? "", /more items are still open and were not asked\. Status: ASSUMED\./);
  } finally {
    cleanup(dir);
  }
});

test("a contradicting answer asks before reopening an approved section", async () => {
  const dir = await project();
  try {
    const withoutVibe = closedAnswers().filter((item) => item.id !== "DP-5.3");
    writeInterview(dir, withoutVibe);
    writeApprovalFile(dir, approvals());
    writeLegal(dir);
    writeFileSync(path.join(hitch(dir), "BRAND.md"), brandDoc("approved"));
    const yes = await onPhaseStart("improbability-drive", dir, {
      ask: async (cards) => {
        if (cards[0]?.id === "DP-5.3") {
          assert.equal(cards.length, 1);
          assert.equal(cards[0]?.target, "voice");
          return [reply(cards[0], "paper, ink, night")];
        }
        assert.equal(cards.length, 1);
        assert.match(cards[0]?.ask ?? "", /contradicts the approved voice section/);
        assert.equal(cards[0]?.id, "reopen:voice:DP-5.3");
        return [reply(mustCard(cards[0]), "Yes, reopen it.")];
      },
      think: quietThink(),
    });
    assert.equal(yes.asked, 2);
    const flags = JSON.parse(readText(path.join(hitch(dir), "brand-approval.json"))) as { voice: boolean };
    assert.equal(flags.voice, false);
    const brand = readText(path.join(hitch(dir), "BRAND.md"));
    assert.match(brand, /^Status: draft$/m);
    assert.match(brand, /## Voice\n\nKeep voice\./);
    assert.match(readText(path.join(hitch(dir), "VOICE.md")), /paper, ink, night/);
  } finally {
    cleanup(dir);
  }
});

test("declining a reopen leaves the approved section untouched", async () => {
  const dir = await project();
  try {
    const withoutVibe = closedAnswers().filter((item) => item.id !== "DP-5.3");
    writeInterview(dir, withoutVibe);
    writeApprovalFile(dir, approvals());
    writeLegal(dir);
    const brand = brandDoc("approved");
    writeFileSync(path.join(hitch(dir), "BRAND.md"), brand);
    await onPhaseStart("mostly-harmless", dir, {
      ask: async (cards) => {
        if (cards[0]?.id === "DP-5.3") return [reply(cards[0], "paper, ink, night")];
        return [reply(mustCard(cards[0]), "No, leave it.")];
      },
      think: quietThink(),
    });
    assert.equal(readText(path.join(hitch(dir), "BRAND.md")), brand);
    const flags = JSON.parse(readText(path.join(hitch(dir), "brand-approval.json"))) as { voice: boolean };
    assert.equal(flags.voice, true);
    assert.equal(exists(path.join(hitch(dir), "VOICE.md")), false);
    await onPhaseStart("mostly-harmless", dir, {
      ask: async (cards) => {
        assert.equal(cards.some((card) => card.id === "DP-5.3"), true);
        return [];
      },
      think: quietThink(),
    });
  } finally {
    cleanup(dir);
  }
});

test("a cross-file contradiction can reopen the named approval", async () => {
  const dir = await project();
  try {
    writeInterview(dir, closedAnswers());
    writeApprovalFile(dir, approvals());
    writeFileSync(path.join(hitch(dir), "BRAND.md"), brandDoc("approved"));
    const think: ThinkFn = (async () => ({
      value: { contradicts: true, section: "purpose" },
      raw: "{}",
      durationMs: 0,
      cassette: "hit" as const,
    })) as ThinkFn;
    await onPhaseStart("so-long", dir, {
      ask: async (cards) => {
        if (cards[0]?.id === "legal") return [reply(cards[0], "Privacy and terms, both.")];
        assert.match(cards[0]?.ask ?? "", /approved purpose section/);
        return [reply(mustCard(cards[0]), "reopen")];
      },
      think,
    });
    const flags = JSON.parse(readText(path.join(hitch(dir), "brand-approval.json"))) as { purpose: boolean };
    assert.equal(flags.purpose, false);
    assert.match(readText(path.join(hitch(dir), "BRAND.md")), /## Purpose\n\nKeep purpose\./);
    assert.match(readText(path.join(hitch(dir), "SITE-BRIEF.md")), /## legal\n\nPrivacy and terms, both\./);
  } finally {
    cleanup(dir);
  }
});

test("answers saved before a close return for the ones still open", async () => {
  const dir = await project();
  try {
    writeInterview(dir, closedAnswers());
    writeApprovalFile(dir, approvals({ logo: false }));
    await assert.rejects(
      onPhaseStart("deep-thought", dir, {
        ask: async (cards) => {
          await writeBack(dir, reply(mustCard(cards[0]), "A brass wordmark, drawn once."));
          throw new Error("closed");
        },
        think: quietThink(),
      }),
      /closed/,
    );
    await savePartial(dir, "deep-thought", [{
      id: "legal",
      action: "answer",
      text: "Privacy and terms, both.",
      target: "brief",
      field: "legal",
      answerId: "DP-8.4",
    }]);
    const merged = await loadPartial(dir);
    assert.equal(merged?.answers.length, 1);
    await onPhaseStart("deep-thought", dir, {
      ask: async (cards) => {
        assert.equal(cards.some((card) => card.id === "brand:logo"), false);
        assert.equal(cards.some((card) => card.id === "legal"), false);
        return [];
      },
      think: quietThink(),
    });
    assert.match(readText(path.join(hitch(dir), "BRAND.md")), /A brass wordmark, drawn once\./);
    assert.match(readText(path.join(hitch(dir), "SITE-BRIEF.md")), /Privacy and terms, both\./);
  } finally {
    cleanup(dir);
  }
});

test("jump stops the rest of the cards and skip does not count as answered", async () => {
  const dir = await project();
  try {
    writeInterview(dir, closedAnswers());
    writeApprovalFile(dir, approvals({ logo: false }));
    await onPhaseStart("babel-fish", dir, {
      ask: async (cards) => [reply(mustCard(cards[0]), "A brass wordmark, drawn once."), reply(mustCard(cards[1]), "jump", "jump")],
      think: quietThink(),
    });
    assert.match(readText(path.join(hitch(dir), "BRAND.md")), /A brass wordmark, drawn once\./);
    const brief = exists(path.join(hitch(dir), "SITE-BRIEF.md")) ? readText(path.join(hitch(dir), "SITE-BRIEF.md")) : "";
    assert.equal(brief.includes("## legal"), false);
    await onPhaseStart("babel-fish", dir, {
      ask: async (cards) => {
        assert.equal(cards.some((card) => card.id === "brand:logo"), false);
        assert.equal(cards[0]?.id, "legal");
        return [reply(mustCard(cards[0]), "", "skip")];
      },
      think: quietThink(),
    });
    await onPhaseStart("babel-fish", dir, {
      ask: async (cards) => {
        assert.equal(cards[0]?.id, "legal");
        return [];
      },
      think: quietThink(),
    });
  } finally {
    cleanup(dir);
  }
});

function exists(file: string): boolean {
  return existsSync(file);
}
