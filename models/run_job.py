#!/usr/bin/env python3
"""Private local inference adapter for upstream TripoSR and Depth Anything V2.

No image is sent to a third-party API. Model weights and upstream code must be
installed by setup.sh. This program adapts device placement/export only.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import gc
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
PRIVATE = ROOT / ".private"
WEIGHTS = PRIVATE / "weights"
os.environ.setdefault("HF_HOME", str(PRIVATE / "huggingface"))
os.environ.setdefault("U2NET_HOME", str(WEIGHTS / "rembg"))
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("OMP_NUM_THREADS", "4")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path: Path, value):
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temp.replace(path)


def progress(out: Path, stage: str, percent: int):
    value = {"stage": stage, "progress": percent, "updatedAt": datetime.now(timezone.utc).isoformat()}
    write_json(out / "progress.json", value)
    print(json.dumps(value, ensure_ascii=False), flush=True)


def input_image(path: Path, out: Path):
    """Return a decoded oriented RGB image; videos explicitly use one frame."""
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 40_000_000
    limitation = []
    if not path.is_file() or path.stat().st_size > 512 * 1024 * 1024:
        raise ValueError("Input must be a local file no larger than 512 MiB")
    if path.suffix.lower() in {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"}:
        import imageio_ffmpeg
        import numpy as np
        import cv2
        # Uniformly sample the first 12 seconds, then pick the sharpest frame.
        # The local-file protocol allowlist rejects playlist/network references.
        frames = out / "private-frames"
        frames.mkdir(mode=0o700, exist_ok=True)
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file,pipe", "-i", str(path), "-t", "12", "-vf", "fps=1,scale='min(1024,iw)':-2", "-frames:v", "12", "-y", str(frames / "%03d.png")], check=True, timeout=180, stdout=subprocess.DEVNULL)
        candidates = list(frames.glob("*.png"))
        if not candidates:
            raise ValueError("No video frames decoded")
        def sharpness(candidate):
            gray = cv2.imread(str(candidate), cv2.IMREAD_GRAYSCALE)
            return float(cv2.Laplacian(gray, cv2.CV_64F).var())
        selected = max(candidates, key=sharpness)
        im = Image.open(selected).convert("RGB")
        im.save(out / "selected-frame.png")
        shutil.rmtree(frames)
        limitation.append("视频仅从前 12 秒抽帧并选择清晰的一帧重建；未融合多视角，也不生成运动或骨骼。")
    else:
        with Image.open(path) as source:
            if source.format not in {"JPEG", "PNG", "WEBP", "HEIF", "HEIC"}:
                raise ValueError("Supported still formats: JPEG, PNG, WebP")
            im = ImageOps.exif_transpose(source).convert("RGBA" if "A" in source.getbands() else "RGB")
            im.load()
    if min(im.size) < 32:
        raise ValueError("Input is too small")
    im.thumbnail((2048, 2048))
    return im, limitation


def choose_device(requested: str):
    import torch
    torch.set_num_threads(4)
    if requested != "auto":
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def cpu_position_atlas(mesh, atlas, resolution):
    """CPU rasterization of xatlas UVs when a headless OpenGL context is absent.

    Geometry, UV parametrization and neural colors still come from upstream
    TripoSR/xatlas. This only replaces OpenGL's barycentric rasterizer.
    """
    import numpy as np
    xy = atlas["uvs"] * resolution - 0.5
    xyz = mesh.vertices[atlas["vmapping"]]
    positions = np.zeros((resolution, resolution, 4), dtype=np.float32)
    for ids in atlas["indices"]:
        tri, world = xy[ids], xyz[ids]
        lo = np.maximum(np.floor(tri.min(axis=0)).astype(int), 0)
        hi = np.minimum(np.ceil(tri.max(axis=0)).astype(int), resolution - 1)
        if np.any(hi < lo):
            continue
        a, b, c = tri
        denom = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(denom) < 1e-10:
            continue
        xx, yy = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
        w0 = ((b[1] - c[1]) * (xx - c[0]) + (c[0] - b[0]) * (yy - c[1])) / denom
        w1 = ((c[1] - a[1]) * (xx - c[0]) + (a[0] - c[0]) * (yy - c[1])) / denom
        w2 = 1 - w0 - w1
        mask = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        tile = positions[lo[1]:hi[1]+1, lo[0]:hi[0]+1]
        interpolated = w0[..., None] * world[0] + w1[..., None] * world[1] + w2[..., None] * world[2]
        tile[mask, :3] = interpolated[mask]
        tile[mask, 3] = 1
    return positions


def textured_mesh(mesh, model, scene, resolution):
    import numpy as np
    import torch
    import trimesh
    from PIL import Image
    from scipy.ndimage import distance_transform_edt
    from tsr.bake_texture import make_atlas, rasterize_position_atlas
    padding = max(2, round(resolution / 256))
    atlas = make_atlas(mesh, resolution, padding)
    try:
        pos = rasterize_position_atlas(mesh, atlas["vmapping"], atlas["indices"], atlas["uvs"], resolution, padding)
        rasterizer = "TripoSR/ModernGL"
    except Exception as error:
        print(f"OpenGL rasterizer unavailable ({type(error).__name__}); using CPU UV rasterization", file=sys.stderr, flush=True)
        pos = cpu_position_atlas(mesh, atlas, resolution)
        rasterizer = "xatlas/CPU barycentric rasterization"
    valid = pos[..., 3] > 0
    query = torch.from_numpy(pos[..., :3][valid].copy()).to(scene.device)
    with torch.inference_mode():
        colors = model.renderer.query_triplane(model.decoder, query, scene)["color"].cpu().numpy()
    pixels = np.zeros((resolution, resolution, 3), dtype=np.uint8)
    pixels[valid] = np.clip(colors * 255, 0, 255).astype(np.uint8)
    # Extend color into empty texels to avoid black bilinear-filter seams.
    nearest = distance_transform_edt(~valid, return_distances=False, return_indices=True)
    pixels[~valid] = pixels[tuple(nearest[:, ~valid])]
    texture = Image.fromarray(np.flipud(pixels).copy())
    material = trimesh.visual.material.PBRMaterial(baseColorTexture=texture, metallicFactor=0.0, roughnessFactor=1.0, doubleSided=True)
    visual = trimesh.visual.TextureVisuals(uv=atlas["uvs"], material=material)
    output = trimesh.Trimesh(vertices=mesh.vertices[atlas["vmapping"]], faces=atlas["indices"], vertex_normals=mesh.vertex_normals[atlas["vmapping"]], visual=visual, process=False)
    return output, texture, rasterizer


def run_pet(im, out: Path, device: str, resolution: int, texture_size: int):
    import numpy as np
    import torch
    from PIL import Image
    import rembg
    sys.path.insert(0, str(ROOT / "vendor" / "TripoSR"))
    # TripoSR's DINO tokenizer fetches only a config, never another checkpoint.
    # Bind its pinned local copy so inference cannot make network requests.
    from tsr.models.tokenizers import image as image_tokenizer
    def local_dino_config(repo_id, filename, **kwargs):
        if repo_id != "facebook/dino-vitb16" or filename != "config.json":
            raise ValueError("Unexpected upstream model configuration")
        return str(WEIGHTS / "triposr" / "dino-config.json")
    image_tokenizer.hf_hub_download = local_dino_config
    from tsr.system import TSR
    from tsr.utils import remove_background, resize_foreground
    progress(out, "remove_background", 10)
    session = rembg.new_session("u2net", providers=["CPUExecutionProvider"])
    masked = remove_background(im, session)
    masked.save(out / "foreground.png")
    masked = resize_foreground(masked, 0.85)
    rgba = np.asarray(masked).astype(np.float32) / 255.0
    rgb = rgba[:, :, :3] * rgba[:, :, 3:4] + (1 - rgba[:, :, 3:4]) * 0.5
    conditioned = Image.fromarray(np.clip(rgb * 255, 0, 255).astype(np.uint8))
    conditioned.save(out / "conditioning.png")
    del session
    gc.collect()
    progress(out, "load_triposr", 20)
    model = TSR.from_pretrained(str(WEIGHTS / "triposr"), config_name="config.yaml", weight_name="model.ckpt")
    model.renderer.set_chunk_size(8192)
    model.to(device).eval()
    progress(out, "infer_triplane", 35)
    with torch.inference_mode():
        codes = model([conditioned], device=device)
    progress(out, "extract_mesh", 55)
    model.set_marching_cubes_resolution(resolution)
    upstream_mc = model.isosurface_helper.mc_func
    # torchmcubes implements CPU and CUDA; MPS grid extraction uses its CPU code.
    model.isosurface_helper.mc_func = lambda grid, threshold: upstream_mc(grid.detach().cpu().contiguous(), threshold)
    with torch.inference_mode():
        mesh = model.extract_mesh(codes, has_vertex_color=True, resolution=resolution)[0]
    if len(mesh.vertices) < 20 or len(mesh.faces) < 20:
        raise RuntimeError("Upstream model produced an empty/invalid surface")
    progress(out, "bake_texture", 70)
    mesh, texture, rasterizer = textured_mesh(mesh, model, codes[0], texture_size)
    texture.save(out / "texture.png")
    # TripoSR is Z-up; glTF and the web viewer use Y-up. This is a rigid rotation.
    import trimesh
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
    mesh.export(out / "model.glb", file_type="glb")
    progress(out, "render_preview", 90)
    with torch.inference_mode():
        views = model.render(codes, n_views=4, elevation_deg=10, height=160, width=160, return_type="pil")[0]
    preview = Image.new("RGB", (640, 160), "white")
    for i, view in enumerate(views):
        preview.paste(view, (i * 160, 0))
    preview.save(out / "preview.png")
    return {
        "method": "TripoSR: official pretrained single-image 3D reconstruction + xatlas texture bake",
        "engine": "TripoSR", "license": "MIT", "unit": "relative", "device": device,
        "source": "https://github.com/VAST-AI-Research/TripoSR", "sourceRevision": "107cefdc244c39106fa830359024f6a2f1c78871",
        "weights": "stabilityai/TripoSR", "geometryResolution": resolution, "textureResolution": texture_size,
        "vertices": len(mesh.vertices), "faces": len(mesh.faces), "textureRasterizer": rasterizer,
        "limitations": ["单张照片重建：背面、遮挡处和画面外部由预训练模型估计，不能保证与真实宠物一致。", "模型为无骨骼静态网格，项圈动作只能驱动整体姿态，未生成宠物专属关节动画。", "尺寸为相对单位；不能从单张图推断真实体长、体重或健康状态。"],
    }


def run_room(im, out: Path, device: str):
    import cv2
    import numpy as np
    import torch
    import trimesh
    from PIL import Image
    sys.path.insert(0, str(ROOT / "vendor" / "Depth-Anything-V2"))
    from depth_anything_v2.dpt import DepthAnythingV2
    progress(out, "load_depth_anything_v2", 20)
    model = DepthAnythingV2(encoder="vits", features=64, out_channels=[48, 96, 192, 384])
    model.load_state_dict(torch.load(WEIGHTS / "depth-anything" / "depth_anything_v2_vits.pth", map_location="cpu", weights_only=True))
    model.to(device).eval()
    rgb = np.asarray(im.convert("RGB"))
    progress(out, "infer_relative_depth", 40)
    with torch.inference_mode():
        inverse_depth = model.infer_image(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    if not np.isfinite(inverse_depth).all():
        raise RuntimeError("Non-finite depth from upstream model")
    lo, hi = np.percentile(inverse_depth, [2, 98])
    if hi - lo < 1e-6:
        raise RuntimeError("Image has no usable depth variation")
    normalized = np.clip((inverse_depth - lo) / (hi - lo), 0, 1)
    heatmap = cv2.applyColorMap((normalized * 255).astype(np.uint8), cv2.COLORMAP_INFERNO)
    Image.fromarray(cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)).save(out / "preview.png")
    np.save(out / "relative-depth.npy", inverse_depth)
    progress(out, "export_visible_surface", 75)
    sampling_scale = min(256 / rgb.shape[1], 256 / rgb.shape[0], 1.0)
    width = max(2, round(rgb.shape[1] * sampling_scale))
    height = max(2, round(rgb.shape[0] * sampling_scale))
    depth = 1.0 / (0.25 + cv2.resize(normalized, (width, height), interpolation=cv2.INTER_AREA))
    yy, xx = np.mgrid[0:height, 0:width]
    focal = 0.5 * width / math.tan(math.radians(55) / 2)
    vertices = np.stack(((xx - (width-1)/2) * depth / focal, -(yy - (height-1)/2) * depth / focal, -depth), axis=-1).reshape(-1, 3)
    idx = np.arange(width * height).reshape(height, width)
    a, b, c, d = idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, :-1].ravel(), idx[1:, 1:].ravel()
    faces = np.concatenate((np.stack((a, c, b), axis=1), np.stack((b, c, d), axis=1)))
    # Do not bridge large foreground/background discontinuities with triangles.
    z = depth.ravel()[faces]
    faces = faces[(z.max(axis=1) - z.min(axis=1)) < 0.25]
    uv = np.stack((xx / (width-1), 1-yy / (height-1)), axis=-1).reshape(-1, 2)
    material = trimesh.visual.material.PBRMaterial(baseColorTexture=im.convert("RGB"), metallicFactor=0.0, roughnessFactor=1.0, doubleSided=True)
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, visual=trimesh.visual.TextureVisuals(uv=uv, material=material), process=False)
    mesh.export(out / "model.glb", file_type="glb")
    revision = subprocess.check_output(["git", "-C", str(ROOT / "vendor" / "Depth-Anything-V2"), "rev-parse", "HEAD"], text=True).strip()
    return {
        "method": "Depth Anything V2 Small: official relative-depth inference + visible surface projection",
        "engine": "Depth-Anything-V2-Small", "license": "Apache-2.0", "unit": "relative", "device": device,
        "source": "https://github.com/DepthAnything/Depth-Anything-V2", "sourceRevision": revision,
        "weights": "depth-anything/Depth-Anything-V2-Small", "vertices": len(vertices), "faces": len(faces),
        "floorplanAvailable": False, "assumedHorizontalFovDegrees": 55,
        "limitations": ["仅重建照片中可见表面的相对深度；照片外的房间、背面和被遮挡结构未知。", "未进行相机标定；55° 视场角及深度归一化仅用于展示，单位不是米。", "单张普通照片不能恢复可靠完整户型：此结果不包含可测量的 2D 平面图。", "这个网格适合原视点附近查看，转到背面会看到开放表面。"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--kind", choices=("pet", "room"), required=True)
    parser.add_argument("--device", choices=("auto", "mps", "cpu", "cuda"), default="auto")
    parser.add_argument("--resolution", type=int, choices=(128, 192, 256), default=192)
    parser.add_argument("--texture-size", type=int, choices=(512, 1024, 2048), default=1024)
    args = parser.parse_args()
    os.umask(0o077)
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, mode=0o700, exist_ok=True)
    started = time.monotonic()
    # Cache keys include adapter revision/options; private cache never enters Git.
    digest = sha256(args.input)
    cache_key = hashlib.sha256(f"v1:{args.kind}:{digest}:{args.resolution}:{args.texture_size}".encode()).hexdigest()
    cache = PRIVATE / "cache" / cache_key
    if (cache / "result.json").is_file() and (cache / "model.glb").is_file():
        for file in cache.iterdir():
            if file.is_file():
                shutil.copy2(file, args.output / file.name)
        progress(args.output, "complete_cached", 100)
        return
    progress(args.output, "decode_input", 2)
    im, input_limits = input_image(args.input.resolve(), args.output)
    device = choose_device(args.device)
    result = run_pet(im, args.output, device, args.resolution, args.texture_size) if args.kind == "pet" else run_room(im, args.output, device)
    result["limitations"] += input_limits
    result.update({"version": 1, "kind": args.kind, "inputSha256": digest, "modelSha256": sha256(args.output / "model.glb"), "elapsedSeconds": round(time.monotonic() - started, 2), "createdAt": datetime.now(timezone.utc).isoformat()})
    origin = ROOT / "weights-provenance.json"
    if origin.exists():
        result["weightsProvenance"] = json.loads(origin.read_text())
    write_json(args.output / "result.json", result)
    progress(args.output, "complete", 100)
    cache.mkdir(parents=True, mode=0o700, exist_ok=True)
    for name in ("model.glb", "preview.png", "result.json", "texture.png"):
        file = args.output / name
        if file.is_file():
            shutil.copy2(file, cache / name)


if __name__ == "__main__":
    main()
