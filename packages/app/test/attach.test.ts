import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadTree, type Question } from "@hitchhiker/engine";
import { renderCard, type CardState } from "../src/card.ts";
import {
  MAX_ATTACH_FILES,
  MAX_ATTACH_LINKS,
  MAX_UPLOAD_BYTES,
  QUESTION_ATTACH,
  addedFilesMessage,
  addedLinksMessage,
  answerWithAttachments,
  attachmentLine,
  bytesAllowed,
  collectLinks,
  collisionName,
  fileCapError,
  kindsFor,
  linkCapError,
  normalizeUrl,
  pastedImageName,
  removedMessage,
  sanitizeUploadName,
  shortcutTarget,
  textIsOnlyLinks,
  typeError,
  urisFromList,
  validateFileMeta,
  zoneCopy,
  type AttachKind,
} from "../src/client/attach.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const treeFile = path.resolve(here, "..", "..", "..", "interview", "tree.yaml");

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"];

function kindsOf(text: string, upload: boolean): AttachKind[] {
  let links = false;
  let images = false;
  let files = upload;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (
      /\bURLs?\b/.test(line) ||
      /\bboard link\b/i.test(line) ||
      /\btheir sites\b/i.test(line) ||
      /\bsites you love\b/i.test(line) ||
      /\baward sites\b/i.test(line) ||
      /\blinks all work\b/i.test(line)
    ) {
      links = true;
    }
    if (!/^(?:Imagery|Pictures)\s*:/.test(line)) {
      if (
        /\blogos?\b/i.test(line) ||
        /\bphotos?\b/i.test(line) ||
        /\bscreenshots\b/i.test(line) ||
        /\bimages\b/i.test(line) ||
        /\bpictures\b/i.test(line)
      ) {
        images = true;
      }
    }
    if (/\bPDFs?\b/.test(line) || /\ban upload\b/i.test(line)) files = true;
  }
  const kinds: AttachKind[] = [];
  if (images) kinds.push("images");
  if (files) kinds.push("files");
  if (links) kinds.push("links");
  return kinds;
}

function expectedFromBank(questions: Question[]): Map<string, AttachKind[]> {
  const found = new Map<string, AttachKind[]>();
  for (const question of questions) {
    const parent = kindsOf(
      `${question.ask}\n${question.suggest ?? ""}`,
      question.input.includes("upload"),
    );
    if (parent.length > 0) found.set(question.id, parent);
    for (const follow of question.followUps ?? []) {
      const nested = kindsOf(follow.ask, false);
      if (nested.length > 0) found.set(follow.id, nested);
    }
  }
  return found;
}

function sameKinds(left: readonly AttachKind[], right: readonly AttachKind[]): boolean {
  return [...left].sort().join(",") === [...right].sort().join(",");
}

test("the question map matches the bank and nothing else", () => {
  const bank = expectedFromBank(loadTree(treeFile));
  const mapped = new Map(Object.entries(QUESTION_ATTACH));
  const missing = [...bank.keys()].filter((id) => !mapped.has(id));
  const extra = [...mapped.keys()].filter((id) => !bank.has(id));
  assert.deepEqual(missing, []);
  assert.deepEqual(extra, []);
  for (const [id, kinds] of bank) {
    assert.equal(sameKinds(kinds, mapped.get(id) ?? []), true, id);
  }
  assert.equal(kindsFor("DP-0.1"), null);
  assert.equal(kindsFor("DP-2.1"), null);
  assert.equal(kindsFor("DP-5.4"), null);
  assert.equal(kindsFor("DP-5.6"), null);
  assert.equal(kindsFor("DP-7.3"), null);
});

test("a website question and a logo or photo question show a drop zone and an Attach button", () => {
  const questions = loadTree(treeFile);
  const website = questions.find((item) => item.id === "DP-0.2");
  const logo = questions.find((item) => item.id === "DP-1.1");
  const photo = questions.find((item) => item.id === "DP-1.4");
  const plain = questions.find((item) => item.id === "DP-0.1");
  assert.ok(website && logo && photo && plain);

  const siteHtml = renderCard(cardState(website));
  assert.match(siteHtml, /data-attach-zone/);
  assert.match(siteHtml, /data-attach-button/);
  assert.match(siteHtml, />Attach</);
  assert.match(siteHtml, /Paste a link, or drop one here\./);
  assert.match(siteHtml, /Paste a link/);
  assert.match(siteHtml, /data-attach-url/);
  assert.match(siteHtml, /data-attach-add/);
  assert.match(siteHtml, /aria-live="polite"/);
  assert.match(siteHtml, /role="group"/);
  assert.equal(siteHtml.includes("capture="), false);
  assert.doesNotMatch(siteHtml, /!/);

  const logoHtml = renderCard(cardState(logo));
  assert.match(logoHtml, /data-attach-zone/);
  assert.match(logoHtml, /<button class="hh-btn hh-btn--secondary hh-attach__button" type="button" data-attach-button>Attach<\/button>/);
  assert.match(logoHtml, /Drop images here, or use Attach\./);
  assert.match(logoHtml, /Attach images/);
  assert.match(logoHtml, /type="file"/);
  assert.match(logoHtml, /multiple/);
  assert.equal(logoHtml.includes("data-attach-url"), false);

  const photoHtml = renderCard(cardState(photo));
  assert.match(photoHtml, /Drop images here, or paste a link\./);
  assert.match(photoHtml, /data-attach-button/);
  assert.match(photoHtml, /data-attach-url/);

  const other = renderCard(cardState(plain));
  assert.equal(other.includes("data-attach-zone"), false);
  assert.equal(other.includes("data-attach-button"), false);
});

test("normalizeUrl accepts http links and rejects other schemes", () => {
  const bare = normalizeUrl("  Example.com/path  ");
  assert.equal(bare.ok, true);
  if (bare.ok) {
    assert.equal(bare.url, "https://example.com/path");
    assert.equal(bare.host, "example.com");
  }
  const wrapped = normalizeUrl("<https://example.com>");
  assert.equal(wrapped.ok, true);
  if (wrapped.ok) assert.equal(wrapped.host, "example.com");
  const local = normalizeUrl("localhost:3000/desk");
  assert.equal(local.ok, true);
  if (local.ok) assert.equal(local.url, "https://localhost:3000/desk");

  assert.equal(normalizeUrl("javascript:alert(1)").ok, false);
  assert.equal(normalizeUrl("data:text/html,hi").ok, false);
  assert.equal(normalizeUrl("file:///etc/passwd").ok, false);
  assert.equal(normalizeUrl("vbscript:msg").ok, false);
  assert.equal(normalizeUrl("hello").ok, false);
  assert.match(normalizeUrl("javascript:alert(1)").ok ? "" : (normalizeUrl("javascript:alert(1)") as { error: string }).error, /http or https/);
  assert.match((normalizeUrl("hello") as { error: string }).error, /example\.com/);

  const secret = normalizeUrl("https://user:pass@example.com/a");
  assert.equal(secret.ok, true);
  if (secret.ok) assert.equal(secret.url.includes("pass"), false);
});

test("shortcut files, lists, dedupe, and the link cap", () => {
  assert.equal(shortcutTarget("old.url", "[InternetShortcut]\r\nURL=https://example.com/old\r\n"), "https://example.com/old");
  assert.equal(
    shortcutTarget("mark.webloc", `<plist><key>URL</key><string>https://example.com/we&amp;b</string></plist>`),
    "https://example.com/we&b",
  );
  assert.equal(shortcutTarget("notes.txt", "URL=https://example.com"), null);
  assert.equal(shortcutTarget("empty.url", "Icon=1"), "");
  assert.deepEqual(urisFromList("# comment\nhttps://a.example\n\nhttps://b.example"), [
    "https://a.example",
    "https://b.example",
  ]);
  assert.equal(textIsOnlyLinks("https://a.example example.com"), true);
  assert.equal(textIsOnlyLinks("see https://a.example later"), false);

  const first = collectLinks([], ["example.com", "https://example.com/", "https://other.test"]);
  assert.deepEqual(first.added, ["https://example.com/", "https://other.test/"]);
  assert.deepEqual(first.errors, []);
  const full = Array.from({ length: MAX_ATTACH_LINKS }, (_, index) => `https://n${index}.example/`);
  const capped = collectLinks(full, ["https://extra.example"]);
  assert.deepEqual(capped.added, []);
  assert.deepEqual(capped.errors, [linkCapError()]);
});

test("file names are sanitized and bad types name the file", () => {
  const allowed = [...IMAGE_EXT, "pdf", "txt", "md", "docx"];
  const slash = sanitizeUploadName("../../x.png", allowed);
  assert.deepEqual(slash, { ok: true, name: "x.png" });
  const windows = sanitizeUploadName("..\\..\\x.png", allowed);
  assert.deepEqual(windows, { ok: true, name: "x.png" });
  const drive = sanitizeUploadName("C:\\x.png", allowed);
  assert.deepEqual(drive, { ok: true, name: "x.png" });
  const nulled = sanitizeUploadName("good\0.png", allowed);
  assert.deepEqual(nulled, { ok: true, name: "good.png" });
  const dotted = sanitizeUploadName(".hidden.png", allowed);
  assert.deepEqual(dotted, { ok: true, name: "hidden.png" });
  const reserved = sanitizeUploadName("CON.png", allowed);
  assert.deepEqual(reserved, { ok: true, name: "file-con.png" });
  const unicode = sanitizeUploadName("café.png", allowed);
  assert.equal(unicode.ok, true);
  if (unicode.ok) {
    assert.match(unicode.name, /^[A-Za-z0-9._-]+\.png$/);
    assert.equal(unicode.name.includes("/"), false);
    assert.equal(unicode.name.includes("\\"), false);
  }
  const long = sanitizeUploadName(`${"a".repeat(180)}.png`, allowed);
  assert.equal(long.ok, true);
  if (long.ok) assert.ok(long.name.length <= 48);
  assert.equal(sanitizeUploadName("", allowed).ok, false);
  assert.equal(sanitizeUploadName("..", allowed).ok, false);
  assert.deepEqual(collisionName("mark.png", 1), "mark.png");
  assert.equal(collisionName("mark.png", 2), "mark-2.png");

  const kinds = kindsFor("DP-1.1");
  assert.ok(kinds);
  const exe = validateFileMeta({ name: "logo.exe", type: "application/octet-stream", size: 4 }, kinds);
  assert.equal(exe.ok, false);
  if (!exe.ok) assert.equal(exe.error, typeError("logo.exe", kinds));
  assert.match(typeError("logo.exe", kinds), /logo\.exe is not a type the Guide takes/);
  const huge = validateFileMeta({ name: "logo.png", type: "image/png", size: MAX_UPLOAD_BYTES + 1 }, kinds);
  assert.equal(huge.ok, false);
  if (!huge.ok) assert.match(huge.error, /logo\.png is over 25 MB/);
  const empty = validateFileMeta({ name: "logo.png", type: "image/png", size: 0 }, kinds);
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.match(empty.error, /logo\.png is empty/);
  const ok = validateFileMeta({ name: "../../logo.png", type: "image/png", size: 12 }, kinds);
  assert.deepEqual(ok, { ok: true, name: "logo.png" });
  const mismatch = validateFileMeta({ name: "logo.png", type: "application/pdf", size: 12 }, kinds);
  assert.equal(mismatch.ok, false);
  assert.equal(fileCapError().includes(String(MAX_ATTACH_FILES)), true);
});

test("byte sniff refuses a renamed executable and accepts real image headers", () => {
  assert.equal(bytesAllowed("png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), true);
  assert.equal(bytesAllowed("png", Uint8Array.from([0x4d, 0x5a, 0x90, 0x00])), false);
  assert.equal(bytesAllowed("jpg", Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), true);
  assert.equal(bytesAllowed("gif", Uint8Array.from(Buffer.from("GIF89a"))), true);
  assert.equal(bytesAllowed("svg", Uint8Array.from(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))), true);
  assert.equal(bytesAllowed("svg", Uint8Array.from(Buffer.from("MZ<svg></svg>"))), false);
  assert.equal(bytesAllowed("pdf", Uint8Array.from(Buffer.from("%PDF-1.7"))), true);
  assert.equal(bytesAllowed("txt", Uint8Array.from(Buffer.from("notes"))), true);
  assert.equal(bytesAllowed("txt", Uint8Array.from([0x4d, 0x5a, 0x00])), false);
  assert.equal(pastedImageName("image/jpeg", 10), "pasted-image-10.jpg");
  assert.equal(addedFilesMessage(2), "Added 2 files");
  assert.equal(addedLinksMessage(["example.com"]), "Added link example.com");
  assert.equal(removedMessage("logo.png"), "Removed logo.png");
  assert.equal(attachmentLine([{ originalName: "tins.jpg" }, { originalName: "logo.svg" }], ["https://example.com/"]), "Attached: tins.jpg, logo.svg. Links: example.com");
  assert.equal(answerWithAttachments("", [{ originalName: "tins.jpg" }], []), "Attached: tins.jpg.");
  assert.equal(answerWithAttachments("A wordmark.", [{ originalName: "tins.jpg" }], []), "A wordmark.\nAttached: tins.jpg.");
});

test("zone copy stays off questions that do not ask for a site or a file", () => {
  assert.equal(zoneCopy("DP-0.1"), null);
  assert.equal(zoneCopy("DP-0.2")?.fine, "Paste a link, or drop one here.");
  assert.equal(zoneCopy("DP-1.1")?.fine, "Drop images here, or use Attach.");
  assert.equal(zoneCopy("DP-6.4")?.fine, "Drop files here, or use Attach.");
  assert.equal(zoneCopy("DP-0.4")?.fine, "Drop images or files here, or paste a link.");
});

function cardState(question: Question): CardState {
  return {
    question,
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
  };
}
