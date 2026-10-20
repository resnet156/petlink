# PetLink local reconstruction engines

This worker runs real, existing pretrained models on the Mac. The 4 GB web
server only queues authenticated uploads and stores the resulting artifacts;
it does not load neural models or compete with the server's other business.

## Engines and scope

| Input | Reused implementation | Actual result | Limits |
|---|---|---|---|
| Pet photo | [TripoSR](https://github.com/VAST-AI-Research/TripoSR), official MIT checkpoint; [rembg](https://github.com/danielgatis/rembg)/[U-2-Net](https://github.com/xuebinqin/U-2-Net) for foreground; [xatlas](https://github.com/jpcy/xatlas) for UVs | Predicted 3D surface, neural color texture, embedded-texture GLB, four-view neural preview | Hidden geometry is inferred; cropped/occluded parts may be wrong. Static unrigged mesh, relative dimensions. |
| Room photo | [Depth Anything V2 Small](https://github.com/DepthAnything/Depth-Anything-V2), official Apache-2.0 Small checkpoint | Relative depth preview, textured visible-surface GLB | Open 2.5D surface, assumed camera field of view, no measured dimensions, no unseen room geometry, no reliable complete floorplan. |
| Video | Bundled FFmpeg decodes up to 12 representative frames; sharpness selects one | Same single-image engine as above | Explicitly **single-frame reconstruction**, not multi-view fusion, motion capture, 4D reconstruction or skeletal animation. |

There is no hand-authored pet mesh or cuboid room substituted for model output.
The adapter only handles preprocessing, device placement, UV rasterization and
GLB export. TripoSR's transformer/triplane/decoder and all pretrained weights are
unchanged. TripoSR marching cubes runs on CPU because upstream torchmcubes
supports CPU/CUDA, not Metal. Network inference uses MPS when available.

## Install

Python 3.12 and macOS Command Line Tools are required. A project-local `.venv`
and `.private` directory are used; global Python packages are not changed.

```sh
PYTHON_BIN=/path/to/python3.12 bash setup.sh
```

`setup.sh` clones exact source revisions, installs `requirements-core.lock`, and
verifies the two neural checkpoints against authoritative Hugging Face LFS
SHA-256 values in `weights-provenance.json`. U-2-Net is additionally checked by
the known MD5 from rembg's official session implementation. A trusted PyPI mirror may be selected with
`PIP_INDEX_URL`; the original deployment used the Tsinghua mirror because the
official Python CDN was very slow on this network.

Weights total approximately 2 GB. Allow several additional GB for Python,
PyTorch, temporary downloads and runtime memory. Run one inference at a time on
the 16 GB Mac. Do not install the inference environment on the small web server.

## CLI and job worker contract

```sh
.venv/bin/python run_job.py --kind pet --input /private/pet.png --output /private/result
.venv/bin/python run_job.py --kind room --input /private/room.jpg --output /private/result
```

`--device auto|mps|cpu|cuda` defaults to auto. For unsupported Metal operators,
PyTorch's CPU fallback is enabled. To force a completely CPU run, pass
`--device cpu`. Pet extraction uses a 192³ density grid and 1024² texture by
default; `--resolution 128|192|256` and `--texture-size 512|1024|2048` allow
explicit speed/quality choices. A larger grid cannot recover details absent
from the source image or invent a faithful unseen side.

The parent process must serialize jobs and enforce a runtime budget. A nonzero
exit means failure: never publish partial files as a successful generation.
Completion is indicated by atomically written `result.json`, which includes
the engine/method, source revision, model/input SHA-256, relative units,
limitations, runtime, geometry counts and device. `progress.json` and JSON lines
on stdout give stage/progress updates. Diagnostic libraries may write stderr.

Successful public artifacts are `model.glb`, `preview.png`, and `result.json`.
`texture.png` is optional. No `layout.json` is emitted for a single ordinary
room photo because a reliable complete 2D floorplan is unavailable. The API/UI
must show that limitation explicitly instead of substituting a guessed room.

`foreground.png`, `conditioning.png`, `selected-frame.png` and
`relative-depth.npy` are private diagnostic intermediates and must not be
automatically published. Source photo EXIF is removed by decoding/re-encoding.
No image is sent to an external AI API. Inference uses predownloaded weights
with Hugging Face offline mode. Installation downloads public code and weights.

Completed results are reused by a private SHA-256 cache keyed on input bytes,
engine and generation settings. Clear `.private/cache` to discard cached
artifacts. Do not commit `.private`, `.venv`, source photos, generated pet
artifacts or model weights.

## Licenses and provenance

| Component | License | Pinned source |
|---|---|---|
| TripoSR code + weights | MIT | `107cefdc244c39106fa830359024f6a2f1c78871`; HF `5b521936b01fbe1890f6f9baed0254ab6351c04a` |
| Depth Anything V2 code + Small weights | Apache-2.0 | `a561b849ebae10a6f5ef49e26c83cbbcd36c71bf`; HF `03876f8651c73a60fe4c2c48294e09fcb6838fcf` |
| torchmcubes | MPL-2.0 | `879926d0ef58e6ce0ac2630fdecb5e53af7ed3ff`; unmodified |
| xatlas | MIT | Python package 0.0.11 |
| rembg | MIT | Python package 2.0.85 |
| U-2-Net | Apache-2.0 | Upstream U2Net ONNX release linked in provenance |

Upstream license texts remain in `vendor/*` after installation. This project
uses only Depth Anything **Small**, not the Base/Large/Giant checkpoints whose
licenses differ. Redistribution must preserve upstream notices and MPL source
availability for torchmcubes. Bundled FFmpeg's own license accompanies its
binary in the `imageio-ffmpeg` distribution; no codec binary is copied into Git.

## Optional multi-view diagnostics

`WITH_MULTIVIEW=1 bash setup.sh` installs the full `requirements.lock`, which adds official PyCOLMAP 4.2.1 and Matplotlib 3.11.2. They are excluded from the default main-engine install. `run_multiview.py` performs real SIFT matching, geometric verification, triangulation and bundle adjustment. Its report explicitly records registered / unregistered cameras and sparse point counts; it never fabricates a dense mesh or floorplan. `plot_sparse.py` plots the actual coordinates and camera poses. See [VALIDATION.md](VALIDATION.md) for real-photo results, the partial 3/5-camera experiment, and the separate synthetic-video engineering check. COLMAP is BSD-3-Clause; its notice is preserved in `third-party-notices/`.
