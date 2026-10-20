"""Authenticated media jobs. GPU/CPU inference runs in a separately authenticated worker."""
from contextlib import contextmanager
import hmac
import json
import math
import os
from pathlib import Path
import re
import shutil
import sqlite3
import struct
import tempfile
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

MAX_TOTAL = 150 * 1024 * 1024
MAX_STORAGE = 1024 * 1024 * 1024


def reject_json_constant(value):
    raise ValueError(value)


def read_json(path, limit):
    if path.stat().st_size > limit:
        raise HTTPException(422, f"{path.name} is too large")
    try:
        return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_json_constant)
    except (ValueError, UnicodeError, RecursionError):
        raise HTTPException(422, f"Invalid {path.name}") from None


def validate_glb(path):
    """Validate the GLB container and embedded resource bounds before publication."""
    def invalid():
        raise HTTPException(422, "Invalid or non-self-contained GLB")

    def integer(value):
        return type(value) is int and value >= 0

    size = path.stat().st_size
    with path.open("rb") as model:
        header = model.read(12)
        if len(header) != 12 or struct.unpack("<4sII", header) != (b"glTF", 2, size): invalid()
        position, document, binary_size = 12, None, None
        while position < size:
            header = model.read(8)
            if len(header) != 8: invalid()
            length, kind = struct.unpack("<II", header)
            position += 8
            if length % 4 or length > size-position: invalid()
            if kind == 0x4E4F534A:
                if document is not None or position != 20 or length > 4*1024*1024: invalid()
                try:
                    document = json.loads(model.read(length), parse_constant=reject_json_constant)
                except (ValueError, UnicodeError, RecursionError): invalid()
            elif kind == 0x004E4942:
                if document is None or binary_size is not None: invalid()
                binary_size = length
                model.seek(length, 1)
            else:
                invalid()
            position += length
    if not isinstance(document, dict) or not isinstance(document.get("asset"), dict) or document["asset"].get("version") != "2.0": invalid()
    pending = [document]
    while pending:
        value = pending.pop()
        if isinstance(value, dict):
            # Reconstruction outputs embed both geometry and textures in the BIN chunk.
            if "uri" in value: invalid()
            pending.extend(value.values())
        elif isinstance(value, list): pending.extend(value)
    buffers = document.get("buffers")
    if not isinstance(buffers, list) or len(buffers) != 1 or not isinstance(buffers[0], dict): invalid()
    buffer_length = buffers[0].get("byteLength")
    if not integer(buffer_length) or binary_size is None or not 0 <= binary_size-buffer_length <= 3: invalid()
    views = document.get("bufferViews", [])
    if not isinstance(views, list): invalid()
    for view in views:
        if not isinstance(view, dict) or view.get("buffer") != 0: invalid()
        offset, length = view.get("byteOffset", 0), view.get("byteLength")
        if not integer(offset) or not integer(length) or offset+length > buffer_length: invalid()
    accessors = document.get("accessors", [])
    if not isinstance(accessors, list): invalid()
    components = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    dimensions = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
    for accessor in accessors:
        if not isinstance(accessor, dict): invalid()
        count, offset = accessor.get("count"), accessor.get("byteOffset", 0)
        component, kind = accessor.get("componentType"), accessor.get("type")
        if not integer(count) or not count or not integer(offset) or type(component) is not int or component not in components or not isinstance(kind, str) or kind not in dimensions: invalid()
        if "bufferView" in accessor:
            index = accessor["bufferView"]
            if not integer(index) or index >= len(views): invalid()
            view = views[index]
            element = components[component]*dimensions[kind]
            # Matrix columns using 8/16-bit components are padded to four bytes.
            if kind.startswith("MAT"):
                columns = int(kind[-1])
                element = ((columns*components[component]+3)//4)*4*columns
            stride = view.get("byteStride", element)
            if not integer(stride) or stride < element or offset+(count-1)*stride+element > view["byteLength"]: invalid()
    meshes = document.get("meshes")
    if not isinstance(meshes, list) or not meshes: invalid()
    for mesh in meshes:
        if not isinstance(mesh, dict) or not isinstance(mesh.get("primitives"), list) or not mesh["primitives"]: invalid()
        for primitive in mesh["primitives"]:
            if not isinstance(primitive, dict) or not isinstance(primitive.get("attributes"), dict) or "POSITION" not in primitive["attributes"]: invalid()
            indices = list(primitive["attributes"].values())
            if "indices" in primitive: indices.append(primitive["indices"])
            if any(not integer(index) or index >= len(accessors) for index in indices): invalid()
    images = document.get("images", [])
    if not isinstance(images, list): invalid()
    for item in images:
        if not isinstance(item, dict) or not integer(item.get("bufferView")) or item["bufferView"] >= len(views): invalid()
        if item.get("mimeType") not in ("image/png", "image/jpeg", "image/webp"): invalid()
    return document


def validate_animated_pet(document):
    """A desktop avatar must have skinned geometry and real joint animation."""
    def invalid():
        raise HTTPException(422, "Pet avatar requires a skinned GLB with idle and walk animations")

    nodes = document.get("nodes", [])
    skins = document.get("skins", [])
    animations = document.get("animations", [])
    if not isinstance(nodes, list) or not isinstance(skins, list) or not isinstance(animations, list): invalid()
    used_skins = set()
    for node in nodes:
        if not isinstance(node, dict): invalid()
        if "skin" in node and "mesh" in node:
            skin = node["skin"]
            if type(skin) is not int or skin < 0 or skin >= len(skins): invalid()
            mesh_index = node["mesh"]
            meshes = document.get("meshes", [])
            if type(mesh_index) is not int or mesh_index < 0 or mesh_index >= len(meshes): invalid()
            weighted = False
            accessors = document.get("accessors", [])
            for primitive in meshes[mesh_index]["primitives"]:
                attributes = primitive["attributes"]
                if not all(key in attributes for key in ("POSITION", "JOINTS_0", "WEIGHTS_0")): continue
                position, bone_ids, weights = (accessors[attributes[key]] for key in ("POSITION", "JOINTS_0", "WEIGHTS_0"))
                if (bone_ids.get("type") != "VEC4" or bone_ids.get("componentType") not in (5121, 5123)
                    or weights.get("type") != "VEC4" or weights.get("componentType") not in (5121, 5123, 5126)
                    or position["count"] != bone_ids["count"] or position["count"] != weights["count"]): invalid()
                weighted = True
            if not weighted: invalid()
            used_skins.add(skin)
    if not used_skins: invalid()
    joints = set()
    for index in used_skins:
        skin = skins[index]
        if not isinstance(skin, dict) or not isinstance(skin.get("joints"), list) or len(skin["joints"]) < 4: invalid()
        for joint in skin["joints"]:
            if type(joint) is not int or joint < 0 or joint >= len(nodes): invalid()
            joints.add(joint)
    names = []
    for animation in animations:
        if not isinstance(animation, dict) or not isinstance(animation.get("channels"), list) or not isinstance(animation.get("samplers"), list): invalid()
        name = animation.get("name")
        if not isinstance(name, str) or not name.strip(): invalid()
        moving_joint = False
        for channel in animation["channels"]:
            if not isinstance(channel, dict) or not isinstance(channel.get("target"), dict): invalid()
            sampler = channel.get("sampler")
            if type(sampler) is not int or sampler < 0 or sampler >= len(animation["samplers"]): invalid()
            definition = animation["samplers"][sampler]
            accessors = document.get("accessors", [])
            if not isinstance(definition, dict) or any(type(definition.get(key)) is not int or definition[key] < 0 or definition[key] >= len(accessors)
                                                      for key in ("input", "output")): invalid()
            target = channel["target"]
            node_index = target.get("node")
            if type(node_index) is not int or node_index < 0 or node_index >= len(nodes): invalid()
            if node_index in joints and target.get("path") in ("rotation", "translation", "scale"):
                moving_joint = True
        if moving_joint: names.append(name.strip())
    if not any("idle" in name.lower() for name in names) or not any("walk" in name.lower() for name in names): invalid()
    return names


def validate_layout(path):
    layout = read_json(path, 2*1024*1024)
    def finite(value):
        try: return type(value) in (int, float) and math.isfinite(value)
        except OverflowError: return False
    def invalid():
        raise HTTPException(422, "Invalid layout.json geometry")
    if not isinstance(layout, dict) or layout.get("unit") not in ("m", "relative"): invalid()
    rooms = layout.get("rooms")
    if not isinstance(rooms, list) or not 1 <= len(rooms) <= 100: invalid()
    points = 0
    for room in rooms:
        if not isinstance(room, dict): invalid()
        polygon = room.get("polygon")
        if not isinstance(polygon, list) or not 3 <= len(polygon) <= 10000: invalid()
        points += len(polygon)
        if points > 10000: invalid()
        for point in polygon:
            if not isinstance(point, dict) or any(not finite(point.get(axis)) or abs(point[axis]) > 1e6 for axis in ("x", "y")): invalid()
        if "height" in room and not finite(room["height"]): invalid()


def media_type(data):
    if data.startswith(b"\xff\xd8\xff"): return "image/jpeg", ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"): return "image/png", ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP": return "image/webp", ".webp"
    if data[4:8] == b"ftyp": return "video/mp4", ".mp4"
    if data[:4] == b"\x1aE\xdf\xa3": return "video/webm", ".webm"
    raise HTTPException(415, "Supported: JPEG, PNG, WebP, MP4/MOV, WebM")


class Heartbeat(BaseModel):
    capabilities: list[str] = Field(default_factory=list, max_length=10)
    workerId: Optional[str] = Field(default=None, pattern=r"^[0-9a-f]{32}$")


class Claim(BaseModel):
    workerId: Optional[str] = Field(default=None, pattern=r"^[0-9a-f]{32}$")


class Progress(BaseModel):
    lease: str
    stage: str = Field(max_length=300)
    error: Optional[str] = Field(default=None, max_length=2000)


def create_jobs_router(db_path, viewer, worker_token, media_root):
    root = Path(media_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    os.chmod(root, 0o700)
    base = os.environ.get("PETLINK_BASE_PATH", "/petlink/").rstrip("/")
    router = APIRouter()

    @contextmanager
    def db_open():
        db = sqlite3.connect(db_path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db: yield db
        finally: db.close()

    with db_open() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS media_jobs (
          id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL,
          created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, stage TEXT NOT NULL,
          inputs TEXT NOT NULL, result TEXT, error TEXT, lease TEXT, attempts INTEGER NOT NULL DEFAULT 0,
          result_dir TEXT, pet_id TEXT);
        CREATE TABLE IF NOT EXISTS model_worker (
          id INTEGER PRIMARY KEY CHECK(id=1), seen_at INTEGER NOT NULL, capabilities TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS model_worker_sessions (
          id TEXT PRIMARY KEY, seen_at INTEGER NOT NULL, capabilities TEXT NOT NULL);
        """)
        if "result_dir" not in {row[1] for row in db.execute("PRAGMA table_info(media_jobs)")}:
            db.execute("ALTER TABLE media_jobs ADD COLUMN result_dir TEXT")
        if "pet_id" not in {row[1] for row in db.execute("PRAGMA table_info(media_jobs)")}:
            db.execute("ALTER TABLE media_jobs ADD COLUMN pet_id TEXT")

    def storage_bytes():
        used = 0
        for path in root.rglob("*"):
            try:
                if path.is_file(): used += path.stat().st_size
            except FileNotFoundError:
                # A failed request may remove its own staging directory concurrently.
                pass
        return used

    def check_queue_capacity(db):
        if db.execute("SELECT COUNT(*) FROM media_jobs WHERE status IN ('queued','running')").fetchone()[0] >= 6:
            raise HTTPException(429, "Queue full; wait or cancel a pending task")

    def write_chunk(target, chunk, job_id=None, lease=None):
        # Serialize quota checks with every input/result write, including partial uploads.
        with db_open() as db:
            db.execute("BEGIN IMMEDIATE")
            if job_id is not None: check_lease(db, job_id, lease)
            if storage_bytes()+len(chunk) > MAX_STORAGE:
                raise HTTPException(507, "Media storage full; archive jobs before further uploads")
            target.write(chunk)
            target.flush()

    def worker_auth(authorization: Optional[str] = Header(default=None)):
        if not worker_token or not authorization or not hmac.compare_digest(authorization, "Bearer " + worker_token):
            raise HTTPException(401, "Invalid worker credential")

    def now(): return int(time.time()*1000)

    def available_capabilities(db):
        fresh = now() - 45000
        rows = db.execute("SELECT capabilities FROM model_worker_sessions WHERE seen_at >= ?", (fresh,)).fetchall()
        legacy = db.execute("SELECT capabilities FROM model_worker WHERE id=1 AND seen_at >= ?", (fresh,)).fetchone()
        if legacy: rows.append(legacy)
        return sorted({kind for row in rows for kind in json.loads(row["capabilities"])
                       if kind in ("pet", "pet_avatar", "room")})

    def row_job(row, worker=False):
        result = {"id": row["id"], "kind": row["kind"], "status": row["status"],
                  "createdAt": row["created_at"], "updatedAt": row["updated_at"],
                  "stage": row["stage"], "error": row["error"],
                  "petId": row["pet_id"],
                  "inputs": json.loads(row["inputs"]), "result": json.loads(row["result"]) if row["result"] else None}
        if worker: result["lease"] = row["lease"]
        return result

    def get_job(db, job_id):
        row = db.execute("SELECT * FROM media_jobs WHERE id=?", (job_id,)).fetchone()
        if not row: raise HTTPException(404, "Job not found")
        return row

    def check_lease(db, job_id, lease):
        row = get_job(db, job_id)
        if row["status"] != "running" or row["lease"] != lease:
            raise HTTPException(409, "Job cancelled or attempt superseded")
        return row

    @router.get("/api/jobs", dependencies=[Depends(viewer)])
    def list_jobs():
        with db_open() as db:
            rows = db.execute("SELECT * FROM media_jobs ORDER BY created_at DESC LIMIT 50").fetchall()
            capabilities = available_capabilities(db)
        return {"jobs": [row_job(row) for row in rows], "worker": {
            "online": bool(capabilities), "capabilities": capabilities}}

    @router.post("/api/jobs", dependencies=[Depends(viewer)])
    async def create_job(kind: str = Form(...), petId: Optional[str] = Form(default=None), files: list[UploadFile] = File(..., alias="files[]")):
        if kind not in ("pet", "pet_avatar", "room") or not 1 <= len(files) <= 12:
            raise HTTPException(422, "Choose pet/pet_avatar/room and 1-12 images or one video")
        if kind == "pet_avatar" and len(files) != 1:
            raise HTTPException(422, "Pet avatar accepts one photo or one video per job")
        if kind == "pet_avatar" and (not petId or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", petId)):
            raise HTTPException(422, "Pet avatar requires a valid petId")
        if kind != "pet_avatar" and petId is not None:
            raise HTTPException(422, "petId is only supported for pet_avatar jobs")
        with db_open() as db:
            check_queue_capacity(db)
            if kind == "pet_avatar":
                if kind not in available_capabilities(db):
                    raise HTTPException(503, "Animated pet avatar worker is not available")
        job_id = uuid.uuid4().hex
        folder = root / job_id / "inputs"
        folder.mkdir(parents=True, mode=0o700)
        total, inputs = 0, []
        try:
            for index, upload in enumerate(files):
                head = await upload.read(32)
                mime, ext = media_type(head)
                if mime.startswith("video/") and len(files) != 1:
                    raise HTTPException(422, "Upload one video at a time")
                limit = 100*1024*1024 if mime.startswith("video/") else 15*1024*1024
                name = f"{index}{ext}"
                path = folder / name
                count = 0
                with path.open("wb") as target:
                    chunk = head
                    while chunk:
                        count += len(chunk); total += len(chunk)
                        if count > limit or total > MAX_TOTAL:
                            raise HTTPException(413, "Upload exceeds media size limit")
                        write_chunk(target, chunk)
                        chunk = await upload.read(1024*1024)
                inputs.append({"name": Path(upload.filename or name).name[:200], "mime": mime, "size": count,
                               "url": f"{base}/api/jobs/{job_id}/inputs/{name}", "file": name})
            with db_open() as db:
                db.execute("BEGIN IMMEDIATE")
                check_queue_capacity(db)
                db.execute("INSERT INTO media_jobs(id,kind,status,created_at,updated_at,stage,inputs,pet_id) VALUES(?,?,?,?,?,?,?,?)",
                           (job_id, kind, "queued", now(), now(), "等待本地推理节点领取", json.dumps(inputs), petId))
                row = get_job(db, job_id)
            return row_job(row)
        except BaseException:
            shutil.rmtree(folder.parent, ignore_errors=True)
            raise
        finally:
            for upload in files: await upload.close()

    @router.post("/api/jobs/{job_id}/cancel", dependencies=[Depends(viewer)])
    def cancel(job_id: str):
        with db_open() as db:
            db.execute("BEGIN IMMEDIATE")
            row = get_job(db, job_id)
            if row["status"] in ("queued", "running"):
                db.execute("UPDATE media_jobs SET status='cancelled',stage='用户已取消',updated_at=?,lease=NULL WHERE id=?", (now(), job_id))
            return row_job(get_job(db, job_id))

    @router.post("/api/jobs/{job_id}/retry", dependencies=[Depends(viewer)])
    def retry(job_id: str):
        with db_open() as db:
            db.execute("BEGIN IMMEDIATE")
            row = get_job(db, job_id)
            if row["status"] not in ("failed", "cancelled"): raise HTTPException(409, "Only failed/cancelled jobs can retry")
            check_queue_capacity(db)
            # Remove orphaned results from earlier versions/attempts; retain original inputs.
            for folder in (root / job_id).glob("result-*"):
                if folder.is_dir(): shutil.rmtree(folder)
            db.execute("UPDATE media_jobs SET status='queued',stage='等待重新处理',error=NULL,result=NULL,result_dir=NULL,lease=NULL,updated_at=? WHERE id=?", (now(), job_id))
            return row_job(get_job(db, job_id))

    @router.get("/api/jobs/{job_id}/artifacts/{name}", dependencies=[Depends(viewer)])
    def artifact(job_id: str, name: str):
        if name not in ("model.glb", "layout.json", "preview.png", "preview.jpg", "result.json"): raise HTTPException(404)
        with db_open() as db:
            row = get_job(db, job_id)
            if row["status"] != "succeeded": raise HTTPException(404)
            path = root / job_id / (row["result_dir"] or f"result-{row['attempts']}") / name
        if not path.is_file(): raise HTTPException(404)
        return FileResponse(path, headers={"Cache-Control": "no-store"})

    def input_response(job_id, name):
        with db_open() as db:
            row = get_job(db, job_id)
            if name not in [x["file"] for x in json.loads(row["inputs"])]: raise HTTPException(404)
        return FileResponse(root / job_id / "inputs" / name, headers={"Cache-Control": "no-store"})

    @router.get("/api/jobs/{job_id}/inputs/{name}", dependencies=[Depends(viewer)])
    def input_view(job_id: str, name: str): return input_response(job_id, name)

    @router.get("/api/worker/jobs/{job_id}/inputs/{name}", dependencies=[Depends(worker_auth)])
    def input_worker(job_id: str, name: str): return input_response(job_id, name)

    @router.post("/api/worker/heartbeat", dependencies=[Depends(worker_auth)])
    def heartbeat(data: Heartbeat):
        with db_open() as db:
            if data.workerId:
                db.execute("INSERT INTO model_worker_sessions VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET seen_at=excluded.seen_at,capabilities=excluded.capabilities", (data.workerId, now(), json.dumps(data.capabilities)))
            else:
                db.execute("INSERT INTO model_worker VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET seen_at=excluded.seen_at,capabilities=excluded.capabilities", (now(), json.dumps(data.capabilities)))
        return {"ok": True}

    @router.post("/api/worker/claim", dependencies=[Depends(worker_auth)])
    def claim(data: Optional[Claim] = None):
        with db_open() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("UPDATE media_jobs SET status='failed',stage='推理节点失联，可重试',error='Worker lease expired',lease=NULL,updated_at=? WHERE status='running' AND updated_at < ?", (now(), now()-180000))
            if data and data.workerId:
                worker = db.execute("SELECT * FROM model_worker_sessions WHERE id=? AND seen_at >= ?", (data.workerId, now()-45000)).fetchone()
                if not worker: raise HTTPException(409, "Worker session has no fresh heartbeat")
                claimed = json.loads(worker["capabilities"])
            else:
                # Legacy workers never advertised pet_avatar and cannot claim it.
                worker = db.execute("SELECT * FROM model_worker WHERE id=1 AND seen_at >= ?", (now()-45000,)).fetchone()
                claimed = json.loads(worker["capabilities"]) if worker else ["pet", "room"]
            capabilities = [kind for kind in claimed if kind in ("pet", "pet_avatar", "room")]
            if not capabilities: return {"job": None}
            placeholders = ",".join("?" for _ in capabilities)
            row = db.execute(f"SELECT * FROM media_jobs WHERE status='queued' AND kind IN ({placeholders}) ORDER BY created_at LIMIT 1", capabilities).fetchone()
            if not row: return {"job": None}
            lease = uuid.uuid4().hex
            db.execute("UPDATE media_jobs SET status='running',stage='正在读取输入',updated_at=?,lease=?,attempts=attempts+1 WHERE id=?", (now(), lease, row["id"]))
            return {"job": row_job(get_job(db, row["id"]), worker=True)}

    @router.get("/api/worker/jobs/{job_id}", dependencies=[Depends(worker_auth)])
    def worker_job(job_id: str):
        with db_open() as db: return row_job(get_job(db, job_id), worker=True)

    @router.post("/api/worker/jobs/{job_id}/progress", dependencies=[Depends(worker_auth)])
    def progress(job_id: str, data: Progress):
        with db_open() as db:
            db.execute("BEGIN IMMEDIATE")
            check_lease(db, job_id, data.lease)
            db.execute("UPDATE media_jobs SET stage=?,error=?,status=?,updated_at=? WHERE id=?", (data.stage, data.error, "failed" if data.error else "running", now(), job_id))
            return {"ok": True}

    @router.post("/api/worker/jobs/{job_id}/complete", dependencies=[Depends(worker_auth)])
    async def complete(job_id: str, lease: str = Form(...), files: list[UploadFile] = File(..., alias="files[]")):
        folder, published, committed = None, None, False
        try:
            with db_open() as db:
                row = check_lease(db, job_id, lease)
                attempt, kind = row["attempts"], row["kind"]
            if not 1 <= len(files) <= 5: raise HTTPException(422, "Unexpected artifact count")
            folder = Path(tempfile.mkdtemp(prefix=".upload-", dir=root / job_id))
            count, names = 0, set()
            for upload in files:
                name = upload.filename or ""
                if name not in ("model.glb", "layout.json", "preview.png", "preview.jpg", "result.json") or name in names:
                    raise HTTPException(422, "Unexpected artifact")
                names.add(name)
                with (folder / name).open("wb") as target:
                    while chunk := await upload.read(1024*1024):
                        count += len(chunk)
                        if count > MAX_TOTAL: raise HTTPException(413, "Result too large")
                        write_chunk(target, chunk, job_id, lease)
            if "result.json" not in names or not names.intersection({"model.glb", "layout.json"}):
                raise HTTPException(422, "Missing reconstruction result")
            if kind in ("pet", "pet_avatar") and "model.glb" not in names:
                raise HTTPException(422, "Pet reconstruction requires model.glb")
            metadata = read_json(folder / "result.json", 1024*1024)
            if not isinstance(metadata, dict) or not isinstance(metadata.get("method"), str) or not metadata["method"].strip():
                raise HTTPException(422, "Result metadata requires a method")
            limitations = metadata.get("limitations", [])
            if not isinstance(limitations, list) or any(not isinstance(item, str) for item in limitations):
                raise HTTPException(422, "Result limitations must be strings")
            method = metadata["method"][:300]
            limitations = [item[:1000] for item in limitations[:20]]
            document = validate_glb(folder / "model.glb") if "model.glb" in names else None
            animations = validate_animated_pet(document) if kind == "pet_avatar" else []
            if "layout.json" in names: validate_layout(folder / "layout.json")
            result = {"method": method, "limitations": limitations}
            if kind == "pet_avatar":
                result.update({"rigged": True, "animated": True, "animations": animations})
            for key, name in (("modelUrl", "model.glb"), ("layoutUrl", "layout.json"), ("previewUrl", "preview.png" if "preview.png" in names else "preview.jpg")):
                if name in names: result[key] = f"{base}/api/jobs/{job_id}/artifacts/{name}"
            with db_open() as db:
                db.execute("BEGIN IMMEDIATE")
                check_lease(db, job_id, lease)
                if storage_bytes() > MAX_STORAGE:
                    raise HTTPException(507, "Media storage full; archive jobs before further uploads")
                # A unique directory prevents concurrent requests for one lease overwriting
                # an already validated result. Publish only after the final lease check.
                published = root / job_id / f"result-{attempt}-{uuid.uuid4().hex}"
                folder.rename(published)
                db.execute("UPDATE media_jobs SET status='succeeded',stage='推理完成',result=?,result_dir=?,updated_at=? WHERE id=?", (json.dumps(result), published.name, now(), job_id))
                completed = row_job(get_job(db, job_id))
            committed = True
            return completed
        finally:
            if not committed:
                if folder is not None: shutil.rmtree(folder, ignore_errors=True)
                if published is not None: shutil.rmtree(published, ignore_errors=True)
            for upload in files: await upload.close()

    return router
