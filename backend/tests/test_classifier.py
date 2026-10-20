from backend.app import Sample
from backend.classifier import classify


def samples(accel=1, gyro=0, axis="az"):
    values = []
    for i in range(50):
        row = dict(t=i*20, ax=0, ay=0, az=0, gx=gyro, gy=0, gz=0)
        row[axis] = accel
        values.append(Sample(**row))
    return values


def test_stationary_orientation_does_not_change_activity():
    for axis in ("ax", "ay", "az"):
        assert classify(samples(axis=axis), 50)["activity"] == "rest"


def test_motion_proxy_thresholds_and_low_rate_abstention():
    assert classify(samples(1.15, 30), 50)["activity"] == "walk"
    assert classify(samples(1.5, 50), 50)["activity"] == "run"
    assert classify(samples(1.3, 200), 50)["activity"] == "shake"
    assert classify(samples(1.5, 50), 5)["activity"] == "unknown"
    assert classify(samples()[:1], 50)["activity"] == "unknown"
