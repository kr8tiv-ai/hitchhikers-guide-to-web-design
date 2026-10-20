/**
 * Save in place, local time, and the Guide effort control.
 * No imports, so the desk can serve this file as a module.
 */

function mark(button: Element): void {
  button.addEventListener("click", () => {
    const text = button.getAttribute("data-copy") ?? "";
    const done = (): void => {
      button.setAttribute("data-copied", "true");
      button.textContent = "Copied";
    };
    const clip = navigator.clipboard;
    if (clip === undefined) {
      done();
      return;
    }
    void clip.writeText(text).then(done, done);
  });
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Same clock as save-line.ts formatSavedAt. This file has no imports. */
function localTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const hm = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  const same =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (same) return `Today ${hm}`;
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  return `${day} ${hm}`;
}

function paintTimes(root: ParentNode): void {
  for (const node of root.querySelectorAll("time[data-local-time]")) {
    const iso = node.getAttribute("datetime") ?? "";
    if (iso === "") continue;
    node.textContent = localTime(iso);
  }
}

function csrfToken(): string {
  const meta = document.querySelector('meta[name="hh-csrf"]');
  const fromMeta = meta?.getAttribute("content") ?? "";
  if (fromMeta !== "") return fromMeta;
  const hidden = document.querySelector('form[action="/api/project/save"] input[name="csrf"]');
  return hidden instanceof HTMLInputElement ? hidden.value : "";
}

function saveForm(): HTMLFormElement | null {
  const form = document.querySelector('form[action="/api/project/save"]');
  return form instanceof HTMLFormElement ? form : null;
}

function bindSave(): void {
  const form = saveForm();
  if (form === null) return;
  form.addEventListener("submit", (event) => {
    if (typeof fetch !== "function") return;
    event.preventDefault();
    const token = csrfToken();
    const body = new URLSearchParams();
    body.set("csrf", token);
    if (document.querySelector("[data-tour]") === null) body.set("tour", "seen");
    const status = document.querySelector("[data-save-status]");
    void fetch(form.action, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "x-hh-csrf": token,
      },
      body: body.toString(),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { ok?: boolean; savedAt?: string; place?: string };
        if (payload.ok !== true || status === null || typeof payload.savedAt !== "string") return;
        const place = typeof payload.place === "string" ? payload.place : "";
        status.setAttribute("aria-live", "polite");
        status.innerHTML = `Saved · <time datetime="${escapeText(payload.savedAt)}" data-local-time>${escapeText(localTime(payload.savedAt))}</time>${place === "" ? "" : ` · ${escapeText(place)}`}`;
      })
      .catch(() => {
        // The form stays on the page. A second click tries again.
      });
  });
}

function bindEffort(): void {
  const group = document.querySelector("[data-effort-control]");
  if (group === null) return;
  group.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== "guide-effort") return;
    const token = csrfToken();
    void fetch("/api/effort", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-hh-csrf": token,
      },
      body: JSON.stringify({ effort: target.value }),
    }).catch(() => undefined);
  });
  group.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const radios = [...group.querySelectorAll('input[name="guide-effort"]')].filter(
      (node): node is HTMLInputElement => node instanceof HTMLInputElement,
    );
    if (radios.length === 0) return;
    const current = radios.findIndex((radio) => radio.checked);
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = radios[(current + step + radios.length) % radios.length];
    if (next === undefined) return;
    event.preventDefault();
    next.checked = true;
    next.focus();
    next.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function showInline(form: HTMLFormElement, selector: string, message: string): void {
  const slot = form.querySelector(selector);
  if (!(slot instanceof HTMLElement)) return;
  slot.hidden = false;
  slot.textContent = message;
}

function bindOpen(): void {
  const form = document.querySelector("form[data-open-project]");
  if (!(form instanceof HTMLFormElement)) return;
  form.addEventListener("submit", (event) => {
    const field = form.querySelector("#hh-open-file");
    const value = field instanceof HTMLInputElement ? field.value.trim() : "";
    if (value !== "") return;
    event.preventDefault();
    showInline(form, "[data-open-error]", "Choose a project folder or .hhproject file");
  });
}

function bindNew(): void {
  const form = document.querySelector("form[data-new-project]");
  if (!(form instanceof HTMLFormElement)) return;
  form.addEventListener("submit", (event) => {
    const field = form.querySelector("#hh-new-name");
    const value = field instanceof HTMLInputElement ? field.value.trim() : "";
    if (value !== "") return;
    event.preventDefault();
    showInline(form, "[data-new-error]", "Name the project.");
  });
}

const buttons = document.querySelectorAll("[data-copy]");
for (const button of buttons) mark(button);
paintTimes(document);
bindSave();
bindEffort();
bindOpen();
bindNew();
