/// <reference lib="dom" />

import { ensureSharedTicker, markLive, onSharedTick, paintStill, runWhenVisible } from "../slider.ts";

export interface TheatrePreviewState {
  sheetsById: {
    Preview: {
      staticOverrides: { byObject: Record<string, never> };
      sequence: {
        type: "PositionalSequence";
        length: number;
        subUnitsPerUnit: number;
        tracksByObject: {
          Mark: {
            trackIdByPropPath: { '["x"]': string };
            trackData: {
              x: {
                type: "BasicKeyframedTrack";
                __debugName: string;
                keyframes: Array<{
                  id: string;
                  position: number;
                  value: number;
                  type: "bezier";
                  connectedRight: boolean;
                  handles: [number, number, number, number];
                }>;
              };
            };
          };
        };
      };
    };
  };
  definitionVersion: "0.4.0";
  revisionHistory: string[];
}

export const THEATRE_PREVIEW_STATE: TheatrePreviewState = {
  sheetsById: {
    Preview: {
      staticOverrides: { byObject: {} },
      sequence: {
        type: "PositionalSequence",
        length: 2,
        subUnitsPerUnit: 30,
        tracksByObject: {
          Mark: {
            trackIdByPropPath: { '["x"]': "x" },
            trackData: {
              x: {
                type: "BasicKeyframedTrack",
                __debugName: "x",
                keyframes: [
                  {
                    id: "a",
                    position: 0,
                    value: 0,
                    type: "bezier",
                    connectedRight: true,
                    handles: [0.5, 1, 0.5, 0],
                  },
                  {
                    id: "b",
                    position: 2,
                    value: 48,
                    type: "bezier",
                    connectedRight: true,
                    handles: [0.5, 1, 0.5, 0],
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
  definitionVersion: "0.4.0",
  revisionHistory: ["hh-motion-preview"],
};

interface TheatreApi {
  getProject: (id: string, config?: { state?: object }) => TheatreProject;
  createRafDriver: (conf: { name?: string; start?: () => void; stop?: () => void }) => { tick: (time: number) => void };
}

interface TheatreProject {
  sheet: (name: string) => TheatreSheet;
}

interface TheatreSheet {
  object: (name: string, props: { x: number }) => {
    onValuesChange: (fn: (values: { x: number }) => void) => () => void;
  };
  sequence: {
    play: (opts: { rafDriver: { tick: (time: number) => void }; iterationCount: number; range: [number, number] }) => Promise<unknown>;
    pause?: () => void;
    position: number;
  };
}

function isState(value: unknown): value is TheatrePreviewState {
  if (value === null || typeof value !== "object") return false;
  const record = value as { definitionVersion?: unknown; sheetsById?: unknown };
  return record.definitionVersion === "0.4.0" && typeof record.sheetsById === "object" && record.sheetsById !== null;
}

function readApi(loaded: { default?: TheatreApi; getProject?: TheatreApi["getProject"]; createRafDriver?: TheatreApi["createRafDriver"] }): TheatreApi {
  if (loaded.default !== undefined && typeof loaded.default.getProject === "function") return loaded.default;
  if (typeof loaded.getProject === "function" && typeof loaded.createRafDriver === "function") {
    return { getProject: loaded.getProject, createRafDriver: loaded.createRafDriver };
  }
  throw new Error("Theatre core did not expose getProject.");
}

export function mountPreviewWithState(el: HTMLElement, state: unknown): Promise<() => void> {
  if (!isState(state)) {
    console.warn("Theatre state JSON is missing. Showing a still.");
    paintStill(el, "Still. The timeline state is missing.");
    return Promise.resolve(() => undefined);
  }
  const ready = state;
  return runWhenVisible(el, async () => {
    await ensureSharedTicker();
    const loaded = await import("@theatre/core");
    const api = readApi(loaded);
    el.innerHTML = '<div class="hh-motion__stage"><span class="hh-motion__orb" data-mark></span></div>';
    const mark = el.querySelector("[data-mark]");
    if (!(mark instanceof HTMLElement)) return () => undefined;
    const project = api.getProject(`hh-preview-${Math.random().toString(36).slice(2, 8)}`, { state: ready });
    const sheet = project.sheet("Preview");
    const obj = sheet.object("Mark", { x: 0 });
    const driver = api.createRafDriver({ name: "hh-preview" });
    const unsubscribe = obj.onValuesChange((values) => {
      mark.style.transform = `translateX(${values.x}px)`;
    });
    markLive(el);
    let clock = 0;
    const off = onSharedTick((_time, delta) => {
      clock += delta;
      const seconds = (clock / 1000) % 2;
      sheet.sequence.position = seconds;
      driver.tick(clock);
    });
    return () => {
      off();
      sheet.sequence.pause?.();
      unsubscribe();
    };
  });
}

export function mountPreview(el: HTMLElement): Promise<() => void> {
  return mountPreviewWithState(el, THEATRE_PREVIEW_STATE);
}
