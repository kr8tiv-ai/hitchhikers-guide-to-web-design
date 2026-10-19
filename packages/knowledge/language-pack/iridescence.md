---
name: iridescence
webgl: true
family: shader
triggers: iridescence
when-to-use: A product surface that should shift color with the view angle.
---

## Ranges

MeshPhysicalMaterial iridescence 0.8-1, iridescenceIOR 1.2-1.6, iridescenceThicknessRange 100-400. The documented default IOR is 1.3 and the documented thickness range is 100 to 400.

## Snippet

```ts
const skin = new THREE.MeshPhysicalMaterial({
  iridescence: 1,
  iridescenceIOR: 1.3,
  iridescenceThicknessRange: [100, 400],
  roughness: 0.12,
});
```

## Performance

Iridescence is a material term, not a second render pass. Keep it on the hero mesh.

## Reduced motion

The material can stay. A view-angle shift that depends on a moving camera stops with the camera.

## Source

The field names and the default IOR and thickness follow three.js MeshPhysicalMaterial at https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial. The 0.8-1 strength window is our starting point.
