"""Resumable, range-checked downloads of public upstream model assets."""
import argparse
import concurrent.futures
import os
from pathlib import Path
import time
import urllib.request


def download(url: str, target: Path, total: int, workers: int = 6):
    target.parent.mkdir(parents=True, exist_ok=True)
    current = target.stat().st_size if target.exists() else 0
    if current == total:
        return
    if current > total:
        raise ValueError("Existing asset exceeds upstream size")
    chunk = 16 * 1024 * 1024
    parts = target.with_suffix(target.suffix + ".parts")
    parts.mkdir(exist_ok=True)
    ranges = [(start, min(start + chunk, total) - 1) for start in range(current, total, chunk)]

    def fetch(pair):
        start, end = pair
        path = parts / f"{start}-{end}"
        if path.exists() and path.stat().st_size == end - start + 1:
            return path
        for attempt in range(4):
            try:
                sep = "&" if "?" in url else "?"
                req = urllib.request.Request(f"{url}{sep}part={start}", headers={"Range": f"bytes={start}-{end}"})
                with urllib.request.urlopen(req, timeout=120) as response, path.open("wb") as out:
                    expected = f"bytes {start}-{end}/{total}"
                    if response.status != 206 or response.headers.get("Content-Range") != expected:
                        raise ValueError(f"Upstream did not honor range {start}-{end}")
                    while data := response.read(1024 * 1024):
                        out.write(data)
                if path.stat().st_size != end - start + 1:
                    raise IOError("Incomplete range")
                print(f"downloaded {start}-{end}", flush=True)
                return path
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(2 ** attempt)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(fetch, ranges))
    with target.open("ab") as out:
        for start, end in ranges:
            path = parts / f"{start}-{end}"
            with path.open("rb") as src:
                while data := src.read(1024 * 1024):
                    out.write(data)
            path.unlink()
    parts.rmdir()
    if target.stat().st_size != total:
        raise IOError("Final size mismatch")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("target", type=Path)
    parser.add_argument("size", type=int)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    download(args.url, args.target, args.size, args.workers)
