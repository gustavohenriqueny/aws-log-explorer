#!/usr/bin/env python3
"""Start FastAPI and Vite locally with one ephemeral in-memory session token."""
from __future__ import annotations

import os
import secrets
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"


def run_setup() -> None:
    if not (BACKEND / ".venv").is_dir():
        subprocess.run(["uv", "sync", "--project", str(BACKEND), "--locked"], check=True, cwd=ROOT)
    if not (FRONTEND / "node_modules").is_dir():
        subprocess.run(["npm", "ci", "--prefix", str(FRONTEND)], check=True, cwd=ROOT)


def terminate(processes: list[subprocess.Popen[object]]) -> None:
    for process in processes:
        if process.poll() is None:
            process.terminate()
    for process in processes:
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def main() -> int:
    run_setup()
    token = secrets.token_urlsafe(32)
    environment = os.environ.copy()
    environment["ALE_SESSION_TOKEN"] = token
    # CLI is the production default. Set ALE_PROVIDER=fake for a deterministic offline demo.
    environment.setdefault("ALE_PROVIDER", "cli")
    frontend_environment = environment.copy()
    frontend_environment["VITE_ALE_SESSION"] = token
    backend_process = subprocess.Popen(
        ["uv", "run", "--project", str(BACKEND), "uvicorn", "aws_log_explorer.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=ROOT,
        env=environment,
    )
    frontend_process = subprocess.Popen(
        ["npm", "run", "dev", "--prefix", str(FRONTEND), "--", "--host", "127.0.0.1"],
        cwd=ROOT,
        env=frontend_environment,
    )
    processes: list[subprocess.Popen[object]] = [backend_process, frontend_process]

    def stop(_: int, __: object) -> None:
        terminate(processes)
        raise SystemExit(0)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        while True:
            for process in processes:
                result = process.poll()
                if result is not None:
                    return result
            time.sleep(0.1)
    finally:
        terminate(processes)


if __name__ == "__main__":
    sys.exit(main())
