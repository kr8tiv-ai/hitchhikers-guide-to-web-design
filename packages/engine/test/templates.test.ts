import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  TemplateError,
  listSpineTemplates,
  renderTemplate,
} from "../src/templates.ts";
import type { SpineTemplateName } from "../src/templates.ts";

const engineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const EXPECTED: readonly SpineTemplateName[] = [
  "project",
  "requirements",
  "roadmap",
  "state",
  "config",
  "context",
  "phase-prompt",
  "summary",
  "verification-report",
  "spec",
];

function localDate(): string {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fileFor(name: SpineTemplateName): string {
  return name === "config" ? "config.json" : `${name}.md`;
}

function readTemplate(name: SpineTemplateName): string {
  return readFileSync(
    path.join(engineRoot, "templates", "gsd", fileFor(name)),
    "utf8",
  );
}

test("listSpineTemplates returns the ten spine files with attribution", () => {
  const names = listSpineTemplates(engineRoot);
  assert.deepEqual(names, EXPECTED);
  assert.equal(names.length, 10);

  for (const name of names) {
    const raw = readTemplate(name);
    assert.equal(raw.includes("\r"), false);
    const first = raw.split("\n")[0] ?? "";
    assert.match(first, /Adapted from vendor\/gsd-core/);
    assert.match(first, /13d37238ba08377929e4850fd6ae4b8db49a22ca/);
  }
});

test("renderTemplate fills project and state and strips host wording", () => {
  const date = localDate();
  const vars = { project_name: "Towel & Tea", date };
  const project = renderTemplate("project", vars);
  const state = renderTemplate("state", vars);
  const roadmap = renderTemplate("roadmap", {});

  assert.match(project, /Towel & Tea/);
  assert.match(state, /Towel & Tea/);
  assert.match(project, new RegExp(date));
  assert.match(state, new RegExp(date));
  assert.equal(project.includes("{{"), false);
  assert.equal(state.includes("{{"), false);

  assert.match(roadmap, /## Overview/);
  assert.match(roadmap, /## Phases/);
  assert.match(roadmap, /## Phase Details/);
  assert.match(roadmap, /## Progress/);
  assert.match(roadmap, /\*\*Goal\*\*/);
  assert.match(roadmap, /\*\*Depends on\*\*/);
  assert.match(roadmap, /\*\*Requirements\*\*/);
  assert.match(roadmap, /\*\*Success Criteria\*\*/);
  assert.match(roadmap, /\*\*Plans\*\*/);
  assert.match(
    roadmap,
    /\| Phase \| Plans Complete \| Status \| Completed \|/,
  );

  for (const rendered of [project, state, roadmap]) {
    assert.equal(rendered.includes(".planning"), false);
    assert.equal(rendered.includes("Claude Code"), false);
    assert.equal(/copilot/i.test(rendered), false);
    assert.equal(rendered.includes("Claude"), false);
  }
});

test("a template with no tokens still renders", () => {
  const requirements = renderTemplate("requirements", {});
  const config = renderTemplate("config", {});
  assert.match(requirements, /# Requirements Template/);
  assert.equal(requirements.includes("{{"), false);
  assert.match(config, /"sessionIdMode": "unknown"/);
  const jsonStart = config.indexOf("{");
  assert.ok(jsonStart >= 0);
  const parsed: unknown = JSON.parse(config.slice(jsonStart));
  assert.equal(
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed),
    true,
  );
  const record = parsed as Record<string, unknown>;
  assert.equal(record.sessionIdMode, "unknown");
  assert.equal(record.model, null);
  assert.deepEqual(record.budgets, {});
  assert.deepEqual(record.gates, {});
});

test("a missing variable throws and does not return the token", () => {
  assert.throws(
    () => renderTemplate("project", { date: localDate() }),
    (error: unknown) => {
      assert.ok(error instanceof TemplateError);
      assert.match(error.message, /\{\{project_name\}\}/);
      return true;
    },
  );
});

test("a token introduced by a value throws", () => {
  assert.throws(
    () =>
      renderTemplate("state", {
        project_name: "{{injected}}",
        date: localDate(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof TemplateError);
      assert.match(error.message, /\{\{injected\}\}/);
      return true;
    },
  );
});

test("every spine file is free of host paths and Claude slash commands", () => {
  for (const name of EXPECTED) {
    const vars =
      name === "project" || name === "state"
        ? { project_name: "Towel & Tea", date: localDate() }
        : {};
    const rendered = renderTemplate(name, vars);
    assert.equal(rendered.includes(".planning"), false, name);
    assert.equal(rendered.includes("Claude Code"), false, name);
    assert.equal(rendered.includes("Claude"), false, name);
    assert.equal(/copilot/i.test(rendered), false, name);
    assert.equal(rendered.includes("~/.claude"), false, name);
    assert.equal(/(^|[^A-Za-z])\/gsd[:-]/.test(rendered), false, name);
  }
});
