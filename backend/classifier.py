"""Orientation-independent engineering baseline; NOT a trained pet behaviour model."""
import math

ALGORITHM = "imu-rules-v1"


def classify(samples, sample_rate):
    acceleration = [math.sqrt(s.ax*s.ax + s.ay*s.ay + s.az*s.az) for s in samples]
    rotation = [math.sqrt(s.gx*s.gx + s.gy*s.gy + s.gz*s.gz) for s in samples]
    rms = math.sqrt(sum((a - 1.0)**2 for a in acceleration) / len(samples))
    gyro = math.sqrt(sum(g*g for g in rotation) / len(samples))
    features = {"accelRms": round(rms, 4), "gyroRms": round(gyro, 3),
                "peakAcceleration": round(max(acceleration), 4), "sampleCount": len(samples)}
    if len(samples) < 4:
        activity, confidence = "unknown", 0.0
    elif rms < 0.07 and gyro < 12:
        activity, confidence = "rest", 0.75
    elif sample_rate < 20:
        activity, confidence = "unknown", 0.0
    elif gyro > 150 and rms > 0.12:
        activity, confidence = "shake", 0.55
    elif rms > 0.32:
        activity, confidence = "run", 0.55
    else:
        activity, confidence = "walk", 0.5
    return {"activity": activity, "confidence": confidence, "features": features,
            "algorithm": ALGORITHM, "interpretation": "motion-proxy-not-validated-pet-behavior"}
