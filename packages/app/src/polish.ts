/**
 * Screens the polish pass visits. `states` are fixture names the e2e
 * harness prepares. They are not new product routes.
 */

export interface AppRoute {
  path: string;
  states: string[];
}

export function listAppRoutes(): AppRoute[] {
  return [
    { path: "/", states: ["question"] },
    { path: "/gallery", states: ["walk", "empty"] },
    { path: "/motion", states: ["preview"] },
    { path: "/brand", states: ["empty", "kit"] },
    { path: "/approve", states: ["empty", "gate"] },
    { path: "/hh-dashboard", states: ["empty", "queue", "error"] },
    { path: "/before-jump", states: ["open", "clear"] },
    { path: "/missing", states: ["error"] },
  ];
}
