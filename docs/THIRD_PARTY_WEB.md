# WebGL sources

The application uses Three.js 0.180.0 (MIT), pinned in package-lock.json.
The complete license is retained in [licenses/THREE-LICENSE.txt](licenses/THREE-LICENSE.txt).

- [RoomEnvironment](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/environments/RoomEnvironment.js) and PMREMGenerator provide studio image-based lighting without a third-party HDR service.
- [OrbitControls](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/controls/OrbitControls.js) provides orbit, zoom and touch navigation.
- The contact shadow adapter follows the official [webgl_shadow_contact example](https://github.com/mrdoob/three.js/blob/r180/examples/webgl_shadow_contact.html) and directly imports Three.js HorizontalBlurShader/VerticalBlurShader.
- GLTFLoader loads embedded-texture models and AnimationMixer plays existing named clips.

React Three Fiber and Drei were evaluated, including [Environment](https://drei.docs.pmnd.rs/staging/environment) and [ContactShadows](https://drei.docs.pmnd.rs/staging/contact-shadows). This version reuses their underlying Three.js approach within the existing React 18 renderer; it does not add R3F/Drei dependencies or use remote CDN environment presets.

Pet geometry from uploaded photographs is produced by the separately documented TripoSR pipeline, not by the fallback template. A static generated mesh has no pet-specific skeleton. Bounded whole-object motion is an explicitly labeled telemetry response, not a reconstructed gait or indoor location.

The default animated Shiba avatar is adapted from Quaternius's [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html), specifically the original author's [Shiba Inu GLB](https://poly.pizza/m/y4wdQpg767), released into the public domain under CC0. The source GLB SHA-256 is `9cbd4f1e12f85024126eab6a2c5706c099196df1a10db74e6c8b67bac3fff54a`. Our character may have adjusted proportions and materials; its 46-joint skeleton and source animation clips are preserved. The original author's character is a stock animated avatar inspired by the uploaded orange-and-cream Shiba photograph; it is not an automatically rigged reconstruction of that photograph. Photo/video reconstruction remains available separately as a static textured GLB.
