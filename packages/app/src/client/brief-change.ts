/**
 * Change something on the Site Brief.
 * One submit is in flight. Progress shows at once. The draft repaints when it lands.
 */

const STAGES = ["Reading the change", "Rewriting the brief", "Saving the revision"] as const;

function token(): string {
  return document.querySelector('meta[name="hh-csrf"]')?.getAttribute("content") ?? "";
}

function progressNode(): HTMLElement | null {
  const node = document.querySelector("[data-brief-progress]");
  return node instanceof HTMLElement ? node : null;
}

function showStage(stage: string, started: number): void {
  const node = progressNode();
  if (node === null) return;
  const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
  node.hidden = false;
  node.textContent = `${stage} · ${elapsed}s`;
}

async function readBrief(): Promise<{ status?: string } | null> {
  try {
    const response = await fetch("/api/brief", { cache: "no-store" });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) return null;
    return payload as { status?: string };
  } catch {
    return null;
  }
}

function watch(started: number, seenRevising: boolean): void {
  let stage: string = STAGES[0];
  let sawRevising = seenRevising;
  const source = new EventSource("/api/events");
  source.addEventListener("brief-progress", (event) => {
    try {
      const payload: unknown = JSON.parse(event.data);
      if (typeof payload === "object" && payload !== null && "stage" in payload) {
        const next = (payload as { stage?: unknown }).stage;
        if (typeof next === "string" && next.trim() !== "") stage = next;
      }
    } catch {
      // A bad event keeps the last stage.
    }
    showStage(stage, started);
  });
  const timer = window.setInterval(() => {
    showStage(stage, started);
    void readBrief().then((brief) => {
      if (brief?.status === "revising") sawRevising = true;
      if (sawRevising && (brief?.status === "pending" || brief?.status === "approved")) {
        window.clearInterval(timer);
        source.close();
        window.location.reload();
      }
    });
  }, 300);
}

function bind(): void {
  const form = document.querySelector("textarea[name='correction']")?.closest("form");
  if (!(form instanceof HTMLFormElement)) return;
  const field = form.querySelector("textarea[name='correction']");
  const button = form.querySelector("[data-brief-change]");
  if (!(field instanceof HTMLTextAreaElement) || !(button instanceof HTMLButtonElement)) return;
  if (document.querySelector("[data-brief-status='revising']") !== null) {
    button.disabled = true;
    watch(Date.now(), true);
  }
  form.addEventListener("submit", (event) => {
    if (field.value.trim() === "") {
      event.preventDefault();
      let note = form.querySelector("[data-change-error]");
      if (!(note instanceof HTMLElement)) {
        note = document.createElement("p");
        note.id = "brief-change-error";
        note.setAttribute("data-change-error", "");
        note.setAttribute("role", "alert");
        field.insertAdjacentElement("afterend", note);
      }
      note.textContent = "Write the change.";
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", "brief-change-error");
      field.focus();
      return;
    }
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    const started = Date.now();
    showStage(STAGES[0], started);
    void fetch("/api/brief/change", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hh-csrf": token() },
      body: JSON.stringify({ correction: field.value }),
    }).then(async (response) => {
      let saw = false;
      try {
        const payload: unknown = await response.json();
        saw = typeof payload === "object" && payload !== null && (payload as { status?: string }).status === "revising";
      } catch {
        saw = false;
      }
      watch(started, saw);
    });
  });
}

bind();
