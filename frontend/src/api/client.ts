import type { Cluster, Health, LiveFrame, LogSource, LoginJob, Profile, SearchRequest, SearchResponse, Service, SessionCheck } from "@/api/types";

const integratedToken = typeof document === "undefined" ? undefined : document.querySelector<HTMLMetaElement>('meta[name="ale-session"]')?.content;
const sessionToken = import.meta.env.VITE_ALE_SESSION ?? integratedToken ?? "";
class ApiFailure extends Error { constructor(public readonly status: number, message: string) { super(message); } }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("X-ALE-Session", sessionToken);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new ApiFailure(response.status, body?.error?.message ?? "A operação local falhou.");
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<Health>("/api/health"),
  profiles: () => request<Profile[]>("/api/profiles"),
  check: (profile: string) => request<SessionCheck>(`/api/profiles/${encodeURIComponent(profile)}/check`, { method: "POST" }),
  login: (profile: string) => request<LoginJob>(`/api/profiles/${encodeURIComponent(profile)}/login`, { method: "POST" }),
  loginJob: (id: string) => request<LoginJob>(`/api/login-jobs/${encodeURIComponent(id)}`),
  clusters: (profile: string, region: string) => request<Cluster[]>(`/api/ecs/clusters?${new URLSearchParams({ profile, region })}`),
  services: (profile: string, region: string, cluster: string) => request<Service[]>(`/api/ecs/services?${new URLSearchParams({ profile, region, cluster })}`),
  sources: (profile: string, region: string, cluster: string, services: string[]) => request<LogSource[]>("/api/ecs/log-sources/resolve", { method: "POST", body: JSON.stringify({ profile, region, cluster, services }) }),
  search: (body: SearchRequest) => request<SearchResponse>("/api/logs/search", { method: "POST", body: JSON.stringify(body) }),
};

export function openLiveSocket(requestValue: SearchRequest, onFrame: (frame: LiveFrame) => void, onClose: () => void): WebSocket {
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${scheme}//${window.location.host}/api/logs/live`);
  socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "start", token: sessionToken, request: requestValue })));
  socket.addEventListener("message", (message) => onFrame(JSON.parse(String(message.data)) as LiveFrame));
  socket.addEventListener("close", onClose);
  return socket;
}
export { ApiFailure };
