from __future__ import annotations

import configparser
import hashlib
import hmac
import os
import re
import secrets
from pathlib import Path

from .domain import AppError, ProfileSummary

_PROD = re.compile(r"(^|[-_.])(prod|prd|production)([-_.]|$)", re.IGNORECASE)


class ConfigError(Exception):
    def __init__(self, path: Path) -> None:
        self.error = AppError(code="AWS_CONFIG_INVALID", message="AWS config file is missing or invalid.", action="reload", details={"path": path.name})
        super().__init__(self.error.message)


class AwsConfigReader:
    """Reads only config (never credentials or SSO cache), on explicit request."""
    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path) if path is not None else Path(os.environ.get("AWS_CONFIG_FILE", "~/.aws/config")).expanduser()

    def read(self) -> list[ProfileSummary]:
        parser = configparser.ConfigParser()
        try:
            with self.path.open(encoding="utf-8") as config_file:
                parser.read_file(config_file)
        except (OSError, configparser.Error) as exc:
            raise ConfigError(self.path) from exc
        profiles: list[ProfileSummary] = []
        for section in parser.sections():
            name = "default" if section == "default" else section.removeprefix("profile ")
            if section != "default" and not section.startswith("profile "):
                continue
            values = parser[section]
            is_sso = "sso_session" in values or "sso_start_url" in values
            session = values.get("sso_session", name) if is_sso else None
            session_key = hashlib.sha256(session.encode()).hexdigest()[:20] if session else None
            region = values.get("region", "us-east-1")
            profiles.append(ProfileSummary(name=name, region=region, region_source="profile" if "region" in values else "default", is_sso=is_sso, sso_session_key=session_key, is_production=bool(_PROD.search(name))))
        return sorted(profiles, key=lambda profile: profile.name)


class FakeAwsConfigReader:
    """Deterministic config source for the offline demo and fake-only tests."""
    def read(self) -> list[ProfileSummary]:
        return [
            ProfileSummary(
                name="demo-sso",
                region="us-east-1",
                region_source="profile",
                is_sso=True,
                sso_session_key="fake-session",
                is_production=False,
            )
        ]


class LocalSessionGuard:
    def __init__(self, token: str | None = None) -> None:
        self.token = token or secrets.token_urlsafe(32)

    def valid_host(self, host: str | None) -> bool:
        hostname = (host or "").split(":", 1)[0]
        return hostname in {"127.0.0.1", "localhost"}

    def valid_origin(self, origin: str | None) -> bool:
        if origin is None:
            return True
        return origin.startswith("http://127.0.0.1") or origin.startswith("http://localhost")

    def validate(self, token: str | None, host: str | None, origin: str | None) -> bool:
        if token is None:
            return False
        return self.valid_host(host) and self.valid_origin(origin) and hmac.compare_digest(token, self.token)
