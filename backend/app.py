"""Single-household collar MVP. Separate Web/ingest credentials; durable SQLite ACK."""
import hashlib
from contextlib import contextmanager
import hmac
import json
import os
from pathlib import Path
import sqlite3
import time
from typing import Annotated, Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .classifier import ALGORITHM, classify
from .jobs import create_jobs_router

VERSION = "0.1.18-collar.0"


class Sample(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    t: Annotated[float, Field(ge=0, le=1e16)]
    ax: Annotated[float, Field(ge=-16, le=16)]
    ay: Annotated[float, Field(ge=-16, le=16)]
    az: Annotated[float, Field(ge=-16, le=16)]
    gx: Annotated[float, Field(ge=-2100, le=2100)]
    gy: Annotated[float, Field(ge=-2100, le=2100)]
    gz: Annotated[float, Field(ge=-2100, le=2100)]


class Window(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    deviceId: Annotated[str, Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")]
    bootId: Annotated[str, Field(pattern=r"^[a-zA-Z0-9_-]{1,96}$")]
    seq: Annotated[int, Field(strict=True, ge=0, le=2**53-1)]
    firmware: Annotated[str, Field(min_length=1, max_length=120)]
    transport: Literal["usb-serial", "wifi"] = "usb-serial"
    sampleRate: Annotated[float, Field(ge=1, le=200)]
    capturedAt: Annotated[int, Field(strict=True, ge=946684800000, le=4102444800000)]
    samples: Annotated[list[Sample], Field(min_length=1, max_length=200)]

    @model_validator(mode="after")
    def validate_time(self):
        if self.capturedAt > int(time.time()*1000) + 60000:
            raise ValueError("capturedAt is in the future")
        if any(b.t <= a.t for a, b in zip(self.samples, self.samples[1:])):
            raise ValueError("sample timestamps must increase")
        if self.samples[-1].t - self.samples[0].t > 10000:
            raise ValueError("window must be at most 10 seconds")
        return self


def create_app(db_path=None, viewer_token=None, device_token=None, static_dir=None):
    db_path = str(db_path or os.environ.get("PETLINK_DB", ".private/petlink.sqlite3"))
    viewer_token = viewer_token or os.environ.get("PETLINK_VIEWER_TOKEN", "")
    device_token = device_token or os.environ.get("PETLINK_DEVICE_TOKEN", "")
    worker_token = os.environ.get("PETLINK_WORKER_TOKEN", "")
    device_id = os.environ.get("PETLINK_DEVICE_ID", "capsule-01")
    static = Path(static_dir or os.environ.get("PETLINK_STATIC", "dist")).resolve()
    if len(viewer_token) < 24 or len(device_token) < 24 or viewer_token == device_token:
        raise RuntimeError("Configure distinct device and viewer tokens of at least 24 characters")
    if worker_token and (len(worker_token) < 24 or worker_token in (viewer_token, device_token)):
        raise RuntimeError("Worker token must be distinct and at least 24 characters")
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connection():
        db = sqlite3.connect(db_path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=FULL")
        try:
            with db:
                yield db
        finally:
            db.close()

    with connection() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS telemetry (
          id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL,
          boot_id TEXT NOT NULL, seq INTEGER NOT NULL, captured_at INTEGER NOT NULL,
          received_at INTEGER NOT NULL, digest TEXT NOT NULL, payload TEXT NOT NULL,
          result TEXT NOT NULL, UNIQUE(device_id, boot_id, seq));
        CREATE INDEX IF NOT EXISTS telemetry_capture ON telemetry(captured_at DESC, id DESC);
        CREATE TABLE IF NOT EXISTS stream_watermark (
          device_id TEXT NOT NULL, boot_id TEXT NOT NULL, highest_seq INTEGER NOT NULL,
          PRIMARY KEY(device_id,boot_id));
        INSERT INTO stream_watermark(device_id,boot_id,highest_seq)
          SELECT device_id,boot_id,MAX(seq) FROM telemetry GROUP BY device_id,boot_id
          ON CONFLICT(device_id,boot_id) DO UPDATE SET highest_seq=MAX(highest_seq,excluded.highest_seq);
        PRAGMA user_version=2;
        """)

    app = FastAPI(title="PetLink Collar", version=VERSION, docs_url=None, redoc_url=None,
                  openapi_url=None)

    @app.middleware("http")
    async def bounds(request: Request, call_next):
        # Enforce independently from the edge proxy for direct loopback callers too.
        media_upload = request.url.path == "/api/jobs" or request.url.path.endswith("/complete")
        if request.method == "POST" and media_upload:
            # Authenticate before multipart parsing can spool an upload to disk.
            expected = viewer_token if request.url.path == "/api/jobs" else worker_token
            if not expected or not hmac.compare_digest(request.headers.get("authorization", ""), "Bearer " + expected):
                return JSONResponse({"detail": "Invalid credential"}, status_code=401)
            try:
                length = int(request.headers.get("content-length", "-1"))
            except ValueError:
                length = -1
            if length < 0 or length > 152*1024*1024:
                return JSONResponse({"detail": "Upload requires Content-Length, maximum 150 MiB media"}, status_code=413)
        if request.method == "POST" and not media_upload:
            total = 0
            body = bytearray()
            async for chunk in request.stream():
                total += len(chunk)
                if total > 128*1024:
                    return JSONResponse({"detail": "Request too large"}, status_code=413)
                body.extend(chunk)
            request._body = bytes(body)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def authorize(expected, authorization):
        if not authorization or not hmac.compare_digest(authorization, "Bearer " + expected):
            raise HTTPException(401, "Invalid credential", headers={"WWW-Authenticate": "Bearer"})

    def viewer(authorization: Optional[str] = Header(default=None)):
        authorize(viewer_token, authorization)

    def device(authorization: Optional[str] = Header(default=None)):
        authorize(device_token, authorization)

    @app.get("/api/health")
    def health():
        with connection() as db:
            db.execute("SELECT 1").fetchone()
        return {"status": "ok", "version": VERSION,
                "commit": os.environ.get("PETLINK_COMMIT", "development"),
                "algorithm": ALGORITHM, "schema": 2}

    @app.get("/api/capabilities", dependencies=[Depends(viewer)])
    def capabilities():
        fresh = int(time.time()*1000) - 45000
        with connection() as db:
            workers = db.execute("SELECT capabilities FROM model_worker_sessions WHERE seen_at >= ?", (fresh,)).fetchall()
            legacy = db.execute("SELECT capabilities FROM model_worker WHERE id=1 AND seen_at >= ?", (fresh,)).fetchone()
        if legacy: workers.append(legacy)
        available = {kind for worker in workers for kind in json.loads(worker["capabilities"])}
        online = bool(workers)
        return {"telemetry": "hardware", "classification": "experimental-rules",
                "location": "unavailable", "battery": "unavailable",
                "petReconstruction": "triposr-single-image" if "pet" in available else "worker-unavailable",
                "petAvatar": "rigged-animated-worker" if "pet_avatar" in available else "worker-unavailable",
                "roomReconstruction": "depth-anything-v2-visible-surface" if "room" in available else "worker-unavailable",
                "workerOnline": online,
                "floorplan": "manual-dimension-assisted",
                "scope": "single-household-single-device"}

    @app.post("/api/telemetry", dependencies=[Depends(device)])
    def ingest(window: Window):
        if window.deviceId != device_id:
            raise HTTPException(403, "Device token is bound to a different device")
        # Preserve existing USB idempotency digests across the transport-field upgrade.
        payload = window.model_dump_json(exclude={"transport"} if window.transport == "usb-serial" else set())
        digest = hashlib.sha256(payload.encode()).hexdigest()
        now = int(time.time()*1000)
        result = {"deviceId": window.deviceId, "bootId": window.bootId, "seq": window.seq,
                  "receivedAt": now, "capturedAt": window.capturedAt,
                  "firmware": window.firmware, "sampleRate": window.sampleRate,
                  "transport": window.transport,
                  "source": "hardware", "sample": window.samples[-1].model_dump(),
                  **classify(window.samples, window.sampleRate)}
        with connection() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT id,digest,result FROM telemetry WHERE device_id=? AND boot_id=? AND seq=?",
                                  (window.deviceId, window.bootId, window.seq)).fetchone()
            if previous:
                if previous["digest"] != digest:
                    raise HTTPException(409, "Idempotency key reused with a different payload")
                return {"accepted": True, "duplicate": True, "event": json.loads(previous["result"])}
            # One ordered queue per boot. Compact watermarks survive raw-data expiry,
            # so an old sequence can never become a new event after ring cleanup.
            watermark = db.execute("SELECT highest_seq FROM stream_watermark WHERE device_id=? AND boot_id=?",
                                   (window.deviceId, window.bootId)).fetchone()
            if watermark and window.seq <= watermark["highest_seq"]:
                raise HTTPException(409, "Sequence already expired or out of order; retain locally for inspection")
            cur = db.execute("INSERT INTO telemetry(device_id,boot_id,seq,captured_at,received_at,digest,payload,result) VALUES(?,?,?,?,?,?,?,?)",
                             (window.deviceId, window.bootId, window.seq, window.capturedAt, now, digest, payload, "{}"))
            result["id"] = cur.lastrowid
            db.execute("UPDATE telemetry SET result=? WHERE id=?", (json.dumps(result), cur.lastrowid))
            db.execute("INSERT INTO stream_watermark VALUES(?,?,?) ON CONFLICT(device_id,boot_id) DO UPDATE SET highest_seq=excluded.highest_seq",
                       (window.deviceId, window.bootId, window.seq))
            # A bounded raw ring for this MVP. The displayed lifetime is documented.
            if cur.lastrowid % 300 == 0:
                db.execute("DELETE FROM telemetry WHERE id <= ?", (cur.lastrowid - 20000,))
        return {"accepted": True, "duplicate": False, "event": result}

    def latest_events(limit):
        with connection() as db:
            rows = db.execute("SELECT result FROM telemetry ORDER BY captured_at DESC,id DESC LIMIT ?", (limit,)).fetchall()
        return [json.loads(row["result"]) for row in rows]

    @app.get("/api/events", dependencies=[Depends(viewer)])
    def events(limit: Annotated[int, Query(ge=1, le=200)] = 50):
        return {"events": latest_events(limit)}

    @app.get("/api/live", dependencies=[Depends(viewer)])
    def live():
        events = latest_events(30)
        latest = events[0] if events else None
        now = int(time.time()*1000)
        online = bool(latest and now - latest["receivedAt"] < 10000 and
                      -60000 < now - latest["capturedAt"] < 15000)
        device = {"deviceId": latest["deviceId"], "firmware": latest["firmware"],
                  "source": latest.get("transport", "usb-serial"), "sampleRate": latest["sampleRate"],
                  "receivedAt": latest["receivedAt"], "sequence": latest["seq"]} if latest else None
        return {"device": device, "latest": latest, "events": events, "online": online}

    app.include_router(create_jobs_router(db_path, viewer,
        worker_token,
        os.environ.get("PETLINK_MEDIA", str(Path(db_path).parent / "media"))))

    @app.api_route("/{path:path}", methods=["GET", "HEAD"])
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        candidate = (static / path).resolve()
        if not candidate.is_relative_to(static):
            raise HTTPException(404)
        if candidate.is_file():
            return FileResponse(candidate, headers={"Cache-Control": "no-cache"})
        if Path(path).suffix or not (static / "index.html").is_file():
            raise HTTPException(404)
        return FileResponse(static / "index.html", headers={"Cache-Control": "no-cache"})

    return app
