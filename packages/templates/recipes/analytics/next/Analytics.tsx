"use client";

import { useState } from "react";
import { planTrack, type AnalyticsProvider, type Consent } from "../track.ts";

export function Analytics({
  provider,
  event,
}: {
  provider: AnalyticsProvider;
  event: string;
}): React.JSX.Element {
  const [consent, setConsent] = useState<Consent>("unknown");
  const plan = planTrack(provider, event, consent);
  return (
    <div className="hh-consent" data-sent={plan.sent ? "yes" : "no"}>
      {provider === "ga4" ? (
        <>
          <p>This site can record visits with Google Analytics. Nothing is sent until you allow it.</p>
          <button type="button" onClick={() => setConsent("granted")}>
            Allow
          </button>
          <button type="button" onClick={() => setConsent("denied")}>
            Refuse
          </button>
        </>
      ) : (
        <p>Visit recording is on. No banner is required for this provider.</p>
      )}
    </div>
  );
}
