import type { ReactNode } from "react";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Next starter",
  description: "A blank Next.js page. The motion toolkit is installed and this page loads none of it.",
  url: "https://example.com/",
};

export default function Page(): ReactNode {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="top">
        <p className="mark">Starter</p>
        <a className="credits" href="/credits">
          Credits
        </a>
      </header>
      <main id="content">
        <p className="kicker">Next</p>
        <h1>A quiet page.</h1>
        <p className="dek">
          The toolkit is installed. This page loads none of it. Lenis stays behind a client boundary.
        </p>
      </main>
      <footer>
        <p>
          GSAP, Lenis, Three, OGL, Motion, anime.js, Theatre core, CSS scroll, and vanilla helpers ship as
          separate imports.
        </p>
      </footer>
    </>
  );
}
