import type { Metadata } from "next";
import type { ReactNode } from "react";
import credits from "../../data/credits.json";

interface CreditAsset {
  file: string;
  source: string;
  license: string;
  author: string;
}

const assets = credits.assets as CreditAsset[];

export const metadata: Metadata = {
  title: "Credits",
  description: "Borrowed media for this starter. The list matches CREDITS.json.",
  alternates: { canonical: "/credits" },
};

export default function CreditsPage(): ReactNode {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Credits",
    description: "Borrowed media for this starter. The list matches CREDITS.json.",
    url: "https://example.com/credits",
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="top">
        <p className="mark">Starter</p>
        <a className="credits" href="/">
          Home
        </a>
      </header>
      <main id="content">
        <p className="kicker">Credits</p>
        <h1>Borrowed media.</h1>
        {assets.length === 0 ? (
          <p className="dek">No borrowed media is checked in.</p>
        ) : (
          <ul className="credits-list">
            {assets.map((asset) => (
              <li key={asset.file}>
                {asset.file}. {asset.author}. {asset.license}. {asset.source}.
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
