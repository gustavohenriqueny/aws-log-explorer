from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from aws_log_explorer.cli import (
    CommandNotAllowed,
    CommandPolicy,
    DescribeServices,
    FilterLogEvents,
    ListClusters,
    SsoLogin,
    StsIdentity,
    sanitize_aws_text,
)
from aws_log_explorer.main import create_app
from aws_log_explorer.provider import FakeAwsProvider
from aws_log_explorer.security import AwsConfigReader

TOKEN = "unit-test-session-token"
HEADERS = {"X-ALE-Session": TOKEN, "host": "localhost"}


@pytest.fixture
def config(tmp_path: Path) -> AwsConfigReader:
    path = tmp_path / "config"
    path.write_text("[profile demo]\nregion = us-east-1\nsso_session = company\nsso_account_id = 000000000000\n", encoding="utf-8")
    return AwsConfigReader(path)


@pytest.fixture
def client(config: AwsConfigReader) -> TestClient:
    with TestClient(create_app(provider=FakeAwsProvider(expired=True), config_reader=config, session_token=TOKEN)) as value:
        yield value


def test_config_never_returns_sensitive_sso_values(config: AwsConfigReader) -> None:
    profile = config.read()[0]
    assert profile.name == "demo"
    assert profile.is_sso and profile.region == "us-east-1"
    assert "000000000000" not in profile.model_dump_json()


def test_command_policy_is_closed_and_read_only() -> None:
    policy = CommandPolicy()
    assert policy.compile(StsIdentity("demo", "us-east-1"))[:3] == ("aws", "sts", "get-caller-identity")
    assert "--no-cli-pager" in policy.compile(ListClusters("demo", "us-east-1"))
    assert policy.compile(SsoLogin("demo"))[:3] == ("aws", "sso", "login")
    assert "--max-items" in policy.compile(FilterLogEvents("demo", "us-east-1", "fixture", 1, 2))
    with pytest.raises(CommandNotAllowed):
        policy.compile(DescribeServices("demo", "us-east-1", "cluster", ()))
    with pytest.raises(CommandNotAllowed):
        policy.compile(FilterLogEvents("demo", "us-east-1", "--unmask", 1, 2))


def test_sanitizer_removes_sensitive_text() -> None:
    text = sanitize_aws_text("arn:aws:iam::123456789012:user/x https://portal.awsapps.com/start AKIAABCDEFGHIJKLMNOP")
    assert "123456789012" not in text and "awsapps.com" not in text and "AKIA" not in text


def test_api_requires_local_token_except_health(client: TestClient) -> None:
    assert client.get("/api/health", headers={"host": "localhost"}).status_code == 200
    assert client.get("/api/profiles", headers={"host": "localhost"}).status_code == 403
    profiles = client.get("/api/profiles", headers=HEADERS)
    assert profiles.status_code == 200 and profiles.json()[0]["name"] == "demo"


def test_fake_end_to_end_history_cursor_and_login(client: TestClient) -> None:
    client.get("/api/profiles", headers=HEADERS)
    check = client.post("/api/profiles/demo/check", headers=HEADERS).json()
    assert check["status"] == "expired"
    job = client.post("/api/profiles/demo/login", headers=HEADERS).json()
    status = client.get(f"/api/login-jobs/{job['id']}", headers=HEADERS)
    assert status.status_code == 200
    clusters = client.get("/api/ecs/clusters?profile=demo&region=us-east-1", headers=HEADERS).json()
    assert clusters[0]["name"] == "demo-cluster"
    services = client.get("/api/ecs/services?profile=demo&region=us-east-1&cluster=demo-cluster", headers=HEADERS).json()
    sources = client.post("/api/ecs/log-sources/resolve", headers=HEADERS, json={"profile": "demo", "region": "us-east-1", "cluster": "demo-cluster", "services": [item["name"] for item in services]}).json()
    now = datetime.now(UTC)
    body = {"profile": "demo", "region": "us-east-1", "cluster": "demo-cluster", "source_ids": [item["id"] for item in sources], "start_time": (now - timedelta(hours=1)).isoformat(), "end_time": now.isoformat()}
    response = client.post("/api/logs/search", headers=HEADERS, json=body)
    assert response.status_code == 200
    payload = response.json()
    assert [event["event_id"] for event in payload["events"]] == ["fixture-001", "fixture-002"]
    assert payload["events"][1]["service"] is None
    assert payload["has_more"] and payload["cursor"]
    more = client.post("/api/logs/search", headers=HEADERS, json=body | {"cursor": payload["cursor"]})
    assert more.status_code == 200


def test_search_rejects_unregistered_source_before_fake_aws(client: TestClient) -> None:
    client.get("/api/profiles", headers=HEADERS)
    now = datetime.now(UTC)
    response = client.post("/api/logs/search", headers=HEADERS, json={"profile": "demo", "region": "us-east-1", "cluster": "unknown", "source_ids": ["untrusted"], "start_time": (now - timedelta(minutes=1)).isoformat(), "end_time": now.isoformat()})
    assert response.status_code == 400


def test_ignored_collector_containers() -> None:
    from aws_log_explorer.provider import _is_ignored_container

    assert _is_ignored_container("aws-collector")
    assert _is_ignored_container("aws-colletor")
    assert _is_ignored_container("aws-otel-collector")
    assert _is_ignored_container("adot-collector")
    assert _is_ignored_container("my-app-aws-collector-sidecar")
    assert not _is_ignored_container("api")
    assert not _is_ignored_container("worker")
    assert not _is_ignored_container("orders-service")
