# DOM-synced WebGL layer

The canvas sits over a DOM hero. The poster stays in document flow at its final size and is the LCP image. The canvas uses `position: absolute` and `inset: 0`.

Scroll and pointer values come from the DOM and drive the scene. Call `ScrollTrigger.refresh` after `document.fonts.ready` and again after the preloader overlay lifts.

On page leave, teardown disposes the renderer, geometries, materials, and textures, then clears the one shared context.

The GPU budget is the tier table. Tier 3 caps the pixel ratio at 2 and keeps the grade, grain, and half-resolution bloom. Tier 2 drops bloom. Tier 1 keeps the grade only. Tier 0 is the art-directed still. Width does not select the still.

Color textures use KTX2 etc1s and normals use KTX2 uastc when the scene runs. Meshopt is the default mesh compression when the scene runs. The loop pauses offscreen and while the tab is hidden. Two context losses show the still.

```ts
export function mount(canvas: HTMLCanvasElement, poster: HTMLElement): () => void {
  const opened = beginScene(canvas, poster, readPowerSignals());
  if (opened.mode === "still") return () => {};
  const drive = driveFromDom({ scrollY, maxScroll, pointerX, pointerY, width, height });
  void drive;
  void refreshAfterFonts(() => ScrollTrigger.refresh(), document.fonts.ready);
  return () => {
    teardownScene({ geometries, materials, textures, renderer });
  };
}
```

Source: https://threejs.org/docs/#api/en/renderers/WebGLRenderer
