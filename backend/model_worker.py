"""Local inference worker. Outbound HTTPS only; never exposes the Mac filesystem to the server."""
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import uuid

import httpx


def main():
    def terminate(signum, frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, terminate)
    base = os.environ["PETLINK_API_BASE"].rstrip("/")
    if not base.startswith("https://"):
        raise SystemExit("Inference worker requires verified HTTPS")
    token = os.environ["PETLINK_WORKER_TOKEN"]
    engine_python = os.environ["PETLINK_ENGINE_PYTHON"]
    engine_script = os.environ["PETLINK_ENGINE_SCRIPT"]
    avatar_script = os.environ.get("PETLINK_AVATAR_ENGINE_SCRIPT", "").strip()
    avatar_python = os.environ.get("PETLINK_AVATAR_ENGINE_PYTHON", engine_python)
    work = Path(os.environ["PETLINK_WORKER_DATA"]).resolve()
    work.mkdir(parents=True, exist_ok=True, mode=0o700)
    capabilities = [item.strip() for item in os.environ.get("PETLINK_MODEL_CAPABILITIES", "pet,room").split(",") if item.strip()]
    if "pet_avatar" in capabilities and (not avatar_script or not Path(avatar_script).is_file()):
        raise SystemExit("pet_avatar capability requires PETLINK_AVATAR_ENGINE_SCRIPT")
    worker_id = uuid.uuid4().hex
    client = httpx.Client(headers={"Authorization": "Bearer " + token}, timeout=60, follow_redirects=False)

    def post(path, data=None, **kwargs):
        r = client.post(base + path, json=data, **kwargs) if not kwargs else client.post(base + path, **kwargs)
        r.raise_for_status()
        return r.json()

    def progress(job, stage, error=None):
        return post(f"/worker/jobs/{job['id']}/progress", {"lease": job["lease"], "stage": stage, "error": error})

    def stop(process):
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try: process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()

    while True:
        process, job = None, None
        try:
            post("/worker/heartbeat", {"workerId": worker_id, "capabilities": capabilities})
            job = post("/worker/claim", {"workerId": worker_id})["job"]
            if not job:
                time.sleep(4)
                continue
            if not re.fullmatch(r"[0-9a-f]{32}", job["id"]): raise ValueError("Unexpected job id")
            if job["kind"] not in capabilities:
                progress(job, "当前推理节点不支持此类型", "Unsupported job kind")
                continue
            folder = work / job["id"] / job["lease"]
            folder.mkdir(parents=True, mode=0o700)
            inputs = []
            download_started, download_heartbeat = time.monotonic(), 0
            for item in job["inputs"]:
                name = item["file"]
                if not re.fullmatch(r"[0-9]+\.(jpg|png|webp|mp4|webm)", name): raise ValueError("Unexpected input path")
                target = folder / name
                with client.stream("GET", f"{base}/worker/jobs/{job['id']}/inputs/{name}") as response:
                    response.raise_for_status()
                    size = 0
                    with target.open("wb") as output:
                        for chunk in response.iter_bytes():
                            if time.monotonic()-download_started > 900:
                                raise RuntimeError("Input download exceeded 15 minutes")
                            if time.monotonic()-download_heartbeat > 10:
                                state_response = client.get(f"{base}/worker/jobs/{job['id']}")
                                state_response.raise_for_status()
                                state = state_response.json()
                                if state["status"] != "running" or state["lease"] != job["lease"]:
                                    raise RuntimeError("Job cancelled or superseded during download")
                                post("/worker/heartbeat", {"workerId": worker_id, "capabilities": capabilities})
                                progress(job, "正在下载原始素材")
                                download_heartbeat = time.monotonic()
                            size += len(chunk)
                            if size > 100*1024*1024: raise ValueError("Input too large")
                            output.write(chunk)
                inputs.append(target)
            output = folder / "result"
            stage = {"pet": "TripoSR 正在重建宠物网格", "pet_avatar": "正在生成有骨骼的 Q 版宠物", "room": "Depth Anything 正在估计可见室内深度"}[job["kind"]]
            progress(job, stage)
            started, heartbeat_at = time.monotonic(), 0
            with (folder / "inference.log").open("wb") as log:
                script = avatar_script if job["kind"] == "pet_avatar" else engine_script
                python = avatar_python if job["kind"] == "pet_avatar" else engine_python
                process = subprocess.Popen([python, script, "--kind", job["kind"], "--input", str(inputs[0]), "--output", str(output)],
                                           stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
                                           env={**os.environ, "OMP_NUM_THREADS": "4", "MKL_NUM_THREADS": "4"})
                cancelled = False
                while process.poll() is None:
                    if time.monotonic() - started > 1800:
                        stop(process)
                        raise RuntimeError("Inference exceeded 30 minutes; inspect local engine log")
                    if time.monotonic()-heartbeat_at > 10:
                        response = client.get(f"{base}/worker/jobs/{job['id']}")
                        response.raise_for_status()
                        state = response.json()
                        if state["status"] != "running" or state["lease"] != job["lease"]:
                            stop(process); cancelled = True; break
                        post("/worker/heartbeat", {"workerId": worker_id, "capabilities": capabilities})
                        progress(job, stage)
                        heartbeat_at = time.monotonic()
                    time.sleep(1)
                if cancelled: continue
                if process.returncode:
                    raise RuntimeError("Open-source inference failed; local engine log contains details")
            metadata_path = output / "result.json"
            metadata = json.loads(metadata_path.read_text())
            if len(inputs) > 1:
                metadata.setdefault("limitations", []).append(f"本次单视图模型使用上传的第一张图；其余 {len(inputs)-1} 张保留为参考，没有进行多视角融合。")
                metadata_path.write_text(json.dumps(metadata, ensure_ascii=False))
            progress(job, "正在上传真实模型结果")
            handles = []
            try:
                files = []
                for name in ("model.glb", "layout.json", "preview.png", "preview.jpg", "result.json"):
                    path = output / name
                    if path.is_file():
                        handle = path.open("rb"); handles.append(handle)
                        files.append(("files[]", (name, handle, "application/octet-stream")))
                response = client.post(f"{base}/worker/jobs/{job['id']}/complete", data={"lease": job["lease"]}, files=files)
                response.raise_for_status()
            finally:
                for handle in handles: handle.close()
            print(f"completed {job['id']} kind={job['kind']}", flush=True)
        except KeyboardInterrupt:
            if process: stop(process)
            break
        except Exception as exc:
            if process: stop(process)
            print(f"worker error {type(exc).__name__}", flush=True)
            if job:
                try: progress(job, "处理失败，可重试", str(exc)[:500] if not isinstance(exc, httpx.HTTPStatusError) else f"Upstream returned HTTP {exc.response.status_code}")
                except Exception: pass
            time.sleep(5)


if __name__ == "__main__": main()
