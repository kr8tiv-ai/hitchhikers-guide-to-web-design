/**
 * Desk install dialog. No imports, so the desk can serve this file as a module.
 * Nothing runs until Run these steps. Progress comes from the POST stream.
 */

interface InstallClick {
  target: {
    getAttribute?(name: string): string | null;
    closest?(selector: string): InstallNode | null;
  } | null;
  preventDefault(): void;
  key?: string;
}

interface InstallNode {
  innerHTML: string;
  textContent?: string | null;
  className?: string;
  hidden?: boolean;
  value?: string;
  disabled?: boolean;
  open?: boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): InstallNode | null;
  querySelectorAll?(selector: string): ArrayLike<InstallNode>;
  appendChild?(node: InstallNode): void;
  focus?(): void;
  closest?(selector: string): InstallNode | null;
  showModal?(): void;
  close?(): void;
  addEventListener?(type: string, listener: (event: InstallClick) => void): void;
  removeEventListener?(type: string, listener: (event: InstallClick) => void): void;
}

interface InstallDocument {
  querySelector(selector: string): InstallNode | null;
  addEventListener(type: string, listener: (event: InstallClick) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (event: InstallClick) => void, capture?: boolean): void;
  createElement?(tag: string): InstallNode;
  body?: { appendChild(node: InstallNode): void };
}

interface InstallEnv {
  document: InstallDocument;
  fetch: typeof fetch;
}

interface PlanStepView {
  id: string;
  argv: string[];
  kind: string;
  url: string | null;
  label: string;
  cwd?: string;
}

interface ModelView {
  id: string;
  label: string;
  bytes: number;
}

interface PlanView {
  recipeId: string;
  tool: string;
  title: string;
  runSteps: PlanStepView[];
  sizeLabel: string;
  location: string;
  adminLabel: string;
  sourceHost: string;
  sourceUrl: string;
  manualCommand: string;
  docsUrl: string | null;
  signIn: string | null;
  canRun: boolean;
  models: ModelView[];
  selectedModel: string | null;
  note: string;
  workspace: string | null;
}

interface ProbeView {
  name: string;
  ok: boolean;
  detail: string;
}

interface DoneView {
  status?: string;
  error?: string | null;
  probes?: ProbeView[];
  statusHtml?: string;
  stillMissing?: boolean;
  manualCommand?: string;
  docsUrl?: string | null;
  localWhisper?: boolean;
  notice?: string | null;
}

let opener: InstallNode | null = null;

/**
 * The desk calls these from its own click and key listeners.
 * A second document listener would replace the desk handler in the node tests,
 * which keep one listener per event.
 */
export function handleInstallClick(env: InstallEnv, event: InstallClick): boolean {
  const button = marked(event.target, "data-install");
  if (button === null) return false;
  const tool = button.getAttribute("data-install");
  if (tool === null || tool.length === 0) return false;
  event.preventDefault();
  opener = button;
  void openPlan(env, tool, null);
  return true;
}

export function handleInstallKey(env: InstallEnv, event: InstallClick): boolean {
  if (event.key !== "Escape") return false;
  const dialog = env.document.querySelector("[data-install-dialog]");
  if (dialog === null || dialog.open !== true) return false;
  if (dialog.getAttribute("data-running") !== "true") return false;
  event.preventDefault();
  void postCancel(env, dialog.getAttribute("data-tool") ?? "");
  return true;
}

export function mountToolInstall(env: InstallEnv): () => void {
  return () => {
    opener = null;
    const dialog = env.document.querySelector("[data-install-dialog]");
    if (dialog !== null && typeof dialog.close === "function") dialog.close();
  };
}

export function applyToolsEvent(raw: string): void {
  if (raw.length === 0) return;
  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return;
  }
  if (!isRecord(payload)) return;
  paintDone(payload as DoneView);
}

async function openPlan(env: InstallEnv, tool: string, modelId: string | null): Promise<void> {
  const issued = await postJson(env, "/api/tools/plan", { tool, modelId });
  if (!issued.ok || !isRecord(issued.body)) {
    showFailure(env, tool, issued.error, "", null);
    return;
  }
  const plan = readPlan(issued.body.plan);
  const token = typeof issued.body.token === "string" ? issued.body.token : "";
  if (plan === null || token.length === 0) {
    showFailure(env, tool, "The plan could not be read.", "", null);
    return;
  }
  renderDialog(env, plan, token);
}

function renderDialog(env: InstallEnv, plan: PlanView, token: string): void {
  const existing = env.document.querySelector("[data-install-dialog]");
  const dialog = existing ?? createDialog(env);
  if (dialog === null) return;
  const hosts = sourceHosts(plan);
  const commands = plan.runSteps.map((step) => `<li><code>${escapeHtml(commandText(step))}</code></li>`).join("");
  const models = plan.models.length === 0
    ? ""
    : `<label>Model <select data-install-model>${plan.models.map((model) => {
        const selected = model.id === plan.selectedModel ? " selected" : "";
        return `<option value="${escapeHtml(model.id)}"${selected}>${escapeHtml(model.label)}</option>`;
      }).join("")}</select></label>`;
  const docs = plan.docsUrl === null
    ? ""
    : `<a class="hh-btn" href="${escapeHtml(plan.docsUrl)}" data-install-docs>Open docs</a>`;
  const signIn = plan.signIn === null ? "" : `<p data-install-signin>${escapeHtml(plan.signIn)}</p>`;
  const workspace = plan.workspace === null ? "" : `<p>Runs in ${escapeHtml(plan.workspace)}</p>`;
  const runDisabled = plan.canRun ? "" : " disabled";
  dialog.setAttribute("data-tool", plan.tool);
  dialog.setAttribute("data-token", token);
  dialog.removeAttribute("data-running");
  dialog.innerHTML = `<h2 id="hh-install-title">${escapeHtml(plan.title)}</h2>
    <p>These steps run on this machine after you confirm.</p>
    <ol class="hh-install__cmds" data-install-commands>${commands}</ol>
    <p data-install-size>Size: ${escapeHtml(plan.sizeLabel)}</p>
    <p data-install-location>Location: ${escapeHtml(plan.location)}</p>
    <p data-install-admin>${escapeHtml(plan.adminLabel)}</p>
    <p data-install-source>Source: ${escapeHtml(hosts)}</p>
    ${workspace}
    ${signIn}
    <p>${escapeHtml(plan.note)}</p>
    ${models}
    <div data-install-live aria-live="polite">
      <p data-install-status></p>
      <div class="hh-install__track" data-install-track hidden>
        <progress class="hh-install__fill" data-install-fill max="100" value="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Install progress"></progress>
      </div>
    </div>
    <p class="hh-error" role="alert" data-install-error hidden></p>
    <textarea class="hh-install__manual" readonly data-install-manual>${escapeHtml(plan.manualCommand)}</textarea>
    <div class="hh-install__actions">
      <button class="hh-btn" type="button" data-install-copy>Copy</button>
      ${docs}
      <button class="hh-btn" type="button" data-install-run${runDisabled}>Run these steps</button>
      <button class="hh-btn" type="button" data-install-dismiss>Cancel</button>
      <button class="hh-btn" type="button" data-install-retry hidden>Retry</button>
      <button class="hh-btn" type="button" data-install-again${plan.canRun ? " hidden" : ""}>Check again</button>
    </div>`;
  const copy = dialog.querySelector("[data-install-copy]");
  if (copy !== null) copy.setAttribute("data-copy", plan.manualCommand);
  wireDialog(env, dialog);
  if (dialog.open !== true && typeof dialog.showModal === "function") dialog.showModal();
  const run = dialog.querySelector("[data-install-run]");
  if (run !== null && typeof run.focus === "function" && plan.canRun) run.focus();
}

function wireDialog(env: InstallEnv, dialog: InstallNode): void {
  if (typeof dialog.addEventListener !== "function") return;
  if (dialog.getAttribute("data-wired") === "true") return;
  dialog.setAttribute("data-wired", "true");
  const toolOf = (): string => dialog.getAttribute("data-tool") ?? "";
  const onClick = (event: InstallClick): void => {
    const target = event.target;
    if (target === null || typeof (target as unknown as InstallNode).getAttribute !== "function") return;
    const node = target as unknown as InstallNode;
    const host = typeof node.closest === "function" ? node.closest("button, a") ?? node : node;
    if (host.getAttribute("data-install-run") !== null) {
      event.preventDefault();
      void runPlan(env, dialog, toolOf());
      return;
    }
    if (host.getAttribute("data-install-dismiss") !== null) {
      event.preventDefault();
      if (dialog.getAttribute("data-running") === "true") {
        void postCancel(env, toolOf());
        return;
      }
      closeDialog(dialog);
      return;
    }
    if (host.getAttribute("data-install-retry") !== null) {
      event.preventDefault();
      const model = selectedModel(dialog);
      void openPlan(env, toolOf(), model);
      return;
    }
    if (host.getAttribute("data-install-again") !== null) {
      event.preventDefault();
      void postRecheck(env);
      return;
    }
    if (host.getAttribute("data-install-copy") !== null) {
      event.preventDefault();
      markCopied(host);
    }
  };
  const onChange = (): void => {
    const model = selectedModel(dialog);
    void openPlan(env, toolOf(), model);
  };
  const onCancel = (event: InstallClick): void => {
    if (dialog.getAttribute("data-running") === "true") {
      event.preventDefault();
      void postCancel(env, toolOf());
      return;
    }
    restoreFocus();
  };
  dialog.addEventListener("click", onClick);
  dialog.addEventListener("change", onChange);
  dialog.addEventListener("cancel", onCancel);
  dialog.addEventListener("close", () => {
    restoreFocus();
  });
}

async function runPlan(env: InstallEnv, dialog: InstallNode, tool: string): Promise<void> {
  if (dialog.getAttribute("data-running") === "true") return;
  const token = dialog.getAttribute("data-token") ?? "";
  dialog.setAttribute("data-running", "true");
  const run = dialog.querySelector("[data-install-run]");
  if (run !== null) {
    run.disabled = true;
    run.setAttribute("disabled", "");
  }
  setStatus(dialog, "Working.");
  const live = dialog.querySelector("[data-install-live]");
  if (live !== null) live.setAttribute("aria-busy", "true");
  const response = await env.fetch("/api/tools/run", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hh-csrf": readToken(env.document) },
    body: JSON.stringify({ token }),
  });
  if (!response.ok || response.body === null) {
    let message = "The install failed.";
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload) && typeof payload.error === "string") message = payload.error;
    } catch {
      message = "The install failed.";
    }
    dialog.removeAttribute("data-running");
    showDialogFailure(dialog, message);
    return;
  }
  await readSse(response.body, (name, data) => {
    let payload: unknown;
    try {
      payload = JSON.parse(data) as unknown;
    } catch {
      return;
    }
    if (!isRecord(payload)) return;
    if (name === "download") {
      const received = typeof payload.received === "number" ? payload.received : 0;
      const total = typeof payload.total === "number" ? payload.total : null;
      setProgress(dialog, received, total);
      return;
    }
    if (name === "stdout" || name === "stderr" || name === "step") {
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (text.length > 0) setStatus(dialog, text);
      return;
    }
    if (name === "done") applyRunDone(env, dialog, tool, payload as DoneView);
  });
  dialog.removeAttribute("data-running");
  if (live !== null) live.removeAttribute("aria-busy");
}

function applyRunDone(env: InstallEnv, dialog: InstallNode, tool: string, done: DoneView): void {
  dialog.removeAttribute("data-running");
  if (done.status === "cancelled") {
    setStatus(dialog, "Cancelled.");
    hideError(dialog);
    restoreFocus();
    return;
  }
  if (done.status === "failed") {
    showDialogFailure(dialog, done.error ?? "The install failed.");
    if (typeof done.manualCommand === "string") {
      const manual = dialog.querySelector("[data-install-manual]");
      if (manual !== null) manual.value = done.manualCommand;
      const copy = dialog.querySelector("[data-install-copy]");
      if (copy !== null) copy.setAttribute("data-copy", done.manualCommand);
    }
    return;
  }
  paintDone(done);
  if (done.stillMissing === true && typeof done.notice === "string") {
    setStatus(dialog, done.notice);
    return;
  }
  closeDialog(dialog);
  focusRow(env, tool);
}

function paintDone(done: DoneView): void {
  const root = pageDocument();
  if (root === null || done.probes === undefined) return;
  for (const probe of done.probes) paintProbe(root, probe);
  if (typeof done.statusHtml === "string") {
    const footer = root.querySelector("[data-region='status']");
    if (footer !== null) footer.innerHTML = done.statusHtml;
  }
  if (typeof done.localWhisper === "boolean") {
    const question = root.querySelector("[data-region='question']");
    if (question !== null) question.setAttribute("data-local-whisper", done.localWhisper ? "true" : "false");
  }
}

function paintProbe(root: InstallDocument, probe: ProbeView): void {
  const row = root.querySelector(`tr[data-probe="${probe.name}"]`);
  if (row === null) return;
  row.setAttribute("data-probe-state", probe.ok ? "ok" : "missing");
  const cells = row.querySelectorAll?.("td");
  if (cells === undefined || cells.length < 4) return;
  const result = cells[1];
  const state = cells[2];
  const action = cells[3];
  if (result !== undefined) result.textContent = probe.detail;
  if (state !== undefined) state.textContent = probe.ok ? "Present" : "Missing";
  if (action !== undefined && probe.ok) action.innerHTML = "";
}

async function postCancel(env: InstallEnv, tool: string): Promise<void> {
  await postJson(env, "/api/tools/cancel", { tool });
}

async function postRecheck(env: InstallEnv): Promise<void> {
  const result = await postJson(env, "/api/tools/recheck", {});
  if (result.ok && isRecord(result.body)) paintDone(result.body as DoneView);
}

async function postJson(
  env: InstallEnv,
  url: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; body: Record<string, unknown> | null; error: string }> {
  try {
    const response = await env.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hh-csrf": readToken(env.document) },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json();
    if (!isRecord(payload)) return { ok: false, body: null, error: "The desk returned an unreadable response." };
    if (!response.ok) {
      const error = typeof payload.error === "string" ? payload.error : "The desk refused that request.";
      return { ok: false, body: payload, error };
    }
    return { ok: true, body: payload, error: "" };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "The desk could not be reached.";
    return { ok: false, body: null, error: message };
  }
}

async function readSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (name: string, data: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      let name = "message";
      const data: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trim());
      }
      if (data.length > 0) onEvent(name, data.join("\n"));
    }
  }
}

function showFailure(env: InstallEnv, tool: string, error: string, manual: string, docs: string | null): void {
  const dialog = env.document.querySelector("[data-install-dialog]") ?? createDialog(env);
  if (dialog === null) return;
  dialog.innerHTML = `<h2 id="hh-install-title">Install ${escapeHtml(tool)}</h2>
    <p class="hh-error" role="alert" data-install-error>${escapeHtml(error)}</p>
    <textarea class="hh-install__manual" readonly data-install-manual>${escapeHtml(manual)}</textarea>
    <div class="hh-install__actions">
      <button class="hh-btn" type="button" data-install-copy>Copy</button>
      ${docs === null ? "" : `<a class="hh-btn" href="${escapeHtml(docs)}">Open docs</a>`}
      <button class="hh-btn" type="button" data-install-retry>Retry</button>
      <button class="hh-btn" type="button" data-install-dismiss>Cancel</button>
    </div>`;
  dialog.setAttribute("data-tool", tool);
  wireDialog(env, dialog);
  if (typeof dialog.showModal === "function" && dialog.open !== true) dialog.showModal();
}

function showDialogFailure(dialog: InstallNode, message: string): void {
  const error = dialog.querySelector("[data-install-error]");
  if (error !== null) {
    error.hidden = false;
    error.textContent = message;
    error.removeAttribute("hidden");
  }
  const retry = dialog.querySelector("[data-install-retry]");
  if (retry !== null) {
    retry.hidden = false;
    retry.removeAttribute("hidden");
  }
  setStatus(dialog, "");
}

function hideError(dialog: InstallNode): void {
  const error = dialog.querySelector("[data-install-error]");
  if (error !== null) {
    error.hidden = true;
    error.setAttribute("hidden", "");
    error.textContent = "";
  }
}

function setStatus(dialog: InstallNode, text: string): void {
  const status = dialog.querySelector("[data-install-status]");
  if (status !== null) status.textContent = text;
}

function setProgress(dialog: InstallNode, received: number, total: number | null): void {
  const track = dialog.querySelector("[data-install-track]");
  const fill = dialog.querySelector("[data-install-fill]");
  if (total === null || total <= 0) {
    setStatus(dialog, "Working.");
    return;
  }
  if (track !== null) {
    track.hidden = false;
    track.removeAttribute("hidden");
  }
  const pct = Math.max(0, Math.min(100, Math.round((received / total) * 100)));
  if (fill !== null) {
    fill.setAttribute("value", String(pct));
    fill.setAttribute("aria-valuenow", String(pct));
    fill.setAttribute("aria-valuemin", "0");
    fill.setAttribute("aria-valuemax", "100");
  }
  setStatus(dialog, `${pct}%`);
}

function createDialog(env: InstallEnv): InstallNode | null {
  if (typeof env.document.createElement !== "function" || env.document.body === undefined) return null;
  const dialog = env.document.createElement("dialog");
  dialog.className = "hh-install";
  dialog.setAttribute("data-install-dialog", "true");
  dialog.setAttribute("aria-labelledby", "hh-install-title");
  env.document.body.appendChild(dialog);
  return dialog;
}

function closeDialog(dialog: InstallNode): void {
  if (typeof dialog.close === "function") dialog.close();
  else restoreFocus();
}

function restoreFocus(): void {
  if (opener !== null && typeof opener.focus === "function") opener.focus();
}

function focusRow(env: InstallEnv, tool: string): void {
  const row = env.document.querySelector(`tr[data-probe="${tool}"]`);
  if (row === null) {
    restoreFocus();
    return;
  }
  row.setAttribute("tabindex", "-1");
  if (typeof row.focus === "function") row.focus();
}

function selectedModel(dialog: InstallNode): string | null {
  const select = dialog.querySelector("[data-install-model]");
  if (select === null || typeof select.value !== "string" || select.value.length === 0) return null;
  return select.value;
}

function markCopied(button: InstallNode): void {
  const text = button.getAttribute("data-copy") ?? "";
  const done = (): void => {
    button.setAttribute("data-copied", "true");
    button.textContent = "Copied";
  };
  const clip = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (clip === undefined) {
    done();
    return;
  }
  void clip.writeText(text).then(done, done);
}

function commandText(step: PlanStepView): string {
  if (step.kind === "download") return step.url === null ? "download" : `download ${step.url}`;
  return step.argv.map(quoteArg).join(" ");
}

function quoteArg(arg: string): string {
  if (arg.length === 0 || /[\s"]/.test(arg)) return `"${arg.replaceAll("\"", "\\\"")}"`;
  return arg;
}

function sourceHosts(plan: PlanView): string {
  const hosts = new Set<string>();
  if (plan.sourceHost.length > 0) hosts.add(plan.sourceHost);
  for (const step of plan.runSteps) {
    if (step.url === null) continue;
    try {
      hosts.add(new URL(step.url).host);
    } catch {
      // The plan route already rejected a bad URL.
    }
  }
  return [...hosts].join(", ");
}

function readPlan(value: unknown): PlanView | null {
  if (!isRecord(value) || typeof value.tool !== "string" || typeof value.title !== "string") return null;
  if (!Array.isArray(value.runSteps)) return null;
  const runSteps: PlanStepView[] = [];
  for (const step of value.runSteps) {
    if (!isRecord(step) || typeof step.kind !== "string" || !Array.isArray(step.argv)) return null;
    const argv: string[] = [];
    for (const part of step.argv) {
      if (typeof part !== "string") return null;
      argv.push(part);
    }
    const view: PlanStepView = {
      id: typeof step.id === "string" ? step.id : "",
      argv,
      kind: step.kind,
      url: typeof step.url === "string" ? step.url : null,
      label: typeof step.label === "string" ? step.label : "",
    };
    if (typeof step.cwd === "string") view.cwd = step.cwd;
    runSteps.push(view);
  }
  const models: ModelView[] = [];
  if (Array.isArray(value.models)) {
    for (const model of value.models) {
      if (!isRecord(model) || typeof model.id !== "string" || typeof model.label !== "string") continue;
      models.push({
        id: model.id,
        label: model.label,
        bytes: typeof model.bytes === "number" ? model.bytes : 0,
      });
    }
  }
  return {
    recipeId: typeof value.recipeId === "string" ? value.recipeId : "",
    tool: value.tool,
    title: value.title,
    runSteps,
    sizeLabel: typeof value.sizeLabel === "string" ? value.sizeLabel : "",
    location: typeof value.location === "string" ? value.location : "",
    adminLabel: typeof value.adminLabel === "string" ? value.adminLabel : "",
    sourceHost: typeof value.sourceHost === "string" ? value.sourceHost : "",
    sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl : "",
    manualCommand: typeof value.manualCommand === "string" ? value.manualCommand : "",
    docsUrl: typeof value.docsUrl === "string" ? value.docsUrl : null,
    signIn: typeof value.signIn === "string" ? value.signIn : null,
    canRun: value.canRun === true,
    models,
    selectedModel: typeof value.selectedModel === "string" ? value.selectedModel : null,
    note: typeof value.note === "string" ? value.note : "",
    workspace: typeof value.workspace === "string" ? value.workspace : null,
  };
}

function marked(target: InstallClick["target"], attr: string): InstallNode | null {
  if (target === null || typeof target !== "object") return null;
  const node = target as unknown as InstallNode;
  if (typeof node.closest === "function") {
    const found = node.closest(`[${attr}]`);
    if (found !== null) return found;
  }
  if (typeof node.getAttribute === "function" && node.getAttribute(attr) !== null) return node;
  return null;
}

function readToken(document: InstallDocument): string {
  const meta = document.querySelector('meta[name="hh-csrf"]');
  return meta?.getAttribute("content") ?? "";
}

function pageDocument(): InstallDocument | null {
  if (typeof document === "undefined") return null;
  return document as unknown as InstallDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
