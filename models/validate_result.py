"""Verify an exported job artifact without fetching any glTF dependencies."""
import argparse
import hashlib
import json
from pathlib import Path
import struct


def validate(directory: Path):
    result = json.loads((directory / "result.json").read_text())
    raw = (directory / "model.glb").read_bytes()
    magic, version, length = struct.unpack_from("<4sII", raw)
    assert (magic, version, length) == (b"glTF", 2, len(raw)), "Invalid GLB header"
    json_length, chunk_type = struct.unpack_from("<I4s", raw, 12)
    assert chunk_type == b"JSON", "Missing glTF JSON chunk"
    doc = json.loads(raw[20:20 + json_length])
    assert doc.get("meshes"), "No actual geometry"
    assert doc.get("images"), "No embedded texture"
    for item in doc.get("buffers", []) + doc.get("images", []):
        assert "uri" not in item, "GLB must be self-contained; external/data URIs rejected"
    assert result["modelSha256"] == hashlib.sha256(raw).hexdigest(), "Artifact hash mismatch"
    assert result["unit"] == "relative", "Uncalibrated single-image result must use relative units"
    assert result["limitations"], "Model limitations must be disclosed"
    assert (directory / "preview.png").is_file(), "Missing preview"
    print(json.dumps({"valid": True, "kind": result["kind"], "engine": result["engine"], "glbBytes": len(raw), "vertices": result["vertices"], "faces": result["faces"], "embeddedTextures": len(doc["images"]), "sha256": result["modelSha256"]}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    validate(args.directory)
