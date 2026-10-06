/**
 * Full scroll-film versus a branching story. Prices are the Imagine card
 * dated 2026-09-29 (prompt 053 / v2 Module 7). No rate here is invented.
 * grok-imagine-video has no listed 1080p price, so that cell is omitted.
 */

export const IMAGINE_CARD_DATE = "2026-09-29";

export const imaginePrices = {
  image: 0.02,
  image2Low1k: 0.04,
  image2Medium2k: 0.08,
  imageQualityFrom: 0.05,
  video15PerSecond: { p480: 0.08, p720: 0.14, p1080: 0.25 },
  video15LitePerSecond: { p480: 0.02, p720: 0.03, p1080: 0.14 },
  videoPerSecond: { p480: 0.05, p720: 0.07 },
} as const;

/** 10 × grok-imagine-image at $0.02, plus 2 × 10s video-1.5-lite at 480p. */
export const STARTER_TOTAL = 10 * imaginePrices.image + 2 * 10 * imaginePrices.video15LitePerSecond.p480;

/** 30 × image-2.0 at 1K low, plus 4 × 10s video-1.5 at 480p. */
export const STANDARD_TOTAL =
  30 * imaginePrices.image2Low1k + 4 * 10 * imaginePrices.video15PerSecond.p480;

/** 12 × 10s of video-1.5 at 1080p. Past a $15 cap on its own. */
export const TWELVE_AT_1080 = 12 * 10 * imaginePrices.video15PerSecond.p1080;

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function renderMovieExplainer(): string {
  const starter = money(STARTER_TOTAL);
  const standard = money(STANDARD_TOTAL);
  const twelve = money(TWELVE_AT_1080);
  const ten1080 = money(10 * imaginePrices.video15PerSecond.p1080);
  const ten480 = money(10 * imaginePrices.video15PerSecond.p480);
  const lite10 = money(10 * imaginePrices.video15LitePerSecond.p480);
  return `<section class="hh-motion__film" aria-labelledby="hh-film-title">
  <p class="hh-kicker">Shape</p>
  <h2 class="hh-title" id="hh-film-title">A scroll film, or a branching story</h2>
  <p class="hh-dek">Either shape costs build length, weight, a phone fallback, and a crawlable text layer. The words stay in the page so a crawler can read them. Prices below are the Imagine card of ${IMAGINE_CARD_DATE}.</p>
  <div class="hh-motion__split">
    <article class="hh-qcard">
      <h3 class="hh-title">Scroll film</h3>
      <p>One continuous story the visitor scrolls through. The timeline is longer to design, the pins and media weigh more, and a phone gets a poster instead of the scrub.</p>
      <p><a href="https://www.igloo.inc/" target="_blank" rel="noopener noreferrer">Igloo Inc</a> is the scroll-film example. <a href="http://darknetflix.io" target="_blank" rel="noopener noreferrer">darknetflix.io</a> is the storytelling example.</p>
    </article>
    <article class="hh-qcard">
      <h3 class="hh-title">Branching story</h3>
      <p>Visitors pick a path. There are more pages, and each path is a shorter scene. Build length grows with the branches. The phone still gets a calm poster, and the text stays readable without the film.</p>
      <p><a href="https://messenger.abeto.co" target="_blank" rel="noopener noreferrer">Messenger</a> is the branching example.</p>
    </article>
  </div>
  <div class="hh-motion__costs">
    <h3 class="hh-title">Imagine cost, before retries</h3>
    <ul>
      <li>grok-imagine-image is ${money(imaginePrices.image)} an image.</li>
      <li>grok-imagine-image-2.0 is ${money(imaginePrices.image2Low1k)} at 1K low, and ${money(imaginePrices.image2Medium2k)} at 2K medium.</li>
      <li>grok-imagine-image-quality starts at ${money(imaginePrices.imageQualityFrom)}.</li>
      <li>grok-imagine-video-1.5 is ${money(imaginePrices.video15PerSecond.p480)}/s at 480p, ${money(imaginePrices.video15PerSecond.p720)}/s at 720p, and ${money(imaginePrices.video15PerSecond.p1080)}/s at 1080p. Ten seconds at 480p is ${ten480}. Ten seconds at 1080p is ${ten1080}.</li>
      <li>grok-imagine-video-1.5-lite is ${money(imaginePrices.video15LitePerSecond.p480)}/s at 480p, ${money(imaginePrices.video15LitePerSecond.p720)}/s at 720p, and ${money(imaginePrices.video15LitePerSecond.p1080)}/s at 1080p. Ten seconds at 480p is ${lite10}.</li>
      <li>grok-imagine-video is ${money(imaginePrices.videoPerSecond.p480)}/s at 480p and ${money(imaginePrices.videoPerSecond.p720)}/s at 720p. 1080p is not listed for that model, so it is not priced here.</li>
      <li>Starter, about $1: 10 images plus 2 clips of 10 seconds on video-1.5-lite at 480p, near ${starter}.</li>
      <li>Standard, about $5: 30 images on grok-imagine-image-2.0 at 1K low, plus 4 clips of 10 seconds on video-1.5 at 480p, about ${standard}. If the clips move to 1080p, recompute at ${money(imaginePrices.video15PerSecond.p1080)}/s before anyone confirms.</li>
      <li>Do not promise 12 clips of 10 seconds at 1080p inside a $15 cap. That video alone is ${twelve}.</li>
    </ul>
  </div>
</section>`;
}
