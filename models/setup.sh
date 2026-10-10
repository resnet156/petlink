#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
umask 077
PYTHON_BIN="${PYTHON_BIN:-python3}"
"$PYTHON_BIN" -m venv .venv
export PATH="$PWD/.venv/bin:$PATH"
python -m pip install --upgrade pip wheel setuptools
if [[ "${WITH_MULTIVIEW:-0}" == "1" && -f requirements.lock ]]; then
  python -m pip install -r requirements.lock
elif [[ -f requirements-core.lock ]]; then
  python -m pip install -r requirements-core.lock
else
  python -m pip install -r requirements.in
fi
mkdir -p vendor .private/weights/triposr .private/weights/depth-anything .private/weights/rembg
clone_pinned() {
  local url="$1" dest="$2" revision="$3"
  if [[ ! -d "$dest/.git" ]]; then
    git clone --filter=blob:none --no-checkout "$url" "$dest"
  fi
  git -C "$dest" fetch --depth 1 origin "$revision"
  git -C "$dest" checkout --detach "$revision"
}
clone_pinned https://github.com/VAST-AI-Research/TripoSR.git vendor/TripoSR 107cefdc244c39106fa830359024f6a2f1c78871
clone_pinned https://github.com/tatsy/torchmcubes.git vendor/torchmcubes 879926d0ef58e6ce0ac2630fdecb5e53af7ed3ff
if [[ ! -d vendor/Depth-Anything-V2/.git ]]; then
  git clone --filter=blob:none --sparse --no-checkout https://github.com/DepthAnything/Depth-Anything-V2.git vendor/Depth-Anything-V2
fi
git -C vendor/Depth-Anything-V2 sparse-checkout set depth_anything_v2
git -C vendor/Depth-Anything-V2 fetch --depth 1 origin a561b849ebae10a6f5ef49e26c83cbbcd36c71bf
git -C vendor/Depth-Anything-V2 checkout --detach a561b849ebae10a6f5ef49e26c83cbbcd36c71bf
python -m pip install --no-build-isolation ./vendor/torchmcubes
python download_asset.py 'https://huggingface.co/stabilityai/TripoSR/resolve/5b521936b01fbe1890f6f9baed0254ab6351c04a/model.ckpt' .private/weights/triposr/model.ckpt 1677246742
python download_asset.py 'https://huggingface.co/depth-anything/Depth-Anything-V2-Small/resolve/03876f8651c73a60fe4c2c48294e09fcb6838fcf/depth_anything_v2_vits.pth' .private/weights/depth-anything/depth_anything_v2_vits.pth 99218434
python download_asset.py 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx' .private/weights/rembg/u2net.onnx 175997641
curl --fail --location --retry 3 --output .private/weights/triposr/config.yaml 'https://huggingface.co/stabilityai/TripoSR/resolve/5b521936b01fbe1890f6f9baed0254ab6351c04a/config.yaml'
curl --fail --location --retry 3 --output .private/weights/triposr/dino-config.json 'https://huggingface.co/facebook/dino-vitb16/resolve/f205d5d8e640a89a2b8ef0369670dfc37cc07fc2/config.json'
python verify_assets.py
