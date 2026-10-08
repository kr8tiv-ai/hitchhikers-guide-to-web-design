import { creditLine, parseCreditsValue } from "../scripts/credits-file.ts";

const copy = document.getElementById("credits-copy");
const list = document.getElementById("credits-list");

fetch("/credits/CREDITS.json")
  .then((response) => {
    if (!response.ok) throw new Error(String(response.status));
    return response.json() as Promise<unknown>;
  })
  .then((data) => {
    const page = parseCreditsValue(data);
    if (!(copy instanceof HTMLElement) || !(list instanceof HTMLElement)) return;
    if (page.entries.length === 0) return;
    copy.hidden = true;
    for (const entry of page.entries) {
      const item = document.createElement("li");
      item.textContent = creditLine(entry);
      list.append(item);
    }
  })
  .catch(() => {
    if (copy instanceof HTMLElement) copy.textContent = "Credits could not be read.";
  });
