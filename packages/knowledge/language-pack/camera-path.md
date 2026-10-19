---
name: camera-path
webgl: true
family: camera
triggers: 3d-hero, camera, showcase
when-to-use: A high-appetite hero or product scene that moves a camera along a path.
---

## Ranges

CatmullRomCurve3 path with 0.12-0.18 lerp damping via maath (pass that window as the smoothTime of damp3). The lookAt target anticipates 0.3-0.5 s. FOV 35-45, with a slight dolly on scroll velocity.

## Snippet

```ts
import * as THREE from "three";
import { damp3 } from "maath/easing";

const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
const look = new THREE.Vector3();
const lead = 0.4;
const ahead = curve.getPointAt(Math.min(1, progress + lead / scrollSeconds));
damp3(camera.position, curve.getPointAt(progress), 0.15, delta);
look.lerp(ahead, 0.2);
camera.lookAt(look);
const kick = Math.min(1, Math.abs(scrollVelocity) / 2000);
camera.fov = 38 + kick * 4;
camera.updateProjectionMatrix();
```

## Performance

One camera and one curve on the shared ticker. Cap the pixel ratio at 2. Pause the loop when the section is off screen.

## Reduced motion

A reduced-motion visit shows the poster and leaves the camera on the first frame. The damp loop stays off.

## Source

CatmullRomCurve3 follows the three.js docs at https://threejs.org/docs/#api/en/extras/curves/CatmullRomCurve3. damp3 follows maath easing at https://github.com/pmndrs/maath. The 0.12-0.18 window is our starting smoothTime, not a library default.
