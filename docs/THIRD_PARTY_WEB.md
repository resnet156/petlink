# WebGL sources

The application uses Three.js 0.180.0 (MIT), pinned in package-lock.json.
The complete license is retained in [licenses/THREE-LICENSE.txt](licenses/THREE-LICENSE.txt).

- [RoomEnvironment](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/environments/RoomEnvironment.js) and PMREMGenerator provide studio image-based lighting without a third-party HDR service.
- [OrbitControls](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/controls/OrbitControls.js) provides orbit, zoom and touch navigation.
- The contact shadow adapter follows the official [webgl_shadow_contact example](https://github.com/mrdoob/three.js/blob/r180/examples/webgl_shadow_contact.html) and directly imports Three.js HorizontalBlurShader/VerticalBlurShader.
- GLTFLoader loads embedded-texture models and AnimationMixer plays existing named clips.

React Three Fiber and Drei were evaluated, including [Environment](https://drei.docs.pmnd.rs/staging/environment) and [ContactShadows](https://drei.docs.pmnd.rs/staging/contact-shadows). This version reuses their underlying Three.js approach within the existing React 18 renderer; it does not add R3F/Drei dependencies or use remote CDN environment presets.

Pet geometry from uploaded photographs is produced by the separately documented TripoSR pipeline, not by the fallback template. A static generated mesh has no pet-specific skeleton. Bounded whole-object motion is an explicitly labeled telemetry response, not a reconstructed gait or indoor location.
