/// <reference lib="dom" />

import { families, familiesForLevel, type MotionFamily } from "./families.ts";
import { renderMovieExplainer } from "./movie-explainer.ts";
import {
  DEFAULT_APPETITE,
  appetiteName,
  escapeHtml,
  holdsPoster,
  phoneNote,
  renderAppetite,
  webglCeilingSentence,
  weightCeiling,
} from "./slider.ts";

export { families, familiesForLevel, weightCeiling };
export type { MotionFamily };

const BANNED = "Magnetic buttons are banned.";

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function renderFamilyCard(family: MotionFamily, level: number): string {
  const inRange = family.minLevel <= level ? "true" : "false";
  const links = family.examples
    .map(
      (href) =>
        `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(hostLabel(href))}</a>`,
    )
    .join(" ");
  return `<article class="hh-motion__card" data-family="${escapeHtml(family.id)}" data-min-level="${family.minLevel}" data-tool="${family.tool}" data-in-range="${inRange}">
  <div class="hh-motion__frame" data-mount></div>
  <h2 class="hh-title">${escapeHtml(family.label)}</h2>
  <p class="hh-motion__tool">${escapeHtml(family.toolClause)}</p>
  <p class="hh-motion__links">${links}</p>
  <p class="hh-dek">In reach from ${family.minLevel}.</p>
</article>`;
}

export function renderFamilyGrid(level = DEFAULT_APPETITE): string {
  const cards = families.map((family) => renderFamilyCard(family, level)).join("\n");
  return `<div class="hh-motion__grid">${cards}</div>`;
}

export function renderFamilyList(level = DEFAULT_APPETITE): string {
  const items = families
    .map((family) => {
      const inRange = family.minLevel <= level ? "true" : "false";
      return `<li data-family-id="${escapeHtml(family.id)}" data-in-range="${inRange}">${escapeHtml(family.label)}, from ${family.minLevel}</li>`;
    })
    .join("");
  return `<ul data-family-list>${items}</ul>`;
}

export function renderMotionPage(): string {
  return `<div class="hh-motion" id="hh-motion">
  <p class="hh-kicker">Module 6</p>
  <h1 class="hh-headline">See the motion, then pick a number</h1>
  <p class="hh-dek">Ten short loops, each built with the tool it names. Then set an appetite from 1 to 10. The number caps weight. It does not remove a library from the Guide.</p>
  <p class="hh-motion__ban">${BANNED}</p>
  ${renderFamilyGrid(DEFAULT_APPETITE)}
  ${renderAppetite(DEFAULT_APPETITE)}
  ${renderFamilyList(DEFAULT_APPETITE)}
  ${renderMovieExplainer()}
</div>`;
}

export function renderDp6Supplement(questionId: string): string {
  if (questionId === "DP-6.1") {
    return `<div class="hh-motion" data-motion-block="families">
      <p class="hh-dek">A short loop for each family, with the tool in one clause and a real example. ${BANNED}</p>
      ${renderFamilyGrid(DEFAULT_APPETITE)}
    </div>`;
  }
  if (questionId === "DP-6.2") {
    return `<div class="hh-motion" data-motion-block="appetite">
      ${renderAppetite(DEFAULT_APPETITE)}
      ${renderFamilyList(DEFAULT_APPETITE)}
    </div>`;
  }
  if (questionId === "DP-6.3") {
    return `<div class="hh-motion" data-motion-block="shape">${renderMovieExplainer()}</div>`;
  }
  if (questionId === "DP-6.4") {
    return `<div class="hh-motion" data-motion-block="source">
      <p>None, pre-rendered, CC0, Tripo, Meshy, an upload, or a brief for a human.</p>
      <p class="hh-dek">This is the source list. It does not start a generator.</p>
    </div>`;
  }
  if (questionId === "DP-6.5") {
    return `<div class="hh-motion" data-motion-block="phone"><p>${escapeHtml(phoneNote(6))}</p></div>`;
  }
  if (questionId === "DP-6.6") {
    return `<div class="hh-motion" data-motion-block="sensitivity"><p>Reduced motion is always implemented.</p></div>`;
  }
  return "";
}

function applyLevel(root: ParentNode, level: number): void {
  const ceiling = weightCeiling(level);
  const panel = root.querySelector("#hh-appetite-panel");
  if (panel instanceof HTMLElement) {
    panel.dataset.ceilingLevel = String(level);
    panel.dataset.webgl = ceiling.webgl ? "true" : "false";
    panel.dataset.maxJs = String(ceiling.maxJsKb);
  }
  const name = root.querySelector("[data-appetite-name]");
  if (name !== null) name.textContent = appetiteName(level);
  const note = root.querySelector("[data-appetite-note]");
  if (note !== null) note.textContent = ceiling.note;
  const kb = root.querySelector("[data-appetite-kb]");
  if (kb !== null) kb.textContent = `JS ceiling ${ceiling.maxJsKb} KB gzip.`;
  const phone = root.querySelector("[data-phone-note]");
  if (phone !== null) phone.textContent = phoneNote(level);
  const webgl = root.querySelector("[data-appetite-webgl]");
  if (webgl !== null) webgl.textContent = webglCeilingSentence(level);
  const label = root.querySelector('label[for="hh-appetite"]');
  if (label !== null) {
    label.textContent = `Motion appetite, 1 to 10. ${appetiteName(level)} is the current step.`;
  }
  for (const item of root.querySelectorAll("[data-family-id], [data-family]")) {
    if (!(item instanceof HTMLElement)) continue;
    const id = item.dataset.familyId ?? item.dataset.family ?? "";
    const family = families.find((entry) => entry.id === id);
    if (family === undefined) continue;
    item.dataset.inRange = family.minLevel <= level ? "true" : "false";
  }
}

function currentLevel(root: ParentNode): number {
  const input = root.querySelector("#hh-appetite");
  if (!(input instanceof HTMLInputElement)) return DEFAULT_APPETITE;
  const level = Number(input.value);
  return Number.isInteger(level) && level >= 1 && level <= 10 ? level : DEFAULT_APPETITE;
}

function mountCard(card: HTMLElement, level: number): void {
  const id = card.dataset.family;
  const family = families.find((entry) => entry.id === id);
  const frame = card.querySelector("[data-mount]");
  if (family === undefined || !(frame instanceof HTMLElement)) return;
  if (card.dataset.mounted === "true") return;
  const minLevel = Number(card.dataset.minLevel ?? family.minLevel);
  if (holdsPoster(minLevel, level)) {
    card.dataset.poster = "locked";
    frame.innerHTML =
      '<div class="hh-motion__hold"><p>Above the current appetite on a small phone.</p>' +
      '<button class="hh-btn hh-btn--secondary" type="button" data-play-preview>Play this preview</button></div>';
    const button = frame.querySelector("[data-play-preview]");
    button?.addEventListener("click", () => {
      delete card.dataset.poster;
      frame.replaceChildren();
      card.dataset.mounted = "true";
      void family.mount(frame);
    });
    return;
  }
  card.dataset.mounted = "true";
  void family.mount(frame);
}

export function mountMotionRoot(root: ParentNode): void {
  if (!(root instanceof HTMLElement)) return;
  if (root.dataset.hhMotionBound === "true") return;
  root.dataset.hhMotionBound = "true";
  const input = root.querySelector("#hh-appetite");
  const sync = () => applyLevel(root, currentLevel(root));
  if (input instanceof HTMLInputElement) {
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
  }
  const level = currentLevel(root);
  for (const card of root.querySelectorAll("[data-family]")) {
    if (card instanceof HTMLElement) mountCard(card, level);
  }
}

function bootMotionDesk(): void {
  const doc = (globalThis as { document?: Document }).document;
  if (doc?.querySelector === undefined) return;
  const page = doc.querySelector("#hh-motion");
  if (page instanceof HTMLElement) mountMotionRoot(page);
  const region = doc.querySelector('[data-region="question"]');
  if (region === null) return;
  const fill = (): void => {
    const card = region.querySelector("[data-question-id]");
    if (card === null) return;
    const id = card.getAttribute("data-question-id") ?? "";
    if (!id.startsWith("DP-6.")) return;
    if (region.querySelector(`[data-motion-supplement="${id}"]`) !== null) return;
    const html = renderDp6Supplement(id);
    if (html.length === 0) return;
    const holder = doc.createElement("div");
    holder.dataset.motionSupplement = id;
    holder.innerHTML = html;
    card.insertAdjacentElement("afterend", holder);
    mountMotionRoot(holder);
  };
  fill();
  const Observer = (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver;
  if (typeof Observer !== "function") return;
  const observer = new Observer(() => fill());
  observer.observe(region, { childList: true, subtree: true });
}

bootMotionDesk();
