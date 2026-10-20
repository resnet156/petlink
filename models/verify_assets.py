"""Verify downloaded model identity without loading pickle/checkpoints."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / "weights-provenance.json").read_text())
for name, subdir in [("TripoSR", "triposr"), ("DepthAnythingV2Small", "depth-anything")]:
    item = manifest[name]
    path = ROOT / ".private/weights" / subdir / item["file"]
    if path.stat().st_size != item["size"]:
        raise ValueError(f"Incomplete model asset: {name}")
    digest = hashlib.file_digest(path.open("rb"), "sha256").hexdigest()
    if digest != item["sha256"]:
        raise ValueError(f"Model checksum mismatch: {name}")
    print(f"Verified {name}: {digest}")
rembg = ROOT / ".private/weights/rembg/u2net.onnx"
if rembg.stat().st_size != manifest["U2Net"]["size"]:
    raise ValueError("Incomplete U2Net model")
rembg_sha = hashlib.file_digest(rembg.open("rb"), "sha256").hexdigest()
rembg_md5 = hashlib.file_digest(rembg.open("rb"), "md5").hexdigest()
if rembg_sha != manifest["U2Net"]["sha256"] or rembg_md5 != "60024c5c889badc19c04ad937298a77b":
    raise ValueError("U2Net checksum mismatch")
print("Verified U2Net:", rembg_sha)
dino = ROOT / ".private/weights/triposr/dino-config.json"
if hashlib.file_digest(dino.open("rb"), "sha256").hexdigest() != manifest["DinoViTConfig"]["sha256"]:
    raise ValueError("DINO config checksum mismatch")
