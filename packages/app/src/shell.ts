export function renderShell(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>The Hitchhiker's Guide to Web Design</title>
    <link rel="stylesheet" href="src/design/tokens.css" />
    <link rel="stylesheet" href="src/design/type.css" />
    <link rel="stylesheet" href="src/design/components.css" />
    <link rel="stylesheet" href="src/shell.css" />
  </head>
  <body>
    <a class="hh-skip" href="#transcript">Skip to the transcript</a>
    <div class="hh-shell">
      <header class="hh-mast hh-rise">
        <div class="hh-mast__row">
          <h1 class="hh-kicker">The Hitchhiker's Guide to Web Design</h1>
          <p class="hh-kicker">Desk</p>
        </div>
        <div class="hh-wordmark" role="img" aria-label="Don't Panic"></div>
        <p class="hh-dek">Don't Panic. One question at a time. The work saves on this machine.</p>
      </header>

      <div class="hh-columns">
        <main class="hh-read">
          <section class="hh-log hh-rise hh-rise--2" id="transcript" data-region="transcript" aria-label="Transcript">
            <p class="hh-turn">
              <span class="hh-turn__who">Guide</span>
              The desk is clear. Nothing has been asked yet.
            </p>
          </section>

          <section class="hh-rise hh-rise--3" data-region="question" aria-label="Question">
            <article class="hh-qcard">
              <p class="hh-qcard__title">No question yet.</p>
              <p class="hh-qcard__why">One card will sit here when the interview starts.</p>
            </article>
          </section>
        </main>

        <nav class="hh-rise hh-rise--4" aria-label="Guide map">
          <ol class="hh-map">
            <li class="hh-map__item hh-map__item--current">
              <span class="hh-map__index">01</span>
              <span class="hh-map__name">Don't Panic</span>
              <span class="hh-map__note">The interview. No question is open.</span>
            </li>
            <li class="hh-map__item">
              <span class="hh-map__index">02</span>
              <span class="hh-map__name">Babel Fish</span>
              <span class="hh-map__note">Brand kit, after the brief is approved.</span>
            </li>
            <li class="hh-map__item">
              <span class="hh-map__index">03</span>
              <span class="hh-map__name">Deep Thought</span>
              <span class="hh-map__note">Spec, prompts, and the stack.</span>
            </li>
            <li class="hh-map__item">
              <span class="hh-map__index">04</span>
              <span class="hh-map__name">Improbability Drive</span>
              <span class="hh-map__note">The build, one prompt at a time.</span>
            </li>
            <li class="hh-map__item">
              <span class="hh-map__index">05</span>
              <span class="hh-map__name">Mostly Harmless</span>
              <span class="hh-map__note">Gates, then another pass if you want one.</span>
            </li>
            <li class="hh-map__item">
              <span class="hh-map__index">06</span>
              <span class="hh-map__name">So Long and Thanks for All the Fish</span>
              <span class="hh-map__note">Deploy, only after a yes.</span>
            </li>
          </ol>
        </nav>
      </div>

      <footer class="hh-status" data-region="status">
        <span>Ready.</span>
      </footer>
    </div>
  </body>
</html>
`;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb | null {
  const raw = hex.slice(1);
  const full =
    raw.length === 3
      ? raw.replace(/[0-9a-fA-F]/g, (channel) => channel + channel)
      : raw.length === 6 || raw.length === 8
        ? raw.slice(0, 6)
        : "";
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return null;
  return {
    r: Number.parseInt(full.slice(0, 2), 16) / 255,
    g: Number.parseInt(full.slice(2, 4), 16) / 255,
    b: Number.parseInt(full.slice(4, 6), 16) / 255,
  };
}

function isIndigoOrViolet(hex: string): boolean {
  const rgb = parseHex(hex);
  if (rgb === null) return false;
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return false;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === rgb.r) h = ((rgb.g - rgb.b) / d) % 6;
  else if (max === rgb.g) h = (rgb.b - rgb.r) / d + 2;
  else h = (rgb.r - rgb.g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return s > 0.18 && l > 0.12 && l < 0.92 && h >= 230 && h <= 295;
}

export function assertShellCss(css: string): string[] {
  const problems: string[] = [];
  if (css.includes("bg-indigo-600")) {
    problems.push("Class bg-indigo-600 is a default indigo utility.");
  }
  if (css.includes("rounded-full")) {
    problems.push("Class rounded-full is a pill button cliche.");
  }
  for (const match of css.matchAll(/linear-gradient\(([^()]*)\)/g)) {
    const body = match[1] ?? "";
    for (const hex of body.match(/#(?:[0-9a-fA-F]{3,8})\b/g) ?? []) {
      if (isIndigoOrViolet(hex)) {
        problems.push(`linear-gradient uses an indigo or violet hex ${hex}.`);
      }
    }
  }
  return problems;
}

export function assertShellHtml(html: string): string[] {
  const problems: string[] = [];
  const copy = html.replace(/<!DOCTYPE html>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  if (copy.includes("!")) {
    problems.push("UI copy contains an exclamation mark.");
  }
  if (copy.includes("\u2014")) {
    problems.push("UI copy contains an em dash.");
  }
  if (/\belevate\b/i.test(copy)) {
    problems.push("UI copy contains elevate.");
  }
  if (/\blorem\b/i.test(copy)) {
    problems.push("UI copy contains lorem.");
  }
  if (copy.includes("bg-indigo-600")) {
    problems.push("HTML uses the class bg-indigo-600.");
  }
  if (copy.includes("rounded-full")) {
    problems.push("HTML uses the class rounded-full.");
  }
  return problems;
}
