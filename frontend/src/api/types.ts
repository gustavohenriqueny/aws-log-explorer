export type ErrorCode = "CLI_MISSING" | "CLI_UNSUPPORTED" | "AWS_CONFIG_INVALID" | "AUTH_EXPIRED" | "PROFILE_NOT_SSO" | "ACCESS_DENIED" | "NOT_FOUND" | "THROTTLED" | "TIMEOUT" | "CANCELLED" | "VALIDATION_ERROR" | "COMMAND_NOT_ALLOWED" | "UNKNOWN_AWS_ERROR";
export interface AppError { code: ErrorCode; message: string; retryable: boolean; action: "login" | "retry" | "reload" | "none"; }
export interface Health { status: "ok"; awsCli: { status: "fake" | "available" | "unsupported" | "missing"; majorVersion: number | null }; }
export interface Profile { name: string; region: string; region_source: "profile" | "default"; is_sso: boolean; is_production: boolean; }
export interface SessionCheck { profile: string; status: "connected" | "expired" | "denied" | "error"; checked_at: string; error: AppError | null; }
export interface LoginJob { id: string; profile: string; status: "pending" | "running" | "succeeded" | "failed" | "cancelled" | "timeout"; error: AppError | null; }
export interface Cluster { name: string; arn_key: string; }
export interface Service { name: string; cluster: string; }
export interface LogSource { id: string; query_key: string; service_candidates: string[]; service: string | null; container_candidates: string[]; container: string | null; log_group: string; region: string; stream_prefix: string | null; shared: boolean; }
export interface LogEvent { event_id: string; timestamp: number; ingestion_time: number | null; profile: string; region: string; cluster: string; service: string | null; service_candidates: string[]; container: string | null; container_candidates: string[]; log_group: string; log_stream: string; message: string; parsed_message: Record<string, unknown> | unknown[] | null; shared_source: boolean; }
export interface SearchRequest { profile: string; region: string; cluster: string; source_ids: string[]; start_time: string; end_time: string; filter_pattern?: string; cursor?: string; }
export interface SearchResponse { events: LogEvent[]; cursor: string | null; has_more: boolean; truncated: boolean; partial_errors: Array<{ query_key: string; error: AppError }>; ordering: "approximate"; }
export interface LiveFrame { type: "event" | "status" | "warning" | "dropped" | "error" | "stopped"; event?: LogEvent; state?: string; pollIntervalMs?: number; message?: string; count?: number; error?: AppError; }
