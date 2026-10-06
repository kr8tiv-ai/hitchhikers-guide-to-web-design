import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  MISSING_PROMPT,
  chooseShortlist,
  dealRound,
  draftThread,
  emptyWalk,
  loveCount,
  nextRound,
  parseWalkState,
  recordVerdict,
  writeReferences,
  type GalleryEntry,
  type WalkState,
} from "../src/index.ts";

const sourcePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "gallery-walk.ts",
);

function entry(over: Partial<GalleryEntry> = {}): GalleryEntry {
  return {
    name: "Example",
    url: "https://example.com/one",
    source: "godly",
    industry: "saas",
    styleWorld: "editorial",
    motionLevel: 4,
    award: "none",
    noted: "Look at the fixture, not the chrome.",
    ...over,
  };
}

function balanced(perSource: number, styleWorld = "editorial", industry = "saas"): GalleryEntry[] {
  const entries: GalleryEntry[] = [];
  for (const source of ["godly", "awwwards"] as const) {
    for (let index = 0; index < perSource; index += 1) {
      entries.push(
        entry({
          name: `${source} ${styleWorld} ${index}`,
          url: `https://example.com/${source}/${styleWorld}/${industry}/${index}`,
          source,
          styleWorld,
          industry,
        }),
      );
    }
  }
  return entries;
}

function verdictAll(state: WalkState, cards: readonly GalleryEntry[], why = ""): WalkState {
  let next = state;
  for (const card of cards) {
    next = recordVerdict(next, { url: card.url, verdict: "meh", why });
  }
  return next;
}

test("the walk calls the 029 picker and does not import the crawler", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /function suggestReferences/);
  assert.match(source, /return referenceCards\(entries, q\)/);
  assert.match(source, /suggestReferences\(pack,/);
  assert.equal(source.includes("@hitchhiker/crawler"), false);
});

test("nextRound returns two Godly and two Awwwards and does not mutate", () => {
  const pack = balanced(3);
  const frozen = pack.map((item) => Object.freeze({ ...item }));
  Object.freeze(frozen);
  const state = emptyWalk();
  const before = structuredClone(state);
  const packBefore = structuredClone(frozen);
  const round = nextRound(state, frozen, {});
  assert.equal(round.length, 4);
  assert.equal(round.filter((item) => item.source === "godly").length, 2);
  assert.equal(round.filter((item) => item.source === "awwwards").length, 2);
  assert.deepEqual(state, before);
  assert.deepEqual(frozen, packBefore);
});

test("a later round excludes urls already seen", () => {
  const pack = balanced(4);
  const first = dealRound(emptyWalk(), pack, {});
  assert.equal(first.cards.length, 4);
  const voted = verdictAll(first.state, first.cards);
  const second = nextRound(voted, pack, {});
  assert.equal(second.length, 4);
  for (const card of second) {
    assert.equal(
      first.cards.some((item) => item.url === card.url),
      false,
    );
  }
});

test("an empty love or hate is nudged once, then a blank is allowed", () => {
  const deal = dealRound(emptyWalk(), balanced(2), {});
  const card = deal.cards[0];
  assert.ok(card);
  const premature = recordVerdict(deal.state, {
    url: card.url,
    verdict: "love",
    why: "",
    allowBlank: true,
  });
  assert.equal(premature.verdicts.length, 0);
  assert.deepEqual(premature.nudge, { url: card.url, verdict: "love" });

  const nudged = recordVerdict(deal.state, { url: card.url, verdict: "love", why: "  " });
  assert.equal(nudged.verdicts.length, 0);
  const stillHeld = recordVerdict(nudged, { url: card.url, verdict: "love", why: "" });
  assert.equal(stillHeld.verdicts.length, 0);

  const stored = recordVerdict(nudged, {
    url: card.url,
    verdict: "love",
    why: "",
    allowBlank: true,
  });
  assert.equal(stored.verdicts.length, 1);
  assert.equal(stored.verdicts[0]?.why, "");
  assert.equal(stored.nudge, null);

  const hateCard = deal.cards[1];
  assert.ok(hateCard);
  const hateNudge = recordVerdict(stored, { url: hateCard.url, verdict: "hate", why: "" });
  assert.equal(hateNudge.verdicts.length, 1);
  assert.deepEqual(hateNudge.nudge, { url: hateCard.url, verdict: "hate" });
  const hated = recordVerdict(hateNudge, {
    url: hateCard.url,
    verdict: "hate",
    why: "The motion shouts.",
  });
  assert.equal(hated.verdicts.at(-1)?.why, "The motion shouts.");

  const meh = deal.cards[2];
  assert.ok(meh);
  const mehState = recordVerdict(hated, { url: meh.url, verdict: "meh", why: "" });
  assert.equal(mehState.verdicts.at(-1)?.verdict, "meh");
  assert.equal(mehState.nudge, null);
});

test("ten loves move the walk to narrowing", () => {
  const pack = balanced(8);
  let state = emptyWalk();
  let loves = 0;
  while (loves < 10) {
    const deal = dealRound(state, pack, {});
    assert.ok(deal.cards.length >= 2);
    state = deal.state;
    for (const card of deal.cards) {
      if (loves >= 10 || state.phase !== "walking") break;
      state = recordVerdict(state, { url: card.url, verdict: "love", why: `Keep ${card.name}` });
      loves += 1;
      if (state.phase === "narrowing") break;
    }
  }
  assert.equal(loves, 10);
  assert.equal(loveCount(state), 10);
  assert.equal(state.phase, "narrowing");
  assert.equal(state.missingPrompt, null);
  assert.deepEqual(nextRound(state, pack, {}), []);
});

test("six rounds with no love move to narrowing and ask what was missing", () => {
  const pack = balanced(12);
  let state = emptyWalk();
  for (let round = 0; round < 6; round += 1) {
    const deal = dealRound(state, pack, {});
    assert.equal(deal.state.phase, "walking");
    assert.equal(deal.cards.length, 4);
    assert.equal(deal.cards.filter((card) => card.source === "godly").length, 2);
    assert.equal(deal.cards.filter((card) => card.source === "awwwards").length, 2);
    state = verdictAll(deal.state, deal.cards);
  }
  assert.equal(state.round, 6);
  assert.equal(state.phase, "narrowing");
  assert.equal(loveCount(state), 0);
  assert.equal(state.missingPrompt, MISSING_PROMPT);
  assert.deepEqual(nextRound(state, pack, {}), []);
  assert.deepEqual(dealRound(state, pack, {}).cards, []);
});

test("a short match is filled from the nearest style world and says so", () => {
  const pack = [
    entry({ url: "https://example.com/e/g", source: "godly", styleWorld: "editorial" }),
    entry({ url: "https://example.com/e/a", source: "awwwards", styleWorld: "editorial" }),
    entry({ url: "https://example.com/d/g", source: "godly", styleWorld: "3d-world" }),
    entry({ url: "https://example.com/d/a", source: "awwwards", styleWorld: "3d-world" }),
    entry({ url: "https://example.com/p/g", source: "godly", styleWorld: "playful" }),
    entry({ url: "https://example.com/p/a", source: "awwwards", styleWorld: "playful" }),
  ];
  const deal = dealRound(emptyWalk(), pack, { industry: "saas", styleWorld: "editorial" });
  assert.equal(deal.cards.length, 4);
  assert.equal(deal.cards.some((card) => card.styleWorld === "playful"), false);
  assert.equal(
    deal.cards.filter((card) => card.styleWorld === "3d-world").length,
    2,
  );
  assert.match(deal.state.fillNote ?? "", /Fewer than four/);
  assert.match(deal.state.fillNote ?? "", /3d-world/);
});

test("a thin industry is filled from the wider pack", () => {
  const pack = [
    entry({ url: "https://example.com/s/g", source: "godly", industry: "saas" }),
    entry({ url: "https://example.com/s/a", source: "awwwards", industry: "saas" }),
    entry({ url: "https://example.com/f/g", source: "godly", industry: "fashion" }),
    entry({ url: "https://example.com/f/a", source: "awwwards", industry: "fashion" }),
  ];
  const deal = dealRound(emptyWalk(), pack, { industry: "saas" });
  assert.equal(deal.cards.length, 4);
  assert.match(deal.state.fillNote ?? "", /wider pack/);
});

test("aura.build is included when the pack lists it", () => {
  const pack = [
    ...balanced(2),
    entry({
      name: "Aura plate",
      url: "https://www.aura.build/plates/one",
      source: "other",
      styleWorld: "editorial",
      industry: "saas",
    }),
  ];
  const deal = dealRound(emptyWalk(), pack, { industry: "saas", styleWorld: "editorial" });
  assert.equal(deal.cards.filter((card) => card.source === "godly").length, 2);
  assert.equal(deal.cards.filter((card) => card.source === "awwwards").length, 2);
  assert.equal(
    deal.cards.some((card) => card.url === "https://www.aura.build/plates/one"),
    true,
  );
  assert.match(deal.state.fillNote ?? "", /aura\.build/);
});

test("writeReferences writes three site files and an index with the thread", async () => {
  const pack = balanced(2);
  let state = dealRound(emptyWalk(), pack, {}).state;
  const loved = pack.slice(0, 3);
  for (const card of loved) {
    state = {
      ...state,
      seen: state.seen.includes(card.url) ? state.seen : [...state.seen, card.url],
    };
    state = recordVerdict(state, { url: card.url, verdict: "love", why: `Why ${card.name}` });
  }
  state = { ...state, phase: "narrowing" };
  state = chooseShortlist(
    state,
    loved.map((card) => card.url),
  );
  assert.equal(state.shortlistError, null);
  assert.deepEqual(
    state.shortlist,
    loved.map((card) => card.url),
  );

  const dir = await mkdtemp(path.join(tmpdir(), "hh-refs-"));
  try {
    const thread = "Quiet type and one gesture.";
    const written = await writeReferences(dir, state, pack, thread);
    assert.equal(written.length, 4);
    const index = written.find((file) => path.basename(file) === "INDEX.md");
    assert.ok(index);
    assert.equal(index.startsWith(path.join(dir, ".hitchhiker", "references")), true);
    const indexBody = await readFile(index, "utf8");
    assert.match(indexBody, /Quiet type and one gesture\./);
    assert.match(indexBody, /Babel Fish and Deep Thought/);
    const sites = written.filter((file) => path.basename(file) !== "INDEX.md");
    assert.equal(sites.length, 3);
    for (const file of sites) {
      const body = await readFile(file, "utf8");
      assert.match(body, /## Why/);
      assert.match(body, /Why /);
      assert.equal(body.includes("!["), false);
      assert.equal(body.includes("https://example.com/"), true);
    }
    assert.match(draftThread(state, pack), /Why /);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("two loves are not enough for a shortlist when ten are available", () => {
  const pack = balanced(6);
  let state = emptyWalk();
  const deal = dealRound(state, pack, {});
  state = deal.state;
  const cards = deal.cards;
  assert.ok(cards.length >= 4);
  for (const card of cards) {
    state = recordVerdict(state, { url: card.url, verdict: "love", why: `Keep ${card.name}` });
  }
  const again = dealRound(state, pack, {});
  state = again.state;
  for (const card of again.cards) {
    state = recordVerdict(state, { url: card.url, verdict: "love", why: `Keep ${card.name}` });
  }
  assert.ok(loveCount(state) >= 4);
  state = state.phase === "narrowing" ? state : { ...state, phase: "narrowing" };
  const rejected = chooseShortlist(state, state.verdicts.slice(0, 2).map((item) => item.url));
  assert.equal(rejected.shortlist.length, 0);
  assert.match(rejected.shortlistError ?? "", /3 to 5/);
});

test("parseWalkState rejects a broken file and accepts an empty walk", () => {
  assert.equal(parseWalkState(null), null);
  assert.equal(parseWalkState({ phase: "walking" }), null);
  const parsed = parseWalkState(emptyWalk());
  assert.deepEqual(parsed, emptyWalk());
});
