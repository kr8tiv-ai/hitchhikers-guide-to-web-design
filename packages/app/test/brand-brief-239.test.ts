import assert from "node:assert/strict";
import { test } from "node:test";
import { approveMain } from "../src/server/brief-page.ts";
import type { BriefDeskView } from "@hitchhiker/engine";

function desk(): BriefDeskView {
  return {
    status: "pending",
    draft: {
      goal: "A calm page.",
      visitor: "A neighbor.",
      action: "Write.",
      offer: "Tea.",
      vibe: "Quiet.",
      references: "Kinfolk, Aesop, Patagonia, Linear.",
      exists: "No.",
      protected: "None.",
      motion: "Still.",
      limits: "None.",
      hosting: "Local.",
      maintainer: "The owner.",
      pages: "Home.",
      features: "A contact form.",
      cadence: "None.",
      languages: "English.",
      imagery: "Photos.",
      budget: "None.",
      session: "One hour.",
      logo: "None.",
      palette: "Ink.",
      coverage: "Covered.",
    },
    sources: [],
    note: "",
    error: "",
    fallback: false,
    buildStarted: false,
    planApproved: false,
    phase: "plan",
    statusLine: "",
  } as BriefDeskView;
}

test("the brand kit renders on the brief page", () => {
  const markdown = "# Brand\n\n## Palette\n\nPaper #f4f1ea carries ink #1a1a1a.";
  const html = approveMain("token", desk(), "", undefined, "", markdown);
  assert.match(html, /data-brand-kit/);
  assert.match(html, /Paper #f4f1ea/);
  const empty = approveMain("token", desk());
  assert.equal(empty.includes("data-brand-kit"), false);
});
