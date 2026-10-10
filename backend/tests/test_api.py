import time
import sqlite3
import pytest
from fastapi.testclient import TestClient
from backend.app import create_app

VIEW = "v" * 32
DEVICE = "d" * 32


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "events.db", VIEW, DEVICE, tmp_path)) as client:
        yield client


def window(**changes):
    result = {"deviceId": "capsule-01", "bootId": "test-boot", "seq": 1,
              "firmware": "test", "sampleRate": 50, "capturedAt": int(time.time()*1000),
              "samples": [{"t": i*20, "ax": 0, "ay": 0, "az": 1, "gx": 0, "gy": 0, "gz": 0} for i in range(50)]}
    return {**result, **changes}


def auth(token):
    return {"Authorization": "Bearer " + token}


def test_auth_and_binding(client):
    assert client.get("/api/live").status_code == 401
    assert client.get("/api/live", headers=auth(DEVICE)).status_code == 401
    assert client.post("/api/telemetry", json=window(), headers=auth(VIEW)).status_code == 401
    assert client.post("/api/telemetry", json=window(deviceId="another"), headers=auth(DEVICE)).status_code == 403


def test_durable_idempotency(client):
    data = window()
    first = client.post("/api/telemetry", json=data, headers=auth(DEVICE)).json()
    second = client.post("/api/telemetry", json=data, headers=auth(DEVICE)).json()
    assert first["accepted"] and not first["duplicate"]
    assert second["duplicate"] and second["event"]["id"] == first["event"]["id"]
    data["samples"][0]["az"] = 2
    assert client.post("/api/telemetry", json=data, headers=auth(DEVICE)).status_code == 409
    live = client.get("/api/live", headers=auth(VIEW)).json()
    assert live["online"] and len(live["events"]) == 1 and live["latest"]["activity"] == "rest"


def test_stale_backfill_not_live(client):
    client.post("/api/telemetry", json=window(capturedAt=int(time.time()*1000)-60000), headers=auth(DEVICE))
    assert not client.get("/api/live", headers=auth(VIEW)).json()["online"]


def test_out_of_order_does_not_replace_newest(client):
    newest = window()
    client.post("/api/telemetry", json=newest, headers=auth(DEVICE))
    client.post("/api/telemetry", json=window(seq=2,capturedAt=newest["capturedAt"]-10000), headers=auth(DEVICE))
    assert client.get("/api/live",headers=auth(VIEW)).json()["latest"]["seq"] == 1


def test_invalid_sample_and_time(client):
    data = window()
    data["samples"][1]["t"] = 0
    assert client.post("/api/telemetry",json=data,headers=auth(DEVICE)).status_code == 422
    assert client.post("/api/telemetry",json=window(capturedAt=int(time.time()*1000)+120000),headers=auth(DEVICE)).status_code == 422
    data = window()
    data["samples"][1]["ax"] = 100
    assert client.post("/api/telemetry",json=data,headers=auth(DEVICE)).status_code == 422


def test_restart_persistence(tmp_path):
    path = tmp_path / "persistent.db"
    with TestClient(create_app(path, VIEW, DEVICE, tmp_path)) as first:
        first.post("/api/telemetry",json=window(),headers=auth(DEVICE))
    with TestClient(create_app(path, VIEW, DEVICE, tmp_path)) as second:
        assert len(second.get("/api/events",headers=auth(VIEW)).json()["events"]) == 1


def test_request_bound(client):
    assert client.post("/api/telemetry",content=b"x"*131073,headers=auth(DEVICE)).status_code == 413


def test_no_unconfigured_credentials(tmp_path):
    with pytest.raises(RuntimeError):
        create_app(tmp_path / "bad.db", "short", DEVICE)


def test_expired_raw_data_never_reinserted(tmp_path):
    path = tmp_path / "ring.db"
    app = create_app(path, VIEW, DEVICE, tmp_path)
    data = window()
    with TestClient(app) as client:
        assert client.post("/api/telemetry",json=data,headers=auth(DEVICE)).status_code == 200
        with sqlite3.connect(path) as db:
            db.execute("DELETE FROM telemetry")
        assert client.post("/api/telemetry",json=data,headers=auth(DEVICE)).status_code == 409
        assert client.post("/api/telemetry",json=window(seq=2),headers=auth(DEVICE)).status_code == 200
