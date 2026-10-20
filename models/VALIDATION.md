# Verified reconstruction behavior — 2026-10-10

Environment: Apple M5, 16 GB unified memory, Python 3.12.14, PyTorch 2.14.1,
Metal (MPS) available, headless OpenGL 4.1. All installation happened in a local
virtual environment. The production web server did not run inference.

## Real user photographs

The user supplied one Shiba photograph and five photographs of the same room.
Source images, intermediate images, generated GLBs, matching diagnostics and
point clouds remain private and are **not included in this repository**.

| Test | Verified outcome |
|---|---|
| Shiba / official TripoSR | Completed in 24.57 seconds, including foreground removal, neural inference, surface extraction, xatlas texture baking and four-view rendering. |
| Shiba GLB | 2,744,956 bytes; 37,905 vertices; 49,864 triangles; 1024² embedded texture. No buffer/image external URI. |
| Shiba visual inspection | Four views show the dog's ears, curled tail, coat and harness. Back side and cropped feet have inferred geometry errors. Static mesh; no bones or learned gait. |
| Identical pet upload cache | Cache hit verified; identical embedded GLB reused in approximately 0.1 seconds. |
| First user room photo / official Depth Anything V2 Small | Completed in 3.52 seconds; 43,776 vertices, 85,590 triangles; 3,267,848-byte GLB with an embedded photo texture. |
| Room scope | Visible-surface relative depth only. No measured floorplan, actual dimensions, invisible walls or fused five-view dense model. |

The two model checkpoints were verified against official Hugging Face LFS
SHA-256 values. U-2-Net matched both the known MD5 in official rembg and the
recorded SHA-256. `validate_result.py` checked GLB headers, embedded images,
geometry presence, artifact hash, relative units, preview and limitations.

An additional **upstream test fixture** (`Depth-Anything-V2/assets/examples/demo10.jpg`,
not the user's room) verified table/chair/window depth ordering. It produced
42,496 vertices and 80,758 triangles. This fixture result is separate from the
real user-photo tests above.

## Five-photo COLMAP experiment

This is actual CPU photogrammetry with official PyCOLMAP 4.2.1, rather than a
manual room shape or a claim of merging independent monocular depth maps.
Three bounded attempts were run with an uncalibrated per-image SIMPLE_RADIAL
camera model. Unknown focal lengths were initialized, then refined by bundle
adjustment; no metric calibration was supplied.

| Attempt | Settings | Registered photos |
|---|---|---|
| Standard SIFT | Initial focal factor 1.2, initial triangulation angle 16° | 0 / 5 |
| Wide-angle initialization | Initial focal factor 0.6, initial angle 8° | 0 / 5 |
| Affine / domain-size pooling SIFT | Initial focal factor 0.7, initial angle 8°, upstream affine-shape/DSP options | **3 / 5**: photos 1, 3 and 5 |

The successful partial model has **67 triangulated feature points**, mean
reprojection error **1.0845 pixels**, and mean track length **2.4925 views**.
Geometrically verified matches in the final attempt: 1↔3 = 364, 1↔5 = 156,
3↔5 = 108, 2↔4 = 58; all other pairs = 0. Photos 2 and 4 could not be registered.

Visual inspection of the actual triangulated observations found that many
points concentrate around the window/window exterior, with some bed and other
interior features. Therefore **this sparse model is not a reconstruction of the
complete room boundary**. Its camera positions and feature points are useful
diagnostics, but do not justify a measured floorplan, full wall geometry or a
claim that all five photos have fused. The private outputs include the native
COLMAP model, PLY, coordinates, per-attempt reports, annotated observations and
a 3D / coordinate-projection plot. The projection is explicitly not a floorplan.

Recovering a trustworthy room plan still needs more overlapping capture and
real dimensions/calibration or manual dimensional assistance. No arbitrary
rectangle or fabricated scale was substituted.

## Video engineering fixture (not real-pet evidence)

A private three-second, 320×240 MP4 was generated with FFmpeg's synthetic
`testsrc` pattern. It validates the local-file MP4 decoder, one-frame-per-second
sampling, sharpness-based frame selection and the explicit single-frame
limitation message. It is **not** a user video, live-pet test, motion capture,
multi-frame reconstruction or an additional neural-inference test. This fixture
was not uploaded to production.

## Reproduction

Main engines use `requirements-core.lock`; the optional COLMAP/plotting
superset is pinned in `requirements.lock`. Run `WITH_MULTIVIEW=1 bash setup.sh`
to install that superset. Private paths are passed to the CLI at runtime:

```sh
.venv/bin/python run_job.py --kind pet --input /private/pet.png --output /private/pet-result
.venv/bin/python run_job.py --kind room --input /private/room.png --output /private/room-result
.venv/bin/python validate_result.py /private/pet-result
.venv/bin/python run_multiview.py --input-dir /private/room-photos --output /private/sfm --initial-focal-factor 0.7 --minimum-initial-angle 8 --affine-sift --max-seconds 120
.venv/bin/python plot_sparse.py /private/sfm/sparse-0.json --output /private/sparse-preview.png
```

`run_multiview.py` always writes an honest report when mapping completes,
including zero registered images if initialization fails. Inspect
`registeredImages` and model coverage; process exit alone does not imply a
successful reconstruction. This optional diagnostic pipeline is separate from
the production single-image queue and does not replace it.
