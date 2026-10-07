import type { ReactNode } from "react";
import { Reveal } from "../hh/Reveal.tsx";

export function World(): ReactNode {
  return (
    <>
      <header className="top">
        <p className="mark">Starter</p>
        <a className="credits" href="/">
          Home
        </a>
      </header>
      <main id="content">
        <p className="kicker">World</p>
        <h1>A separate route.</h1>
        <Reveal>
          <p className="dek">This route loads the Motion island. The blank page does not.</p>
        </Reveal>
      </main>
    </>
  );
}
