#!/usr/bin/env python3
"""Bounded, genuine COLMAP sparse reconstruction; never invents a floorplan."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
import time


def main():
    import numpy as np
    import pycolmap
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-seconds", type=int, default=180)
    parser.add_argument("--initial-focal-factor", type=float, default=1.2)
    parser.add_argument("--minimum-initial-angle", type=float, default=16.0)
    parser.add_argument("--affine-sift", action="store_true", help="Use upstream affine-shape and domain-size pooling for a bounded wide-baseline retry")
    args = parser.parse_args()
    os.umask(0o077)
    start = time.monotonic()
    args.output.mkdir(parents=True, mode=0o700, exist_ok=True)
    database = args.output / "database.db"
    images = sorted(p.name for p in args.input_dir.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg"} and p.is_file())
    if not 2 <= len(images) <= 32:
        raise ValueError("Provide 2–32 local photos")
    extraction = pycolmap.FeatureExtractionOptions()
    extraction.num_threads = 4
    extraction.max_image_size = 1600
    extraction.sift.max_num_features = 8192
    if args.affine_sift:
        extraction.sift.max_num_features = 16384
        extraction.sift.estimate_affine_shape = True
        extraction.sift.domain_size_pooling = True
        extraction.sift.peak_threshold = 0.003
    reader = pycolmap.ImageReaderOptions()
    reader.default_focal_length_factor = args.initial_focal_factor
    matching = pycolmap.FeatureMatchingOptions()
    matching.num_threads = 4
    matching.guided_matching = True
    print("Extracting real SIFT features", flush=True)
    pycolmap.extract_features(database, args.input_dir, image_names=images, camera_mode=pycolmap.CameraMode.PER_IMAGE, reader_options=reader, extraction_options=extraction, device=pycolmap.Device.cpu)
    print("Matching and geometrically verifying all pairs", flush=True)
    pycolmap.match_exhaustive(database, matching_options=matching, device=pycolmap.Device.cpu)
    options = pycolmap.IncrementalPipelineOptions()
    options.min_model_size = 2
    options.max_num_models = 3
    options.num_threads = 4
    options.mapper.num_threads = 4
    options.mapper.init_min_tri_angle = args.minimum_initial_angle
    options.random_seed = 42
    options.max_runtime_seconds = max(30, min(args.max_seconds, 600))
    model_dir = args.output / "sparse"
    model_dir.mkdir(exist_ok=True)
    print("Running COLMAP incremental mapping", flush=True)
    models = pycolmap.incremental_mapping(database, args.input_dir, model_dir, options=options)
    with sqlite3.connect(database) as db:
        names = dict(db.execute("SELECT image_id, name FROM images"))
        features = [{"image": names[i], "keypoints": rows} for i, rows in db.execute("SELECT image_id, rows FROM keypoints")]
        pairs = []
        for pair_id, rows, config in db.execute("SELECT pair_id, rows, config FROM two_view_geometries"):
            first, second = divmod(pair_id, 2147483647)
            pairs.append({"images": [names[first], names[second]], "verifiedInliers": rows, "geometryConfiguration": config})
    summaries = []
    for model_id, model in models.items():
        dest = model_dir / str(model_id)
        dest.mkdir(exist_ok=True)
        model.write(dest)
        model.write_text(dest)
        ply_path = args.output / f"sparse-{model_id}.ply"
        model.export_PLY(ply_path)
        cameras = []
        for image_id in model.reg_image_ids():
            image = model.images[image_id]
            camera = model.cameras[image.camera_id]
            pose = image.cam_from_world()
            center = pose.inverse().translation
            cameras.append({"image": image.name, "center": center.tolist(), "cameraModel": str(camera.model_name), "cameraParameters": camera.params.tolist(), "worldToCamera": pose.matrix().tolist()})
        points = [{"xyz": p.xyz.tolist(), "color": p.color.tolist(), "reprojectionErrorPixels": p.error, "trackLength": p.track.length()} for p in model.points3D.values()]
        data = {"cameras": cameras, "points": points}
        (args.output / f"sparse-{model_id}.json").write_text(json.dumps(data, ensure_ascii=False))
        summaries.append({"id": model_id, "registeredImages": len(cameras), "imageNames": [c["image"] for c in cameras], "points3D": len(points), "meanReprojectionErrorPixels": float(model.compute_mean_reprojection_error()), "meanTrackLength": float(model.compute_mean_track_length()), "ply": ply_path.name, "coordinates": f"sparse-{model_id}.json"})
    report = {
        "version": 1, "method": "COLMAP 4.2.1 CPU SIFT + geometric verification + incremental SfM + bundle adjustment",
        "source": "https://github.com/colmap/colmap", "license": "BSD-3-Clause", "engineVersion": pycolmap.__version__,
        "inputImages": len(images), "features": features, "verifiedPairs": sorted(pairs, key=lambda p: p["verifiedInliers"], reverse=True),
        "initialFocalLengthFactor": args.initial_focal_factor, "minimumInitialAngleDegrees": args.minimum_initial_angle, "intrinsicsSource": "No camera calibration/EXIF; initial focal length is assumed and refined by bundle adjustment",
        "affineSift": args.affine_sift,
        "models": sorted(summaries, key=lambda m: m["registeredImages"], reverse=True),
        "registeredImages": max((s["registeredImages"] for s in summaries), default=0), "unit": "relative",
        "floorplanAvailable": False, "denseSurfaceAvailable": False,
        "elapsedSeconds": round(time.monotonic() - start, 2), "createdAt": datetime.now(timezone.utc).isoformat(),
        "limitations": ["结果为真正多视图匹配得到的稀疏点和相机位置，不是完整墙面或稠密室内模型。", "未标定尺寸和重力方向，坐标为任意相似变换下的相对单位，不能直接当成平米或完整户型。", "未注册照片没有足够可靠的几何对应，不能凭空拼入房间。", "单图深度结果没有被冒充为已完成跨视图融合。"],
    }
    (args.output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({"registeredImages": report["registeredImages"], "inputImages": len(images), "models": report["models"], "elapsedSeconds": report["elapsedSeconds"]}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
