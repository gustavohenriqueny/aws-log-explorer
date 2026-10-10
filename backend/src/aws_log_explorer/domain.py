"""Pure domain contracts for the local AWS Log Explorer."""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Literal, Protocol, Sequence

from pydantic import BaseModel, Field

ErrorCode = Literal[
    "CLI_MISSING", "CLI_UNSUPPORTED", "AWS_CONFIG_INVALID", "AUTH_EXPIRED",
    "PROFILE_NOT_SSO", "ACCESS_DENIED", "NOT_FOUND", "THROTTLED", "TIMEOUT",
    "CANCELLED", "VALIDATION_ERROR", "COMMAND_NOT_ALLOWED", "UNKNOWN_AWS_ERROR",
]


class AppError(BaseModel):
    code: ErrorCode
    message: str
    retryable: bool = False
    action: Literal["login", "retry", "reload", "none"] = "none"
    details: dict[str, str | int | bool] | None = None


class ProfileSummary(BaseModel):
    name: str
    region: str
    region_source: Literal["profile", "default"]
    is_sso: bool
    sso_session_key: str | None = None
    is_production: bool


class SessionCheck(BaseModel):
    profile: str
    status: Literal["connected", "expired", "denied", "error"]
    checked_at: datetime
    error: AppError | None = None


class LoginJob(BaseModel):
    id: str
    profile: str
    status: Literal["pending", "running", "succeeded", "failed", "cancelled", "timeout"]
    created_at: datetime
    finished_at: datetime | None = None
    error: AppError | None = None


class ClusterView(BaseModel):
    name: str
    arn_key: str


class ServiceSummary(BaseModel):
    name: str
    cluster: str


class DescribedService(BaseModel):
    name: str
    cluster: str
    task_definition_key: str
    status: str | None = None


class LogSource(BaseModel):
    id: str
    query_key: str
    service_candidates: list[str]
    service: str | None = None
    container_candidates: list[str]
    container: str | None = None
    log_group: str
    region: str
    stream_prefix: str | None = None
    shared: bool = False


class GroupQuery(BaseModel):
    profile: str
    region: str
    log_group: str
    start_time: datetime
    end_time: datetime
    filter_pattern: str | None = None
    next_token: str | None = None
    limit: int = Field(default=500, ge=1, le=500)


class RawLogEvent(BaseModel):
    event_id: str
    timestamp: int
    ingestion_time: int | None = None
    log_stream: str
    message: str


class GroupPage(BaseModel):
    events: list[RawLogEvent]
    next_token: str | None = None


class SourceError(BaseModel):
    query_key: str
    error: AppError


class NormalizedLogEvent(BaseModel):
    event_id: str
    timestamp: int
    ingestion_time: int | None = None
    profile: str
    region: str
    cluster: str
    service: str | None = None
    service_candidates: list[str]
    container: str | None = None
    container_candidates: list[str]
    log_group: str
    log_stream: str
    message: str
    parsed_message: dict[str, Any] | list[Any] | None = None
    shared_source: bool


class SearchRequest(BaseModel):
    profile: str
    region: str
    cluster: str
    source_ids: list[str]
    start_time: datetime
    end_time: datetime
    filter_pattern: str | None = None
    cursor: str | None = None


class SearchResponse(BaseModel):
    events: list[NormalizedLogEvent]
    cursor: str | None = None
    has_more: bool
    truncated: bool
    partial_errors: list[SourceError]
    ordering: Literal["approximate"] = "approximate"


class AwsProvider(Protocol):
    async def check_session(self, profile: ProfileSummary) -> SessionCheck: ...
    async def login(self, profile: ProfileSummary, cancel: asyncio.Event) -> None: ...
    async def list_clusters(self, profile: str, region: str) -> list[ClusterView]: ...
    async def list_services(self, profile: str, region: str, cluster: str) -> list[ServiceSummary]: ...
    async def describe_services(self, profile: str, region: str, cluster: str, services: Sequence[str]) -> list[DescribedService]: ...
    async def resolve_log_sources(self, profile: str, region: str, cluster: str, services: Sequence[str]) -> list[LogSource]: ...
    async def filter_log_events(self, query: GroupQuery) -> GroupPage: ...
