import asyncio
import io
import json
import struct
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
import pytest
from backend.app import create_app
from backend import jobs

VIEW, DEVICE, WORKER = "v"*32, "d"*32, "w"*32
auth = lambda token: {"Authorization": "Bearer " + token}
PNG = b"\x89PNG\r\n\x1a\n" + b"test-image-input"
METADATA = json.dumps({'method': 'engineering-fixture', 'limitations': ['not real inference']}).encode()


def triangle_glb(change=None):
    """A renderable embedded triangle, including positions, indices, and real BIN data."""
    binary = struct.pack('<9f3H', 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 2)
    document = {
        'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0}], 'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1}]}],
        'buffers': [{'byteLength': len(binary)}],
        'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 36}, {'buffer': 0, 'byteOffset': 36, 'byteLength': 6}],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3', 'min': [0, 0, 0], 'max': [1, 1, 0]},
            {'bufferView': 1, 'componentType': 5123, 'count': 3, 'type': 'SCALAR'},
        ],
    }
    if change: change(document)
    encoded = json.dumps(document).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary += b'\0' * (-len(binary) % 4)
    return (struct.pack('<4sII', b'glTF', 2, 12+8+len(encoded)+8+len(binary))
            + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
            + struct.pack('<II', len(binary), 0x004E4942) + binary)


GLB = triangle_glb()
LAYOUT = {'version': 1, 'unit': 'relative', 'method': 'test', 'limitations': [],
          'rooms': [{'name': 'room', 'polygon': [{'x': 0, 'y': 0}, {'x': 1, 'y': 0}, {'x': 0, 'y': 1}]}]}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PETLINK_WORKER_TOKEN", WORKER)
    with TestClient(create_app(tmp_path/'jobs.db',VIEW,DEVICE,tmp_path)) as client:
        yield client


def upload(client, kind='pet'):
    r = client.post('/api/jobs',data={'kind':kind},files={'files[]':('pet.png',PNG,'image/png')},headers=auth(VIEW))
    assert r.status_code == 200, r.text
    return r.json()


def claim(client):
    return client.post('/api/worker/claim', headers=auth(WORKER)).json()['job']


def complete(client, job, artifacts=None):
    artifacts = artifacts if artifacts is not None else [('model.glb', GLB), ('result.json', METADATA)]
    return client.post(f"/api/worker/jobs/{job['id']}/complete", data={'lease': job['lease']},
                       files=[('files[]', (name, content, 'application/octet-stream')) for name, content in artifacts],
                       headers=auth(WORKER))


def endpoint(client, path):
    return next(route.endpoint for route in client.app.routes if getattr(route, 'path', None) == path)


def assert_no_results(tmp_path, job):
    assert sorted(path.name for path in (tmp_path / 'media' / job['id']).iterdir()) == ['inputs']


def test_media_auth_and_magic(client):
    assert client.get('/api/jobs').status_code == 401
    assert client.get('/api/jobs',headers=auth(DEVICE)).status_code == 401
    bad = client.post('/api/jobs',data={'kind':'pet'},files={'files[]':('fake.png',b'<script>','image/png')},headers=auth(VIEW))
    assert bad.status_code == 415
    job = upload(client)
    url = job['inputs'][0]['url'].replace('/petlink','',1)
    assert client.get(url).status_code == 401
    assert client.get(url,headers=auth(VIEW)).content == PNG


def test_claim_cancel_retry_stale_completion(client):
    job=upload(client)
    claim=client.post('/api/worker/claim',headers=auth(WORKER)).json()['job']
    assert claim['id']==job['id'] and claim['status']=='running'
    client.post(f"/api/jobs/{job['id']}/cancel",headers=auth(VIEW))
    assert client.post(f"/api/worker/jobs/{job['id']}/progress",json={'lease':claim['lease'],'stage':'late'},headers=auth(WORKER)).status_code == 409
    assert client.post(f"/api/jobs/{job['id']}/retry",headers=auth(VIEW)).json()['status']=='queued'
    newer=client.post('/api/worker/claim',headers=auth(WORKER)).json()['job']
    assert newer['lease'] != claim['lease']


def test_result_persistence_and_authorization(client):
    job=upload(client)
    claim=client.post('/api/worker/claim',headers=auth(WORKER)).json()['job']
    files=[('files[]',('model.glb',GLB,'model/gltf-binary')),('files[]',('result.json',METADATA,'application/json'))]
    r=client.post(f"/api/worker/jobs/{job['id']}/complete",data={'lease':claim['lease']},files=files,headers=auth(WORKER))
    assert r.status_code==200, r.text
    assert r.json()['status']=='succeeded'
    url=r.json()['result']['modelUrl'].replace('/petlink','',1)
    assert client.get(url,headers=auth(VIEW)).content == GLB
    assert client.get(url).status_code==401
    assert client.get('/api/jobs',headers=auth(VIEW)).json()['jobs'][0]['result']['method']=='engineering-fixture'


def test_heartbeat(client):
    assert not client.get('/api/jobs',headers=auth(VIEW)).json()['worker']['online']
    client.post('/api/worker/heartbeat',json={'capabilities':['pet']},headers=auth(WORKER))
    assert client.get('/api/jobs',headers=auth(VIEW)).json()['worker']=={'online':True,'capabilities':['pet']}


@pytest.mark.parametrize('model', [
    b'glTF', GLB[:-4], GLB[:8] + struct.pack('<I', len(GLB)+4) + GLB[12:],
    triangle_glb(lambda doc: doc['buffers'][0].update(uri='https://external.invalid/model.bin')),
    triangle_glb(lambda doc: doc['bufferViews'][0].update(byteLength=10000)),
    triangle_glb(lambda doc: doc['accessors'][0].update(count=10000)),
])
def test_invalid_model_never_succeeds_or_leaks(client, tmp_path, model):
    upload(client)
    job = claim(client)
    response = complete(client, job, [('model.glb', model), ('result.json', METADATA)])
    assert response.status_code == 422, response.text
    assert client.get('/api/jobs', headers=auth(VIEW)).json()['jobs'][0]['status'] == 'running'
    assert_no_results(tmp_path, job)
    assert complete(client, job).status_code == 200


@pytest.mark.parametrize('layout', [
    b'not JSON', json.dumps({**LAYOUT, 'unit': 'meters'}).encode(),
    json.dumps({**LAYOUT, 'rooms': [{'polygon': [{'x': 0, 'y': 0}]}]}).encode(),
    json.dumps({**LAYOUT, 'rooms': [{'polygon': [{'x': float('nan'), 'y': 0}]*3}]}).encode(),
    json.dumps({**LAYOUT, 'rooms': [{'polygon': [{'x': 1000001, 'y': 0}]*3}]}).encode(),
])
def test_invalid_layout_never_succeeds_or_leaks(client, tmp_path, layout):
    upload(client, kind='room')
    job = claim(client)
    response = complete(client, job, [('layout.json', layout), ('result.json', METADATA)])
    assert response.status_code == 422, response.text
    assert_no_results(tmp_path, job)


def test_layout_matches_frontend_schema(client):
    upload(client, kind='room')
    job = claim(client)
    response = complete(client, job, [('layout.json', json.dumps(LAYOUT)), ('result.json', METADATA)])
    assert response.status_code == 200, response.text
    url = response.json()['result']['layoutUrl'].replace('/petlink', '', 1)
    assert client.get(url, headers=auth(VIEW)).json() == LAYOUT


@pytest.mark.parametrize('metadata', [b'not JSON', b'[]', b'{}', b'{"method":"test","limitations":null}'])
def test_bad_metadata_returns_422_and_cleans_files(client, tmp_path, metadata):
    upload(client)
    job = claim(client)
    response = complete(client, job, [('model.glb', GLB), ('result.json', metadata)])
    assert response.status_code == 422, response.text
    assert_no_results(tmp_path, job)


def test_result_quota_counts_inputs_and_existing_results(client, tmp_path, monkeypatch):
    upload(client)
    first = claim(client)
    assert complete(client, first).status_code == 200
    upload(client)
    job = claim(client)
    used = sum(path.stat().st_size for path in (tmp_path / 'media').rglob('*') if path.is_file())
    monkeypatch.setattr(jobs, 'MAX_STORAGE', used+len(GLB)+len(METADATA)-1)
    response = complete(client, job)
    assert response.status_code == 507, response.text
    assert_no_results(tmp_path, job)
    # The first successful job remains readable after the second upload fails.
    assert client.get(f"/api/jobs/{first['id']}/artifacts/model.glb", headers=auth(VIEW)).content == GLB
    monkeypatch.setattr(jobs, 'MAX_STORAGE', used+len(GLB)+len(METADATA))
    assert complete(client, job).status_code == 200


def test_cancel_after_validation_cleans_staging(client, tmp_path, monkeypatch):
    upload(client)
    job = claim(client)
    original = jobs.validate_glb
    cancel = endpoint(client, '/api/jobs/{job_id}/cancel')
    def validate_and_cancel(path):
        original(path)
        assert cancel(job['id'])['status'] == 'cancelled'
    monkeypatch.setattr(jobs, 'validate_glb', validate_and_cancel)
    response = complete(client, job)
    assert response.status_code == 409, response.text
    assert_no_results(tmp_path, job)


def test_interrupted_upload_cleans_partial_files(client, tmp_path):
    upload(client)
    job = claim(client)
    complete_job = endpoint(client, '/api/worker/jobs/{job_id}/complete')
    class InterruptedUpload(UploadFile):
        calls = 0
        async def read(self, size=-1):
            self.calls += 1
            if self.calls > 1: raise OSError('disconnected upload')
            return await super().read(size)
    uploaded = InterruptedUpload(io.BytesIO(GLB), filename='model.glb')
    with pytest.raises(OSError, match='disconnected'):
        asyncio.run(complete_job(job['id'], job['lease'], [uploaded]))
    assert uploaded.file.closed
    assert_no_results(tmp_path, job)


def test_concurrent_completion_cannot_overwrite_published_model(client, tmp_path):
    upload(client)
    job = claim(client)
    complete_job = endpoint(client, '/api/worker/jobs/{job_id}/complete')
    class InterleavedUpload(UploadFile):
        completed = False
        async def read(self, size=-1):
            if not self.completed:
                self.completed = True
                winner = await complete_job(job['id'], job['lease'], [
                    UploadFile(io.BytesIO(GLB), filename='model.glb'),
                    UploadFile(io.BytesIO(METADATA), filename='result.json'),
                ])
                assert winner['status'] == 'succeeded'
            return await super().read(size)
    loser = InterleavedUpload(io.BytesIO(b'invalid overwrite'), filename='model.glb')
    with pytest.raises(HTTPException) as error:
        asyncio.run(complete_job(job['id'], job['lease'], [loser]))
    assert error.value.status_code == 409
    assert client.get(f"/api/jobs/{job['id']}/artifacts/model.glb", headers=auth(VIEW)).content == GLB
    assert not list((tmp_path / 'media' / job['id']).glob('.upload-*'))
    assert len(list((tmp_path / 'media' / job['id']).glob('result-*'))) == 1


def test_retry_respects_six_active_jobs(client):
    cancelled = []
    for _ in range(7):
        job = upload(client)
        client.post(f"/api/jobs/{job['id']}/cancel", headers=auth(VIEW))
        cancelled.append(job)
    for job in cancelled[:6]:
        assert client.post(f"/api/jobs/{job['id']}/retry", headers=auth(VIEW)).status_code == 200
    response = client.post(f"/api/jobs/{cancelled[6]['id']}/retry", headers=auth(VIEW))
    assert response.status_code == 429
    listed = client.get('/api/jobs', headers=auth(VIEW)).json()['jobs']
    assert sum(job['status'] in ('queued', 'running') for job in listed) == 6


def test_retry_removes_previous_failed_result_files(client, tmp_path):
    upload(client)
    job = claim(client)
    orphan = tmp_path / 'media' / job['id'] / 'result-1'
    orphan.mkdir()
    (orphan / 'model.glb').write_bytes(b'previous interrupted upload')
    response = client.post(f"/api/worker/jobs/{job['id']}/progress", json={
        'lease': job['lease'], 'stage': 'failed', 'error': 'upload failed'}, headers=auth(WORKER))
    assert response.status_code == 200
    assert client.post(f"/api/jobs/{job['id']}/retry", headers=auth(VIEW)).status_code == 200
    assert_no_results(tmp_path, job)
    newer = claim(client)
    assert newer['lease'] != job['lease']
    assert complete(client, newer).status_code == 200
