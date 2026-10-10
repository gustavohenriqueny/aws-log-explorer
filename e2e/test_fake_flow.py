"""Fake-only end-to-end contract for the local investigation journey."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from aws_log_explorer.main import create_app
from aws_log_explorer.provider import FakeAwsProvider
from aws_log_explorer.security import AwsConfigReader

TOKEN = "e2e-fake-token"
HEADERS = {"X-ALE-Session": TOKEN, "host": "localhost"}


def test_fake_profile_to_history_and_live_stop(tmp_path: Path) -> None:
    config_path = tmp_path / "config"
    config_path.write_text("[profile demo-sso]\nregion = us-east-1\nsso_session = fixture\n", encoding="utf-8")
    app = create_app(provider=FakeAwsProvider(expired=True), config_reader=AwsConfigReader(config_path), session_token=TOKEN)
    with TestClient(app) as client:
        profiles = client.get("/api/profiles", headers=HEADERS).json()
        assert profiles == [{"name": "demo-sso", "region": "us-east-1", "region_source": "profile", "is_sso": True, "sso_session_key": profiles[0]["sso_session_key"], "is_production": False}]
        assert client.post("/api/profiles/demo-sso/check", headers=HEADERS).json()["status"] == "expired"
        login = client.post("/api/profiles/demo-sso/login", headers=HEADERS).json()
        assert client.get(f"/api/login-jobs/{login['id']}", headers=HEADERS).status_code == 200
        cluster = client.get("/api/ecs/clusters?profile=demo-sso&region=us-east-1", headers=HEADERS).json()[0]["name"]
        services = client.get(f"/api/ecs/services?profile=demo-sso&region=us-east-1&cluster={cluster}", headers=HEADERS).json()
        sources = client.post("/api/ecs/log-sources/resolve", headers=HEADERS, json={"profile": "demo-sso", "region": "us-east-1", "cluster": cluster, "services": [service["name"] for service in services]}).json()
        end = datetime.now(UTC)
        request = {"profile": "demo-sso", "region": "us-east-1", "cluster": cluster, "source_ids": [source["id"] for source in sources], "start_time": (end - timedelta(hours=1)).isoformat(), "end_time": end.isoformat()}
        first = client.post("/api/logs/search", headers=HEADERS, json=request).json()
        assert len(first["events"]) == 2 and first["cursor"]
        assert client.post("/api/logs/search", headers=HEADERS, json=request | {"cursor": first["cursor"]}).status_code == 200
        with client.websocket_connect("/api/logs/live", headers={"host": "localhost"}) as websocket:
            websocket.send_json({"type": "start", "token": TOKEN, "request": request})
            assert websocket.receive_json()["type"] == "status"
            assert websocket.receive_json()["type"] == "event"
            assert websocket.receive_json()["type"] == "event"
            websocket.send_json({"type": "stop"})
            assert websocket.receive_json()["type"] == "stopped"
