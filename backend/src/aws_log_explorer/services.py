from __future__ import annotations

import asyncio
import json
import secrets
from collections import OrderedDict
from datetime import UTC, datetime, timedelta
from typing import Awaitable, Callable, Sequence

from .domain import (
    AppError,
    AwsProvider,
    GroupPage,
    GroupQuery,
    LoginJob,
    LogSource,
    NormalizedLogEvent,
    ProfileSummary,
    SearchRequest,
    SearchResponse,
    SourceError,
)


class LoginJobManager:
    def __init__(self, provider: AwsProvider) -> None:
        self.provider = provider
        self.jobs: dict[str, LoginJob] = {}
        self._keys: dict[str, str] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}

    async def start(self, profile: ProfileSummary) -> LoginJob:
        if not profile.is_sso:
            raise ValueError("PROFILE_NOT_SSO")
        key = profile.sso_session_key or profile.name
        if key in self._keys:
            return self.jobs[self._keys[key]]
        now, job_id = datetime.now(UTC), secrets.token_urlsafe(16)
        job = LoginJob(id=job_id, profile=profile.name, status="pending", created_at=now)
        self.jobs[job_id], self._keys[key] = job, job_id
        cancel = asyncio.Event()
        self._tasks[job_id] = asyncio.create_task(self._run(job_id, profile, cancel))
        return job

    async def _run(self, job_id: str, profile: ProfileSummary, cancel: asyncio.Event) -> None:
        job = self.jobs[job_id].model_copy(update={"status": "running"})
        self.jobs[job_id] = job
        try:
            await self.provider.login(profile, cancel)
            self.jobs[job_id] = job.model_copy(update={"status": "succeeded", "finished_at": datetime.now(UTC)})
        except asyncio.CancelledError:
            self.jobs[job_id] = job.model_copy(update={"status": "cancelled", "finished_at": datetime.now(UTC)})
        except ValueError:
            self.jobs[job_id] = job.model_copy(update={"status": "failed", "finished_at": datetime.now(UTC), "error": AppError(code="PROFILE_NOT_SSO", message="This profile does not use SSO.")})
        except Exception:
            self.jobs[job_id] = job.model_copy(update={"status": "failed", "finished_at": datetime.now(UTC), "error": AppError(code="UNKNOWN_AWS_ERROR", message="SSO login failed.", retryable=True, action="retry")})

    def get(self, job_id: str) -> LoginJob | None:
        return self.jobs.get(job_id)

    async def cancel(self, job_id: str) -> LoginJob | None:
        task = self._tasks.get(job_id)
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        return self.jobs.get(job_id)

    async def close(self) -> None:
        await asyncio.gather(*(self.cancel(key) for key in tuple(self._tasks)), return_exceptions=True)


class ResourceRegistry:
    def __init__(self) -> None:
        self.profiles: dict[str, ProfileSummary] = {}
        self.clusters: set[tuple[str, str, str]] = set()
        self.services: set[tuple[str, str, str, str]] = set()
        self.sources: dict[str, LogSource] = {}

    def set_profiles(self, profiles: list[ProfileSummary]) -> None:
        self.profiles = {item.name: item for item in profiles}

    def profile(self, name: str) -> ProfileSummary:
        if name not in self.profiles:
            raise ValueError("Unknown discovered profile")
        return self.profiles[name]

    def register_clusters(self, profile: str, region: str, clusters: Sequence[object]) -> None:
        self.clusters.update((profile, region, getattr(item, "name")) for item in clusters)

    def require_cluster(self, profile: str, region: str, cluster: str) -> None:
        if (profile, region, cluster) not in self.clusters:
            raise ValueError("Unknown discovered cluster")

    def register_services(self, profile: str, region: str, cluster: str, services: Sequence[object]) -> None:
        self.services.update((profile, region, cluster, getattr(item, "name")) for item in services)

    def require_services(self, profile: str, region: str, cluster: str, services: Sequence[str]) -> None:
        if any((profile, region, cluster, service) not in self.services for service in services):
            raise ValueError("Unknown discovered service")

    def register_sources(self, sources: Sequence[LogSource]) -> None:
        self.sources.update({item.id: item for item in sources})

    def require_sources(self, source_ids: Sequence[str]) -> list[LogSource]:
        if not source_ids or len(set(source_ids)) != len(source_ids):
            raise ValueError("Source ids must be a non-empty unique list")
        try:
            return [self.sources[item] for item in source_ids]
        except KeyError as exc:
            raise ValueError("Unknown discovered log source") from exc


class CursorStore:
    def __init__(self) -> None:
        self.items: OrderedDict[str, tuple[str, dict[str, str | None], datetime]] = OrderedDict()

    def put(self, fingerprint: str, tokens: dict[str, str | None]) -> str:
        self._purge()
        while len(self.items) >= 100:
            self.items.popitem(last=False)
        key = secrets.token_urlsafe(18)
        self.items[key] = (fingerprint, tokens, datetime.now(UTC) + timedelta(minutes=15))
        return key

    def get(self, key: str, fingerprint: str) -> dict[str, str | None]:
        self._purge()
        value = self.items.get(key)
        if value is None or value[0] != fingerprint:
            raise ValueError("Invalid or expired cursor")
        return value[1]

    def _purge(self) -> None:
        now = datetime.now(UTC)
        for key in [key for key, value in self.items.items() if value[2] <= now]:
            del self.items[key]


class HistoricalService:
    def __init__(self, provider: AwsProvider, registry: ResourceRegistry) -> None:
        self.provider, self.registry, self.cursors = provider, registry, CursorStore()
        self.semaphore = asyncio.Semaphore(4)

    def _fingerprint(self, request: SearchRequest) -> str:
        return "|".join([request.profile, request.region, request.cluster, *sorted(request.source_ids), request.start_time.isoformat(), request.end_time.isoformat(), request.filter_pattern or ""])

    async def search(self, request: SearchRequest) -> SearchResponse:
        if request.start_time >= request.end_time or request.end_time - request.start_time > timedelta(hours=24):
            raise ValueError("Invalid search window")
        sources = self.registry.require_sources(request.source_ids)
        groups: dict[str, list[LogSource]] = {}
        for source in sources:
            groups.setdefault(source.query_key, []).append(source)
        if len(groups) > 10:
            raise ValueError("At most ten unique log groups are allowed")
        fingerprint = self._fingerprint(request)
        tokens = self.cursors.get(request.cursor, fingerprint) if request.cursor else {key: None for key in groups}

        async def one(key: str, descriptors: list[LogSource]) -> tuple[str, GroupPage | Exception]:
            source = descriptors[0]
            async with self.semaphore:
                try:
                    page = await self.provider.filter_log_events(GroupQuery(profile=request.profile, region=source.region, log_group=source.log_group, start_time=request.start_time, end_time=request.end_time, filter_pattern=request.filter_pattern, next_token=tokens.get(key)))
                    return key, page
                except Exception as exc:
                    return key, exc

        result = await asyncio.gather(*(one(key, values) for key, values in groups.items()))
        all_events: list[NormalizedLogEvent] = []
        errors: list[SourceError] = []
        new_tokens: dict[str, str | None] = {}
        for key, outcome in result:
            descriptors = groups[key]
            if isinstance(outcome, Exception):
                errors.append(SourceError(query_key=key, error=AppError(code="UNKNOWN_AWS_ERROR", message="Could not query this log group.", retryable=True, action="retry")))
                new_tokens[key] = tokens.get(key)
                continue
            new_tokens[key] = outcome.next_token
            for raw in outcome.events:
                matches = [source for source in descriptors if source.stream_prefix and source.container and raw.log_stream.startswith(f"{source.stream_prefix}/{source.container}/")]
                exact = matches[0] if len(matches) == 1 else None
                parsed = None
                try:
                    parsed_value = json.loads(raw.message)
                    parsed = parsed_value if isinstance(parsed_value, (dict, list)) else None
                except json.JSONDecodeError:
                    pass
                all_events.append(NormalizedLogEvent(event_id=raw.event_id, timestamp=raw.timestamp, ingestion_time=raw.ingestion_time, profile=request.profile, region=descriptors[0].region, cluster=request.cluster, service=exact.service if exact else None, service_candidates=sorted({item for source in descriptors for item in source.service_candidates}), container=exact.container if exact else None, container_candidates=sorted({item for source in descriptors for item in source.container_candidates}), log_group=descriptors[0].log_group, log_stream=raw.log_stream, message=raw.message, parsed_message=parsed, shared_source=len(descriptors) > 1 or any(source.shared for source in descriptors)))
        unique = {item.event_id: item for item in all_events}
        events = sorted(unique.values(), key=lambda item: (item.timestamp, item.ingestion_time or 0, item.event_id))[:5000]
        has_more = any(value is not None for value in new_tokens.values())
        cursor = self.cursors.put(fingerprint, new_tokens) if has_more else None
        return SearchResponse(events=events, cursor=cursor, has_more=has_more, truncated=len(unique) > 5000, partial_errors=errors)


class LiveService:
    def __init__(self, historical: HistoricalService) -> None:
        self.historical = historical
        self.tasks: set[asyncio.Task[None]] = set()

    async def run(self, request: SearchRequest, emit: Callable[[dict[str, object]], Awaitable[None]], stop: asyncio.Event) -> None:
        seen: OrderedDict[str, None] = OrderedDict()
        poll_interval_s = 3
        await emit({"type": "status", "state": "running", "pollIntervalMs": poll_interval_s * 1000})
        # Initial lookback window of 60 seconds so active recent logs stream in immediately
        lookback_seconds = 60
        while not stop.is_set():
            now = datetime.now(UTC)
            start_time = now - timedelta(seconds=lookback_seconds)
            end_time = now + timedelta(seconds=5)
            try:
                response = await self.historical.search(
                    request.model_copy(
                        update={
                            "cursor": None,
                            "start_time": start_time,
                            "end_time": end_time,
                        }
                    )
                )
                for event in response.events:
                    if event.event_id not in seen:
                        seen[event.event_id] = None
                        if len(seen) > 20_000:
                            seen.popitem(last=False)
                        await emit({"type": "event", "event": event.model_dump(mode="json")})
                if response.partial_errors:
                    await emit({"type": "warning", "code": "UNKNOWN_AWS_ERROR", "message": "One or more log groups could not be polled."})
            except Exception as exc:
                await emit({"type": "warning", "code": "POLL_ERROR", "message": f"Erro no polling ao vivo: {exc}"})

            # After initial catch-up, poll with 45s sliding window to catch any CloudWatch ingestion latency
            lookback_seconds = 45
            try:
                await asyncio.wait_for(stop.wait(), timeout=poll_interval_s)
            except TimeoutError:
                pass
        await emit({"type": "stopped", "reason": "user"})

    async def close(self) -> None:
        for task in tuple(self.tasks):
            task.cancel()
        await asyncio.gather(*tuple(self.tasks), return_exceptions=True)
