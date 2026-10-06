import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PersonaError, assertPersonaSafe, buildSystemPrompt } from "../src/persona.ts";
import { loadTree, type Question } from "../src/tree.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const skillPath = path.resolve(
  here,
  "..",
  "..",
  "grok-plugin",
  "skills",
  "guide-persona",
  "SKILL.md",
);
const treeFile = path.resolve(here, "..", "..", "..", "interview", "tree.yaml");
const engineSrc = path.resolve(here, "..", "src");
const enginePackage = path.resolve(here, "..", "package.json");

const EXPRESS_LINE =
  "This is Express. Ask only this question, then move on. Do not open a side lesson.";

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

function questionDp21(): Question {
  const found = loadTree(treeFile).find((item) => item.id === "DP-2.1");
  assert.ok(found, "DP-2.1 is in the tree");
  return found;
}

function walkTypeScript(dir: string, into: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTypeScript(full, into);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      into.push(full);
    }
  }
}

test("the skill is under 800 words and has no effort frontmatter", () => {
  const skill = readFileSync(skillPath, "utf8");
  const words = wordCount(skill);
  assert.ok(words < 800, `skill is ${words} words`);
  assert.equal(skill.toLowerCase().includes("effort"), false);
  assert.match(skill, /^name: guide-persona$/m);
  assert.match(skill, /^description: /m);
  assert.match(skill, /^when-to-use: /m);
  assert.doesNotThrow(() => assertPersonaSafe(skill));
});

test("DP-2.1 prompt carries the tree id, the ask, and Answer, Suggest, Skip", () => {
  const question = questionDp21();
  const prompt = buildSystemPrompt(skillPath, {
    question,
    depth: "standard",
    coverageLine: "none yet",
  });
  assert.ok(prompt.includes("Current question id:"));
  assert.ok(prompt.includes(question.id));
  assert.ok(prompt.includes(`Ask: ${question.ask}`));
  assert.ok(prompt.includes("Answer"));
  assert.ok(prompt.includes("Suggest"));
  assert.ok(prompt.includes("Skip"));
  assert.ok(prompt.includes("Suggest for me"));
  assert.ok(prompt.includes("Depth: standard"));
  assert.ok(prompt.includes("Coverage: none yet"));
  assert.equal(prompt.includes(EXPRESS_LINE), false);
});

test("Express adds one line and Deep does not", () => {
  const question = questionDp21();
  const express = buildSystemPrompt(skillPath, {
    question,
    depth: "express",
    coverageLine: "none yet",
  });
  const deep = buildSystemPrompt(skillPath, {
    question,
    depth: "deep",
    coverageLine: "none yet",
  });
  assert.ok(express.includes(EXPRESS_LINE));
  assert.equal(deep.includes(EXPRESS_LINE), false);
  assert.ok(express.includes("Depth: express"));
});

test("a diagnosis joke and an exclamation mark are refused", () => {
  const diagnosisJoke = "What a funny autism moment. You must love spreadsheets.";
  assert.throws(
    () => assertPersonaSafe(diagnosisJoke),
    (error: unknown) => {
      assert.ok(error instanceof PersonaError);
      assert.equal(error.reason, "autism");
      return true;
    },
  );
  assert.throws(
    () => assertPersonaSafe("Lovely work!"),
    (error: unknown) => {
      assert.ok(error instanceof PersonaError);
      assert.equal(error.reason, "exclamation mark");
      return true;
    },
  );
});

test("spectrum, an em dash, and a third Don't Panic are refused", () => {
  assert.throws(() => assertPersonaSafe("We serve a broad spectrum of clients."), PersonaError);
  assert.throws(() => assertPersonaSafe("Calm \u2014 then loud."), (error: unknown) => {
    assert.ok(error instanceof PersonaError);
    assert.equal(error.reason, "em dash");
    return true;
  });
  for (const token of ["autistic", "asperger", "disorder"]) {
    assert.throws(() => assertPersonaSafe(`A joke about ${token} is refused.`), PersonaError);
  }
  assert.throws(() => assertPersonaSafe("AUTISM"), PersonaError);
  assert.doesNotThrow(() => assertPersonaSafe("Don't Panic."));
  assert.doesNotThrow(() => assertPersonaSafe("Don't Panic. Don't Panic."));
  assert.throws(() => assertPersonaSafe("Don't Panic. Don't Panic. Don't Panic."), (error: unknown) => {
    assert.ok(error instanceof PersonaError);
    assert.equal(error.reason, "Don't Panic");
    return true;
  });
});

test("an unsafe coverage line is refused on the built prompt", () => {
  const question = questionDp21();
  assert.throws(
    () =>
      buildSystemPrompt(skillPath, {
        question,
        depth: "standard",
        coverageLine: "held \u2014 soft",
      }),
    (error: unknown) => {
      assert.ok(error instanceof PersonaError);
      assert.equal(error.reason, "em dash");
      return true;
    },
  );
});

test("a missing skill path throws", () => {
  const question = questionDp21();
  const missing = path.join(os.tmpdir(), "hh-persona-missing", "SKILL.md");
  assert.equal(existsSync(missing), false);
  assert.throws(
    () => buildSystemPrompt(missing, { question, depth: "standard", coverageLine: "none yet" }),
    PersonaError,
  );
});

test("the skill states text only, SuperGrok, and the curated pack", () => {
  const skill = readFileSync(skillPath, "utf8");
  assert.ok(skill.includes("text-to-speech"));
  assert.ok(skill.includes("voice performance"));
  assert.ok(skill.includes("SuperGrok"));
  assert.ok(skill.includes("API key"));
  assert.ok(skill.includes("Godly"));
  assert.ok(skill.includes("Awwwards"));
  assert.ok(skill.includes("curated pack"));
  assert.ok(skill.includes("not a live scrape"));
  assert.ok(skill.includes("happy with this?"));
  assert.ok(skill.includes("2026-modern, mid-century-modern, or Tron-modern?"));
  assert.ok(skill.includes("you said calm four times and sent three neon sites"));
  assert.ok(skill.includes("Here is what I heard"));
  assert.ok(skill.includes("mark the moment as soft"));
});

test("engine source does not import grok-plugin", () => {
  const forbidden = ["@hitchhiker", "grok-plugin"].join("/");
  const files: string[] = [];
  walkTypeScript(engineSrc, files);
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      if (!line.includes(forbidden)) continue;
      const trimmed = line.trim();
      const isImport =
        trimmed.startsWith("import ") ||
        trimmed.includes(" from ") ||
        trimmed.includes("import(") ||
        trimmed.includes("require(");
      assert.equal(isImport, false, file);
    }
  }
  const pkg = JSON.parse(readFileSync(enginePackage, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const deps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.peerDependencies ?? {}),
  };
  assert.equal(Object.hasOwn(deps, forbidden), false);
});
