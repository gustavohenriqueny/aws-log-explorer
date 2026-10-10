from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel

from .cli import AllowedAwsCliRunner, AwsVersion
from .domain import AppError, SearchRequest
from .provider import AwsCliProvider, FakeAwsProvider
from .security import AwsConfigReader, ConfigError, FakeAwsConfigReader, LocalSessionGuard
from .services import HistoricalService, LiveService, LoginJobManager, ResourceRegistry


class ResolveRequest(BaseModel):
    profile: str
    region: str
    cluster: str
    services: list[str]


class ServiceQuery(BaseModel):
    profile: str
    region: str
    cluster: str


def error_response(error: AppError, status: int = 400) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": error.model_dump(mode="json")})


def create_app(*, provider: Any | None = None, config_reader: AwsConfigReader | None = None, session_token: str | None = None, static_dir: Path | None = None) -> FastAPI:
    runner = AllowedAwsCliRunner()
    aws = provider or (FakeAwsProvider() if os.environ.get("ALE_PROVIDER") == "fake" else AwsCliProvider(runner))
    guard, registry = LocalSessionGuard(session_token or os.environ.get("ALE_SESSION_TOKEN")), ResourceRegistry()
    historical = HistoricalService(aws, registry)
    jobs, live = LoginJobManager(aws), LiveService(historical)

    @asynccontextmanager
    async def lifecycle(app: FastAPI):
        app.state.runner, app.state.jobs, app.state.live = runner, jobs, live
        yield
        await live.close()
        await jobs.close()
        await runner.close()

    app = FastAPI(title="AWS Log Explorer", lifespan=lifecycle)
    default_reader = FakeAwsConfigReader() if isinstance(aws, FakeAwsProvider) else AwsConfigReader()
    app.state.guard, app.state.registry, app.state.config_reader = guard, registry, config_reader or default_reader
    app.state.historical, app.state.provider = historical, aws

    @app.exception_handler(ValueError)
    async def validation_error(_: Request, exc: ValueError) -> JSONResponse:
        code: Literal["PROFILE_NOT_SSO", "VALIDATION_ERROR"]
        code = "PROFILE_NOT_SSO" if str(exc) == "PROFILE_NOT_SSO" else "VALIDATION_ERROR"
        return error_response(AppError(code=code, message="Request cannot be completed with the discovered local resources.", action="none"), 400)

    @app.middleware("http")
    async def local_session(request: Request, call_next: Any) -> Any:
        if request.url.path == "/api/health":
            return await call_next(request)
        if request.url.path.startswith("/api/"):
            if not guard.validate(request.headers.get("X-ALE-Session"), request.headers.get("host"), request.headers.get("origin")):
                return error_response(AppError(code="VALIDATION_ERROR", message="Invalid local session.", action="none"), 403)
        return await call_next(request)

    @app.get("/api/health")
    async def health() -> dict[str, object]:
        if isinstance(aws, FakeAwsProvider):
            return {"status": "ok", "awsCli": {"status": "fake", "majorVersion": 2}}
        try:
            value = await runner.run(AwsVersion(), timeout=5)
            major = 2 if "aws-cli/2" in value else None
            return {"status": "ok", "awsCli": {"status": "available" if major else "unsupported", "majorVersion": major}}
        except RuntimeError:
            return {"status": "ok", "awsCli": {"status": "missing", "majorVersion": None}}

    def secured_profile(name: str):
        return registry.profile(name)

    @app.get("/api/profiles", response_model=None)
    async def profiles() -> list[dict[str, object]] | JSONResponse:
        try:
            profiles_value = app.state.config_reader.read()
        except ConfigError as exc:
            return error_response(exc.error, 400)
        registry.set_profiles(profiles_value)
        return [item.model_dump(mode="json") for item in profiles_value]

    @app.post("/api/profiles/{profile}/check")
    async def check_profile(profile: str) -> dict[str, object]:
        return (await aws.check_session(secured_profile(profile))).model_dump(mode="json")

    @app.post("/api/profiles/{profile}/login")
    async def login(profile: str) -> dict[str, object]:
        return (await jobs.start(secured_profile(profile))).model_dump(mode="json")

    @app.get("/api/login-jobs/{job_id}")
    async def login_job(job_id: str) -> dict[str, object]:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return job.model_dump(mode="json")

    @app.delete("/api/login-jobs/{job_id}")
    async def cancel_login_job(job_id: str) -> dict[str, object]:
        job = await jobs.cancel(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return job.model_dump(mode="json")

    @app.get("/api/ecs/clusters")
    async def clusters(profile: str, region: str) -> list[dict[str, object]]:
        secured_profile(profile)
        items = await aws.list_clusters(profile, region)
        registry.register_clusters(profile, region, items)
        return [item.model_dump() for item in items]

    @app.get("/api/ecs/services")
    async def services(profile: str, region: str, cluster: str) -> list[dict[str, object]]:
        registry.require_cluster(profile, region, cluster)
        items = await aws.list_services(profile, region, cluster)
        registry.register_services(profile, region, cluster, items)
        return [item.model_dump() for item in items]

    @app.post("/api/ecs/log-sources/resolve")
    async def resolve(body: ResolveRequest) -> list[dict[str, object]]:
        registry.require_services(body.profile, body.region, body.cluster, body.services)
        items = await aws.resolve_log_sources(body.profile, body.region, body.cluster, body.services)
        registry.register_sources(items)
        return [item.model_dump() for item in items]

    @app.post("/api/logs/search")
    async def search(body: SearchRequest) -> dict[str, object]:
        secured_profile(body.profile)
        registry.require_cluster(body.profile, body.region, body.cluster)
        return (await historical.search(body)).model_dump(mode="json")

    @app.websocket("/api/logs/live")
    async def websocket_live(websocket: WebSocket) -> None:
        if not guard.valid_host(websocket.headers.get("host")) or not guard.valid_origin(websocket.headers.get("origin")):
            await websocket.close(code=1008)
            return
        await websocket.accept()
        stop = asyncio.Event()
        try:
            bootstrap = await websocket.receive_json()
            if bootstrap.get("token") != guard.token or bootstrap.get("type") != "start":
                await websocket.close(code=1008)
                return
            request_value = SearchRequest.model_validate(bootstrap.get("request", {}))
            secured_profile(request_value.profile)
            registry.require_cluster(request_value.profile, request_value.region, request_value.cluster)
            registry.require_sources(request_value.source_ids)

            async def emit(frame: dict[str, object]) -> None:
                try:
                    await websocket.send_json(frame)
                except Exception:
                    stop.set()

            task = asyncio.create_task(live.run(request_value, emit, stop))
            live.tasks.add(task)
            try:
                while not stop.is_set():
                    message = await websocket.receive_json()
                    if message.get("type") == "stop":
                        stop.set()
            except WebSocketDisconnect:
                stop.set()
            finally:
                await asyncio.gather(task, return_exceptions=True)
                live.tasks.discard(task)
        except (Exception, WebSocketDisconnect):
            stop.set()
            try:
                await websocket.close(code=1008)
            except Exception:
                pass

    directory = static_dir or (Path(__file__).parents[3] / "frontend" / "dist")
    if directory.is_dir() and (directory / "index.html").exists():
        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str):
            target = directory / path
            if path and target.is_file():
                return FileResponse(target)
            html = (directory / "index.html").read_text(encoding="utf-8")
            bootstrap = f'<meta name="ale-session" content="{guard.token}">'
            return HTMLResponse(html.replace("</head>", f"{bootstrap}</head>", 1))

    return app


app = create_app()
