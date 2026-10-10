"""Run as the service user with PETLINK_DB set; SQLite online backup, no raw WAL copy."""
import os
from pathlib import Path
import sqlite3
import sys

target = Path(sys.argv[1])
if target.exists():
    raise SystemExit("Refusing to overwrite an existing backup")
target.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(os.environ["PETLINK_DB"]) as source, sqlite3.connect(target) as dest:
    source.backup(dest)
target.chmod(0o600)
print("SQLite backup completed")
