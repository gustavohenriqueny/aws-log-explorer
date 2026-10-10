"""Closed AWS CLI command surface. No API accepts free-form argv."""
from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass
from pathlib import Path

from .domain import AppError

_SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
_SAFE_REGION = re.compile(r"^[a-z]{2}(?:-gov)?-[a-z]+-\d+$")
_FORBIDDEN = {"--unmask", "--endpoint-url", "--debug", "--no-verify-ssl"}


class CommandNotAllowed(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class AwsVersion:
    pass


@dataclass(frozen=True, slots=True)
class StsIdentity:
    profile: str
    region: str


@dataclass(frozen=True, slots=True)
class SsoLogin:
    profile: str


@dataclass(frozen=True, slots=True)
class ListClusters:
    profile: str
    region: str
    next_token: str | None = None


@dataclass(frozen=True, slots=True)
class ListServices:
    profile: str
    region: str
    cluster: str
    next_token: str | None = None


@dataclass(frozen=True, slots=True)
class DescribeServices:
    profile: str
    region: str
    cluster: str
    services: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class DescribeTaskDefinition:
    profile: str
    region: str
    task_definition: str


@dataclass(frozen=True, slots=True)
class FilterLogEvents:
    profile: str
    region: str
    log_group: str
    start_time_ms: int
    end_time_ms: int
    filter_pattern: str | None = None
    next_token: str | None = None
    limit: int = 500


AwsOperation = AwsVersion | StsIdentity | SsoLogin | ListClusters | ListServices | DescribeServices | DescribeTaskDefinition | FilterLogEvents


class CommandPolicy:
    """Compiles only typed, read-only AWS CLI operations to immutable argv."""

    @staticmethod
    def _name(value: str) -> str:
        if not _SAFE_NAME.fullmatch(value) or value in _FORBIDDEN:
            raise CommandNotAllowed("Unsafe AWS identifier")
        return value

    @staticmethod
    def _value(value: str) -> str:
        """Permit AWS resource syntax while preventing argv options/control bytes."""
        if not value or value.startswith("-") or "\x00" in value or len(value) > 2048:
            raise CommandNotAllowed("Unsafe AWS value")
        return value

    @staticmethod
    def _region(value: str) -> str:
        if not _SAFE_REGION.fullmatch(value):
            raise CommandNotAllowed("Unsafe AWS region")
        return value

    def compile(self, operation: AwsOperation) -> tuple[str, ...]:
        if isinstance(operation, AwsVersion):
            return ("aws", "--version")
        if isinstance(operation, SsoLogin):
            return ("aws", "sso", "login", "--profile", self._name(operation.profile), "--no-cli-pager")
        if isinstance(operation, StsIdentity):
            return self._query("sts", "get-caller-identity", operation.profile, operation.region)
        if isinstance(operation, ListClusters):
            return self._paging(self._query("ecs", "list-clusters", operation.profile, operation.region), operation.next_token)
        if isinstance(operation, ListServices):
            base = self._query("ecs", "list-services", operation.profile, operation.region) + ("--cluster", self._value(operation.cluster))
            return self._paging(base, operation.next_token)
        if isinstance(operation, DescribeServices):
            if not operation.services or len(operation.services) > 10:
                raise CommandNotAllowed("describe-services accepts one to ten discovered services")
            return self._query("ecs", "describe-services", operation.profile, operation.region) + ("--cluster", self._value(operation.cluster), "--services", *(self._value(item) for item in operation.services))
        if isinstance(operation, DescribeTaskDefinition):
            return self._query("ecs", "describe-task-definition", operation.profile, operation.region) + ("--task-definition", self._value(operation.task_definition))
        if isinstance(operation, FilterLogEvents):
            if not 1 <= operation.limit <= 500 or operation.start_time_ms >= operation.end_time_ms:
                raise CommandNotAllowed("Invalid bounded log query")
            args = self._query("logs", "filter-log-events", operation.profile, operation.region) + (
                "--log-group-name", self._value(operation.log_group), "--start-time", str(operation.start_time_ms),
                "--end-time", str(operation.end_time_ms), "--max-items", str(operation.limit),
            )
            if operation.filter_pattern is not None:
                if len(operation.filter_pattern) > 1024 or "\x00" in operation.filter_pattern:
                    raise CommandNotAllowed("Invalid filter pattern")
                args += ("--filter-pattern", operation.filter_pattern)
            return self._paging(args, operation.next_token)
        raise CommandNotAllowed("Operation is not allowlisted")

    def _query(self, service: str, action: str, profile: str, region: str) -> tuple[str, ...]:
        return ("aws", service, action, "--no-cli-pager", "--no-cli-auto-prompt", "--output", "json", "--profile", self._name(profile), "--region", self._region(region))

    def _paging(self, args: tuple[str, ...], token: str | None) -> tuple[str, ...]:
        if token is None:
            return args
        if not token or token.startswith("-") or "\x00" in token or len(token) > 2048:
            raise CommandNotAllowed("Unsafe pagination token")
        return args + ("--starting-token", token)


def sanitize_aws_text(value: str) -> str:
    """Return a short safe diagnostic; never expose CLI output verbatim."""
    home = str(Path.home())
    value = value.replace(home, "~")
    value = re.sub(r"\b\d{12}\b", "[account-id]", value)
    value = re.sub(r"arn:[^\s'\"]+", "[arn]", value, flags=re.I)
    value = re.sub(r"https?://[^\s'\"]*awsapps\.com[^\s'\"]*", "[sso-url]", value, flags=re.I)
    value = re.sub(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b", "[credential]", value)
    value = re.sub(r"\b[A-Za-z0-9+/=_-]{32,}\b", "[token]", value)
    return value[:500]


def classify_cli_error(text: str, *, timeout: bool = False, cancelled: bool = False) -> AppError:
    lowered = text.lower()
    if cancelled:
        return AppError(code="CANCELLED", message="Operation was cancelled.", action="none")
    if timeout:
        return AppError(code="TIMEOUT", message="AWS CLI operation timed out.", retryable=True, action="retry")
    if "sso" in lowered and ("expired" in lowered or "login" in lowered or "token" in lowered):
        return AppError(code="AUTH_EXPIRED", message="AWS session expired. Sign in again.", action="login")
    if "accessdenied" in lowered or "unauthorized" in lowered:
        return AppError(code="ACCESS_DENIED", message="AWS denied access to this resource.", action="reload")
    if "notfound" in lowered or "not found" in lowered:
        return AppError(code="NOT_FOUND", message="AWS resource was not found.", action="reload")
    if "throttl" in lowered or "rate exceeded" in lowered:
        return AppError(code="THROTTLED", message="AWS throttled this request.", retryable=True, action="retry")
    if "invalid" in lowered or "validation" in lowered:
        return AppError(code="VALIDATION_ERROR", message="AWS rejected the request parameters.", action="none")
    return AppError(code="UNKNOWN_AWS_ERROR", message="AWS CLI command failed.", retryable=True, action="retry")


class AllowedAwsCliRunner:
    """Async runner with no shell, bounded buffers, timeout/cancellation, and child cleanup."""
    def __init__(self, policy: CommandPolicy | None = None) -> None:
        self.policy = policy or CommandPolicy()
        self._processes: set[asyncio.subprocess.Process] = set()

    @property
    def active_processes(self) -> int:
        return len(self._processes)

    async def run(self, operation: AwsOperation, timeout: float) -> str:
        argv = self.policy.compile(operation)
        env = {key: value for key, value in os.environ.items() if key in {"PATH", "HOME", "LANG", "LC_ALL", "SSL_CERT_FILE"}}
        env.update({"AWS_PAGER": "", "AWS_CLI_AUTO_PROMPT": "off"})
        try:
            process = await asyncio.create_subprocess_exec(*argv, stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=env)
        except FileNotFoundError as exc:
            raise RuntimeError(AppError(code="CLI_MISSING", message="AWS CLI v2 is not installed.", action="none").model_dump_json()) from exc
        self._processes.add(process)
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout)
        except TimeoutError as exc:
            await self._stop(process)
            raise RuntimeError(classify_cli_error("", timeout=True).model_dump_json()) from exc
        except asyncio.CancelledError:
            await self._stop(process)
            raise
        finally:
            self._processes.discard(process)
        if process.returncode != 0:
            raise RuntimeError(classify_cli_error(sanitize_aws_text(stderr.decode(errors="replace"))).model_dump_json())
        return stdout.decode(errors="replace")[:2_000_000]

    async def _stop(self, process: asyncio.subprocess.Process) -> None:
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), 2)
            except TimeoutError:
                process.kill()
                await process.wait()

    async def close(self) -> None:
        await asyncio.gather(*(self._stop(item) for item in tuple(self._processes)), return_exceptions=True)
