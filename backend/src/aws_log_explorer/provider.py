from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import UTC, datetime
from typing import Literal, Sequence

from .cli import (
    AllowedAwsCliRunner,
    DescribeServices,
    DescribeTaskDefinition,
    FilterLogEvents,
    ListClusters,
    ListServices,
    StsIdentity,
)
from .domain import (
    AppError,
    ClusterView,
    DescribedService,
    GroupPage,
    GroupQuery,
    LogSource,
    ProfileSummary,
    RawLogEvent,
    ServiceSummary,
    SessionCheck,
)


def _is_ignored_container(name: str) -> bool:
    lower = name.lower()
    return (
        "aws-collector" in lower
        or "aws-colletor" in lower
        or "aws-otel" in lower
        or "otel-collector" in lower
        or "adot-collector" in lower
    )


def _key(*values: str) -> str:
    return hashlib.sha256("\x1f".join(values).encode()).hexdigest()[:20]


class AwsCliProvider:
    """Production provider. It calls only the runner's typed operations."""
    def __init__(self, runner: AllowedAwsCliRunner) -> None:
        self.runner = runner

    async def check_session(self, profile: ProfileSummary) -> SessionCheck:
        try:
            await self.runner.run(StsIdentity(profile.name, profile.region), timeout=15)
            return SessionCheck(profile=profile.name, status="connected", checked_at=datetime.now(UTC))
        except RuntimeError as exc:
            error = AppError.model_validate_json(str(exc))
            state: Literal["expired", "denied", "error"]
            if error.code == "AUTH_EXPIRED":
                state = "expired"
            elif error.code == "ACCESS_DENIED":
                state = "denied"
            else:
                state = "error"
            return SessionCheck(profile=profile.name, status=state, checked_at=datetime.now(UTC), error=error)

    async def login(self, profile: ProfileSummary, cancel: asyncio.Event) -> None:
        if not profile.is_sso:
            raise ValueError("PROFILE_NOT_SSO")
        # Runner operation is intentionally imported lazily to keep the public command set explicit.
        from .cli import SsoLogin
        task = asyncio.create_task(self.runner.run(SsoLogin(profile.name), timeout=300))
        done, _ = await asyncio.wait({task, asyncio.create_task(cancel.wait())}, return_when=asyncio.FIRST_COMPLETED)
        if task not in done:
            task.cancel()
            raise asyncio.CancelledError
        await task

    async def list_clusters(self, profile: str, region: str) -> list[ClusterView]:
        payload = json.loads(await self.runner.run(ListClusters(profile, region), timeout=20))
        return [ClusterView(name=item.rsplit("/", 1)[-1], arn_key=_key(item)) for item in payload.get("clusterArns", [])]

    async def list_services(self, profile: str, region: str, cluster: str) -> list[ServiceSummary]:
        payload = json.loads(await self.runner.run(ListServices(profile, region, cluster), timeout=20))
        return [ServiceSummary(name=item.rsplit("/", 1)[-1], cluster=cluster) for item in payload.get("serviceArns", [])]

    async def describe_services(self, profile: str, region: str, cluster: str, services: Sequence[str]) -> list[DescribedService]:
        result: list[DescribedService] = []
        for start in range(0, len(services), 10):
            payload = json.loads(await self.runner.run(DescribeServices(profile, region, cluster, tuple(services[start:start + 10])), timeout=20))
            result.extend(DescribedService(name=item["serviceName"], cluster=cluster, task_definition_key=item["taskDefinition"], status=item.get("status")) for item in payload.get("services", []))
        return result

    async def resolve_log_sources(self, profile: str, region: str, cluster: str, services: Sequence[str]) -> list[LogSource]:
        described = await self.describe_services(profile, region, cluster, services)
        task_definitions: dict[str, dict[str, object]] = {}
        for service in described:
            if service.task_definition_key not in task_definitions:
                payload = await self.runner.run(DescribeTaskDefinition(profile, region, service.task_definition_key), timeout=20)
                task_definitions[service.task_definition_key] = json.loads(payload).get("taskDefinition", {})
        candidates: list[tuple[str, str, str, str, str | None]] = []
        for service in described:
            task_definition = task_definitions[service.task_definition_key]
            containers = task_definition.get("containerDefinitions", [])
            if not isinstance(containers, list):
                continue
            for definition in containers:
                if not isinstance(definition, dict) or definition.get("logConfiguration", {}).get("logDriver") != "awslogs":
                    continue
                options = definition.get("logConfiguration", {}).get("options", {})
                group = options.get("awslogs-group") if isinstance(options, dict) else None
                container = definition.get("name")
                if not isinstance(container, str) or _is_ignored_container(container):
                    continue
                if isinstance(group, str):
                    candidates.append((service.name, container, group, str(options.get("awslogs-region") or region), options.get("awslogs-stream-prefix") if isinstance(options.get("awslogs-stream-prefix"), str) else None))
        grouped: dict[tuple[str, str], list[tuple[str, str, str, str, str | None]]] = {}
        for item in candidates:
            grouped.setdefault((item[3], item[2]), []).append(item)
        sources: list[LogSource] = []
        for (source_region, log_group), entries in grouped.items():
            shared = len(entries) > 1
            services_value = sorted({entry[0] for entry in entries})
            containers_value = sorted({entry[1] for entry in entries})
            query_key = _key(source_region, log_group)
            for service_name, container, _, _, prefix in entries:
                source_id = _key(profile, region, cluster, log_group, service_name, container, prefix or "")
                sources.append(LogSource(id=source_id, query_key=query_key, service_candidates=services_value, service=service_name if not shared else None, container_candidates=containers_value, container=container if not shared else None, log_group=log_group, region=source_region, stream_prefix=prefix, shared=shared))
        return sources

    async def filter_log_events(self, query: GroupQuery) -> GroupPage:
        payload = json.loads(await self.runner.run(FilterLogEvents(profile=query.profile, region=query.region, log_group=query.log_group, start_time_ms=int(query.start_time.timestamp() * 1000), end_time_ms=int(query.end_time.timestamp() * 1000), filter_pattern=query.filter_pattern, next_token=query.next_token, limit=query.limit), timeout=30))
        return GroupPage(events=[RawLogEvent(event_id=item["eventId"], timestamp=item["timestamp"], ingestion_time=item.get("ingestionTime"), log_stream=item["logStreamName"], message=item["message"]) for item in payload.get("events", [])], next_token=payload.get("nextToken"))


class FakeAwsProvider:
    """Fictitious in-memory provider; no filesystem, credentials, network, or AWS CLI."""
    def __init__(self, expired: bool = False) -> None:
        self.expired = expired
        self.calls: list[str] = []
        self.clusters = [ClusterView(name="demo-cluster", arn_key="cluster-demo")]
        self.services = [ServiceSummary(name="catalog-api", cluster="demo-cluster"), ServiceSummary(name="checkout-api", cluster="demo-cluster")]
        self.sources = [
            LogSource(id="catalog-source", query_key="group-catalog", service_candidates=["catalog-api"], service="catalog-api", container_candidates=["api"], container="api", log_group="demo-catalog", region="us-east-1", stream_prefix="ecs", shared=False),
            LogSource(id="checkout-source", query_key="group-shared", service_candidates=["checkout-api", "catalog-api"], container_candidates=["api"], log_group="demo-shared", region="us-east-1", stream_prefix="ecs", shared=True),
        ]
        self.pages: dict[str, list[GroupPage]] = {
            "demo-catalog": [GroupPage(events=[RawLogEvent(event_id="fixture-001", timestamp=1_700_000_000_000, ingestion_time=1_700_000_000_010, log_stream="ecs/api/fixture", message='{"level":"info","message":"fixture catalog event"}')], next_token="more-catalog"), GroupPage(events=[], next_token=None)],
            "demo-shared": [GroupPage(events=[RawLogEvent(event_id="fixture-002", timestamp=1_700_000_000_001, ingestion_time=1_700_000_000_011, log_stream="unknown", message="fixture shared event")], next_token=None)],
        }

    async def check_session(self, profile: ProfileSummary) -> SessionCheck:
        self.calls.append("check")
        return SessionCheck(profile=profile.name, status="expired" if self.expired else "connected", checked_at=datetime.now(UTC), error=AppError(code="AUTH_EXPIRED", message="AWS session expired. Sign in again.", action="login") if self.expired else None)

    async def login(self, profile: ProfileSummary, cancel: asyncio.Event) -> None:
        self.calls.append("login")
        if cancel.is_set():
            raise asyncio.CancelledError
        await asyncio.sleep(0)
        self.expired = False

    async def list_clusters(self, profile: str, region: str) -> list[ClusterView]:
        self.calls.append("clusters")
        return self.clusters

    async def list_services(self, profile: str, region: str, cluster: str) -> list[ServiceSummary]:
        self.calls.append("services")
        return [item for item in self.services if item.cluster == cluster]

    async def describe_services(self, profile: str, region: str, cluster: str, services: Sequence[str]) -> list[DescribedService]:
        return [DescribedService(name=name, cluster=cluster, task_definition_key=f"td-{name}") for name in services]

    async def resolve_log_sources(self, profile: str, region: str, cluster: str, services: Sequence[str]) -> list[LogSource]:
        self.calls.append("resolve")
        wanted = set(services)
        return [source for source in self.sources if wanted.intersection(source.service_candidates)]

    async def filter_log_events(self, query: GroupQuery) -> GroupPage:
        self.calls.append("filter")
        pages = self.pages.get(query.log_group, [GroupPage(events=[])])
        return pages[1] if query.next_token else pages[0]
