import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCard, type CardState } from "../src/card.ts";
import { mountDesk, type DeskEnv } from "../src/client/desk.ts";

/**
 * Suggest used to replace the question region's HTML, so the card node was gone
 * before the suggestion could be read. These tests keep that node.
 */

const SUGGESTION = "Yourself, or one named client.";

const opening = {
  question: {
    id: "DP-0.1",
    module: "towel-check",
    depth: ["deep"],
    ask: "Is this site for you, or for a client?",
    why: "The desk needs an answer.",
    input: ["text"],
    skipDefault: "For myself.",
    suggest: SUGGESTION,
    writes: ["PROJECT.md#audience"],
  },
  pushback: null,
  done: false,
  mapHtml: "",
  transcriptHtml: "",
  statusHtml: "",
};

const nextSession = {
  question: {
    id: "DP-0.2",
    module: "towel-check",
    depth: ["deep"],
    ask: "Have you built a website before?",
    why: "Prior sites set your level.",
    input: ["text"],
    skipDefault: "No prior site.",
    writes: ["PROJECT.md#prior-sites"],
  },
  pushback: null,
  done: false,
  mapHtml: "<p>map</p>",
  transcriptHtml: `<p data-suggest-option="tree">A grounded option.</p>`,
  statusHtml: "<span>Next.</span>",
  assumption: { kind: "suggested" as const, value: SUGGESTION },
};

test("a quiet card keeps the error slot out of the error treatment", () => {
  const quiet = renderCard(card());
  assert.match(quiet, /class="hh-qcard__error"/);
  assert.equal(quiet.includes("hh-error"), false);
  assert.equal(quiet.includes('role="alert"'), false);

  const failed = renderCard(
    card({
      error: "The suggestion did not save.",
      assumption: { kind: "suggested", value: SUGGESTION },
    }),
  );
  assert.match(failed, /class="hh-qcard__assumed" data-assumed="suggested">Assumed: Yourself, or one named client\./);
  assert.match(failed, /class="hh-error hh-qcard__error"[^>]*role="alert"/);
  assert.equal(failed.includes("hh-error hh-qcard__assumed"), false);
  assert.equal(failed.includes("hh-qcard__assumed hh-error"), false);
});

test("suggest keeps the same card, marks the text assumed, and answer reveals the next question", async () => {
  let release: (response: Response) => void = () => {};
  let suggestPosts = 0;
  let answerPosts = 0;
  const h = harness(async (input, init) => {
    const url = requestUrl(input);
    if (url === "/api/session") return Response.json(opening);
    if (url === "/api/suggest") {
      suggestPosts += 1;
      return new Promise((resolve) => {
        release = resolve;
      });
    }
    if (url === "/api/answer") {
      answerPosts += 1;
      assert.equal(String(init?.body ?? "").includes("DP-0.1"), true);
      return Response.json({ session: nextSession });
    }
    throw new Error(`unexpected ${url}`);
  });
  const stop = mountDesk(h.env);
  try {
    await settle();
    const article = h.region.querySelector("[data-question-id]");
    const field = h.region.querySelector("#hh-card-draft");
    assert.ok(article);
    assert.ok(field);
    assert.equal(article.getAttribute("data-question-id"), "DP-0.1");
    assert.equal(article.isConnected, true);

    h.fire("click", { target: h.region.querySelector('[data-action="suggest"]') });
    await settle();
    assert.equal(suggestPosts, 1);
    h.source.session(JSON.stringify(nextSession));

    assert.equal(article.isConnected, true);
    assert.equal(h.region.querySelector("[data-question-id]"), article);
    assert.equal(field.value, SUGGESTION);
    assert.equal(h.region.querySelector("[data-assumed='suggested']")?.textContent, `Assumed: ${SUGGESTION}`);
    assert.equal(h.region.querySelector("[data-card-error]")?.getAttribute("role"), null);
    assert.equal(h.region.querySelector("[data-card-error]")?.getAttribute("class")?.includes("hh-error"), false);
    assert.match(h.transcript.innerHTML, /data-suggest-option="tree"/);
    assert.equal(h.map.innerHTML, "");
    assert.equal(h.status.innerHTML, "");
    assert.equal(h.focused, 0);

    release(Response.json({ session: nextSession }));
    await settle();
    const answer = h.region.querySelector('[data-action="answer"]');
    assert.equal(answer?.disabled, false);
    assert.equal(answer?.getAttribute("disabled"), null);
    assert.equal(article.isConnected, true);
    assert.equal(h.focused, 0);

    field.value = "   ";
    h.fire("input", { target: field });
    h.fire("click", { target: answer });
    await settle();
    assert.equal(article.isConnected, true);
    assert.equal(field.value, "   ");
    assert.equal(h.region.querySelector("[data-card-error]")?.textContent, "Write an answer or skip.");
    assert.equal(h.region.querySelector("[data-card-error]")?.getAttribute("role"), "alert");
    assert.equal(orderOf(h.region, field, h.region.querySelector("[data-card-error]")), true);

    field.value = SUGGESTION;
    h.fire("input", { target: field });
    assert.equal(h.region.querySelector("[data-assumed='suggested']")?.textContent, `Assumed: ${SUGGESTION}`);
    h.fire("click", { target: h.region.querySelector('[data-action="answer"]') });
    await settle();
    assert.equal(answerPosts, 0);
    assert.equal(article.isConnected, false);
    assert.equal(h.region.querySelector("[data-question-id]")?.getAttribute("data-question-id"), "DP-0.2");
    assert.equal(h.focused, 1);
    assert.match(h.status.innerHTML, /Next\./);
  } finally {
    stop();
  }
});

test("an edited suggestion posts the original question and still leaves the card until the save returns", async () => {
  const bodies: string[] = [];
  let release: (response: Response) => void = () => {};
  const h = harness(async (input, init) => {
    const url = requestUrl(input);
    if (url === "/api/session") return Response.json(opening);
    if (url === "/api/suggest") return Response.json({ session: nextSession });
    if (url === "/api/answer") {
      bodies.push(String(init?.body ?? ""));
      return new Promise((resolve) => {
        release = resolve;
      });
    }
    throw new Error(`unexpected ${url}`);
  });
  const stop = mountDesk(h.env);
  try {
    await settle();
    const article = h.region.querySelector("[data-question-id]");
    const field = h.region.querySelector("#hh-card-draft");
    assert.ok(article);
    assert.ok(field);
    h.fire("click", { target: h.region.querySelector('[data-action="suggest"]') });
    await settle();
    field.value = `${SUGGESTION} Edited.`;
    h.fire("input", { target: field });
    assert.equal(h.region.querySelector("[data-assumed='suggested']"), null);
    assert.equal(article.isConnected, true);

    h.fire("click", { target: h.region.querySelector('[data-action="answer"]') });
    await settle();
    assert.equal(article.isConnected, true);
    assert.equal(field.value, `${SUGGESTION} Edited.`);
    assert.equal(h.region.querySelector("[data-question-id]"), article);

    release(Response.json({ session: nextSession }));
    await settle();
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0]?.includes("DP-0.1"), true);
    assert.equal(bodies[0]?.includes(`${SUGGESTION} Edited.`), true);
    assert.equal(article.isConnected, false);
    assert.equal(h.region.querySelector("[data-question-id]")?.getAttribute("data-question-id"), "DP-0.2");
  } finally {
    stop();
  }
});

test("a failed suggest keeps the draft and shows the error under the field", async () => {
  const h = harness(async (input) => {
    const url = requestUrl(input);
    if (url === "/api/session") return Response.json(opening);
    if (url === "/api/suggest") {
      return Response.json({ error: "The suggestion did not save." }, { status: 500 });
    }
    throw new Error(`unexpected ${url}`);
  });
  const stop = mountDesk(h.env);
  try {
    await settle();
    const article = h.region.querySelector("[data-question-id]");
    const field = h.region.querySelector("#hh-card-draft");
    assert.ok(article);
    assert.ok(field);
    field.value = "A shop for myself, still a draft.";
    h.fire("click", { target: h.region.querySelector('[data-action="suggest"]') });
    await settle();
    const errorNode = h.region.querySelector("[data-card-error]");
    assert.equal(article.isConnected, true);
    assert.equal(h.region.querySelector("[data-question-id]"), article);
    assert.equal(field.value, "A shop for myself, still a draft.");
    assert.equal(errorNode?.textContent, "The suggestion did not save.");
    assert.equal(errorNode?.getAttribute("role"), "alert");
    assert.equal(errorNode?.getAttribute("class"), "hh-error hh-qcard__error");
    assert.equal(orderOf(h.region, field, errorNode), true);
    assert.equal(h.focused, 0);
    assert.equal(h.region.querySelector("[data-assumed='suggested']"), null);
  } finally {
    stop();
  }
});

function card(overrides: Partial<CardState> = {}): CardState {
  return {
    question: {
      id: "DP-0.1",
      module: "towel-check",
      depth: ["deep"],
      ask: "Is this site for you, or for a client?",
      why: "The desk needs an answer.",
      input: ["text"],
      skipDefault: "For myself.",
      suggest: SUGGESTION,
      writes: ["PROJECT.md#audience"],
    },
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
    ...overrides,
  };
}

function orderOf(root: MiniEl, earlier: MiniEl | null, later: MiniEl | null): boolean {
  if (earlier === null || later === null) return false;
  const list = root.descendants();
  return list.indexOf(earlier) >= 0 && list.indexOf(earlier) < list.indexOf(later);
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

async function settle(): Promise<void> {
  for (let step = 0; step < 8; step += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

class RecordingSource {
  listeners = new Map<string, (event?: { data: string }) => void>();
  addEventListener(type: string, listener: (event?: { data: string }) => void): void {
    this.listeners.set(type, listener);
  }
  close(): void {}
  session(data: string): void {
    this.listeners.get("session")?.({ data });
  }
}

function harness(fetchImpl: DeskEnv["fetch"]): {
  env: DeskEnv;
  region: MiniEl;
  transcript: MiniEl;
  map: MiniEl;
  status: MiniEl;
  source: RecordingSource;
  focused: number;
  fire(type: string, event: { target: MiniEl | null }): void;
} {
  let focused = 0;
  const region = element("section", () => {
    focused += 1;
  });
  region.setAttribute("data-region", "question");
  const transcript = element("section", () => {
    focused += 1;
  });
  transcript.setAttribute("data-region", "transcript");
  const map = element("section", () => {
    focused += 1;
  });
  map.setAttribute("data-region", "map");
  const status = element("section", () => {
    focused += 1;
  });
  status.setAttribute("data-region", "status");
  const live = element("p", () => {
    focused += 1;
  });
  live.setAttribute("data-guide-live", "");
  const meta = element("meta", () => {
    focused += 1;
  });
  meta.setAttribute("name", "hh-csrf");
  meta.setAttribute("content", "csrf-token");
  const doc = element("div", () => {
    focused += 1;
  });
  doc.rooted = true;
  doc.append(meta, region, map, transcript, status, live);

  const listeners = new Map<string, Array<(event: { target: MiniEl | null; preventDefault(): void }) => void>>();
  const document = {
    querySelector: (selector: string) => doc.querySelector(selector),
    addEventListener(type: string, listener: (event: { target: MiniEl | null; preventDefault(): void }) => void) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener(type: string, listener: (event: { target: MiniEl | null; preventDefault(): void }) => void) {
      const list = listeners.get(type) ?? [];
      listeners.set(
        type,
        list.filter((item) => item !== listener),
      );
    },
  };
  const source = new RecordingSource();
  const env = {
    document,
    EventSource: class {
      constructor() {
        return source;
      }
    },
    fetch: fetchImpl,
  } as unknown as DeskEnv;
  return {
    env,
    region,
    transcript,
    map,
    status,
    source,
    get focused() {
      return focused;
    },
    fire(type, event) {
      for (const listener of listeners.get(type) ?? []) {
        listener({ preventDefault() {}, ...event });
      }
    },
  };
}

class MiniEl {
  readonly tag: string;
  readonly children: MiniEl[] = [];
  parentElement: MiniEl | null = null;
  value: string | undefined;
  disabled = false;
  rooted = false;
  private readonly attrs = new Map<string, string>();
  private readonly onFocus: () => void;

  constructor(tag: string, onFocus: () => void) {
    this.tag = tag;
    this.onFocus = onFocus;
  }

  get isConnected(): boolean {
    let node: MiniEl | null = this;
    const seen = new Set<MiniEl>();
    while (node !== null && !seen.has(node)) {
      if (node.rooted) return true;
      seen.add(node);
      node = node.parentElement;
    }
    return false;
  }

  get textContent(): string {
    if (this.tag === "#text") return this.attrs.get("#text") ?? "";
    return this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.children.splice(0, this.children.length);
    if (value !== "") {
      const text = new MiniEl("#text", this.onFocus);
      text.attrs.set("#text", value);
      this.append(text);
    }
    if (this.tag === "textarea" || this.tag === "input") this.value = value;
  }

  get innerHTML(): string {
    return this.children.map((child) => child.serialize()).join("");
  }

  set innerHTML(value: string) {
    for (const child of this.children) child.parentElement = null;
    this.children.splice(0, this.children.length);
    for (const child of parseHtml(value, this.onFocus)) this.append(child);
  }

  getAttribute(name: string): string | null {
    return this.attrs.has(name) ? (this.attrs.get(name) ?? "") : null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
    if (name === "disabled") this.disabled = true;
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name);
    if (name === "disabled") this.disabled = false;
  }

  querySelector(selector: string): MiniEl | null {
    for (const child of this.descendants()) {
      if (child.matches(selector)) return child;
    }
    return null;
  }

  descendants(): MiniEl[] {
    const found: MiniEl[] = [];
    for (const child of this.children) {
      if (child.tag === "#text") continue;
      found.push(child, ...child.descendants());
    }
    return found;
  }

  append(...nodes: MiniEl[]): void {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }

  insertAdjacentHTML(position: "beforebegin" | "afterbegin" | "beforeend" | "afterend", html: string): void {
    const nodes = parseHtml(html, this.onFocus);
    if (position === "beforeend") {
      this.append(...nodes);
      return;
    }
    if (position === "afterbegin") {
      for (const node of nodes) node.parentElement = this;
      this.children.unshift(...nodes);
      return;
    }
    const parent = this.parentElement;
    if (parent === null) return;
    const index = parent.children.indexOf(this);
    const at = position === "beforebegin" ? index : index + 1;
    for (const node of nodes) node.parentElement = parent;
    parent.children.splice(at, 0, ...nodes);
  }

  focus(): void {
    this.onFocus();
  }

  matches(selector: string): boolean {
    let rest = selector.trim();
    const tag = /^[a-zA-Z][\w-]*/.exec(rest);
    if (tag !== null) {
      if (this.tag !== tag[0].toLowerCase()) return false;
      rest = rest.slice(tag[0].length);
    }
    while (rest !== "") {
      if (rest.startsWith("#")) {
        const id = /^#([^\s#.[\]]+)/.exec(rest);
        if (id === null || this.getAttribute("id") !== id[1]) return false;
        rest = rest.slice(id[0].length);
        continue;
      }
      if (rest.startsWith(".")) {
        const cls = /^\.([^\s#.[\]]+)/.exec(rest);
        if (cls === null) return false;
        const classes = (this.getAttribute("class") ?? "").split(/\s+/);
        if (!classes.includes(cls[1] ?? "")) return false;
        rest = rest.slice(cls[0].length);
        continue;
      }
      if (rest.startsWith("[")) {
        const attr = /^\[([^\s\]=~|^$*]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?\]/.exec(rest);
        if (attr === null) return false;
        const actual = this.getAttribute(attr[1] ?? "");
        const expected = attr[2] ?? attr[3];
        if (expected === undefined) {
          if (actual === null) return false;
        } else if (actual !== decode(expected)) return false;
        rest = rest.slice(attr[0].length);
        continue;
      }
      return false;
    }
    return true;
  }

  private serialize(): string {
    if (this.tag === "#text") return escapeText(this.textContent);
    const attrs = [...this.attrs].map(([name, value]) => ` ${name}="${escapeText(value)}"`).join("");
    return `<${this.tag}${attrs}>${this.innerHTML}</${this.tag}>`;
  }
}

function element(tag: string, onFocus: () => void): MiniEl {
  return new MiniEl(tag, onFocus);
}

function parseHtml(html: string, onFocus: () => void): MiniEl[] {
  const roots: MiniEl[] = [];
  const stack: MiniEl[] = [];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)\s*([^>]*?)(\/?)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (match[1] !== undefined) {
      const tag = match[1].toLowerCase();
      while (stack.length > 0 && stack[stack.length - 1]?.tag !== tag) stack.pop();
      stack.pop();
      continue;
    }
    if (match[5] !== undefined) {
      const text = decode(match[5]);
      if (text === "") continue;
      const node = new MiniEl("#text", onFocus);
      node.attrs.set("#text", text);
      const parent = stack[stack.length - 1];
      if (parent !== undefined) parent.append(node);
      continue;
    }
    const tag = (match[2] ?? "").toLowerCase();
    const node = new MiniEl(tag, onFocus);
    for (const [name, value] of parseAttrs(match[3] ?? "")) {
      node.setAttribute(name, value);
    }
    if ((tag === "textarea" || tag === "input") && node.getAttribute("disabled") !== null) node.disabled = true;
    const parent = stack[stack.length - 1];
    if (parent !== undefined) parent.append(node);
    else roots.push(node);
    const self = match[4] === "/" || tag === "input" || tag === "br" || tag === "img" || tag === "meta";
    if (!self) stack.push(node);
  }
  for (const node of roots) sealControls(node);
  return roots;
}

function sealControls(node: MiniEl): void {
  if (node.tag === "textarea" || node.tag === "input") node.value = node.textContent;
  if (node.getAttribute("disabled") !== null) node.disabled = true;
  for (const child of node.children) {
    if (child.tag !== "#text") sealControls(child);
  }
}

function parseAttrs(raw: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const name = match[1];
    if (name === undefined || name === "/" || name === "") continue;
    attrs.set(name, decode(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attrs;
}

function decode(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
