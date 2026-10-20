/**
 * Posts the direction the person picked. An empty reason does not post.
 * This file has no imports so the desk can serve it as a browser module.
 */

function mountDirectionDesk(doc: Document): void {
  const buttons = [...doc.querySelectorAll("[data-pick-direction]")];
  if (buttons.length === 0) return;
  const token = doc.querySelector('meta[name="hh-csrf"]')?.getAttribute("content") ?? "";
  const input = doc.querySelector("[data-direction-reason]");
  const note = doc.querySelector("[data-direction-note]");
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const reason = input instanceof HTMLInputElement ? input.value.trim() : "";
      if (reason === "") {
        if (note !== null) note.textContent = "A pick needs a one-line reason.";
        return;
      }
      const id = button.getAttribute("data-pick-direction") ?? "";
      setDisabled(buttons, true);
      void sendPick(token, id, reason).then(
        () => {
          window.location.reload();
        },
        (error: unknown) => {
          if (note !== null) note.textContent = error instanceof Error ? error.message : "The pick did not save.";
          setDisabled(buttons, false);
        },
      );
    });
  }
}

async function sendPick(token: string, id: string, reason: string): Promise<void> {
  const response = await fetch("/api/direction", {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-hh-csrf": token,
    },
    body: JSON.stringify({ id, reason }),
  });
  if (response.ok) return;
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const message =
    typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "The pick did not save.";
  throw new Error(message);
}

function setDisabled(buttons: readonly Element[], disabled: boolean): void {
  for (const button of buttons) {
    if (button instanceof HTMLButtonElement) button.disabled = disabled;
  }
}

if (typeof document !== "undefined") mountDirectionDesk(document);
