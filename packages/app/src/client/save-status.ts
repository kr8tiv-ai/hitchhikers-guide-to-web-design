/**
 * Copy path and copy resume prompt. No imports, so the desk can serve this file as a module.
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

const buttons = document.querySelectorAll("[data-copy]");
for (const button of buttons) mark(button);
