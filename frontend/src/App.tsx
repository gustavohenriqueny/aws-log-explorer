import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Clock3,
  Cloud,
  CloudCog,
  Copy,
  Database,
  Layers,
  LayoutGrid,
  ListFilter,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Square,
  Sun,
  Table as TableIcon,
  Terminal,
  Trash2,
  Wifi,
  WrapText,
  X,
} from "lucide-react";
import { api, openLiveSocket } from "@/api/client";
import type { Cluster, Health, LogEvent, LogSource, Profile, SearchRequest, Service } from "@/api/types";
import { AnsiLog } from "@/components/AnsiLog";
import { parseAnsiString } from "@/lib/ansi";
import { TERMINAL_THEMES, type TerminalThemeId } from "@/lib/terminal-themes";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const presets = [
  { label: "5 min", minutes: 5 },
  { label: "10 min", minutes: 10 },
  { label: "15 min", minutes: 15 },
  { label: "20 min", minutes: 20 },
  { label: "25 min", minutes: 25 },
  { label: "30 min", minutes: 30 },
  { label: "1 hora", minutes: 60 },
  { label: "6 horas", minutes: 360 },
  { label: "24 horas", minutes: 1440 },
] as const;

const filterPatternSuggestions = [
  '{ $.level = "error" }',
  '?ERROR ?Exception',
  '{ $.status >= 500 }',
  'timeout',
];

const nowIso = () => new Date().toISOString();
const startFor = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const formatTime = (time: number) => new Date(time).toLocaleString("pt-BR", { hour12: false });

function isIgnoredContainer(name?: string | null) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return (
    lower.includes("aws-collector") ||
    lower.includes("aws-colletor") ||
    lower.includes("aws-otel") ||
    lower.includes("otel-collector") ||
    lower.includes("adot-collector")
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação local.";
}
function toLocalInput(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
function fromLocalInput(value: string) {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

function detectLogLevel(message: string, parsed?: Record<string, unknown> | unknown[] | null): "error" | "warn" | "info" | "debug" | "none" {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    const lvl = String(record.level ?? record.severity ?? record.status ?? "").toLowerCase();
    if (lvl.includes("err") || lvl.includes("crit") || lvl.includes("fatal") || lvl.includes("fail") || lvl === "500") return "error";
    if (lvl.includes("warn")) return "warn";
    if (lvl.includes("info")) return "info";
    if (lvl.includes("debug") || lvl.includes("trace")) return "debug";
  }
  const lower = message.toLowerCase();
  if (lower.includes('"level":"error"') || lower.includes("error") || lower.includes("exception") || lower.includes("fatal") || lower.includes("failure") || lower.includes("timeout") || lower.includes("[31m")) return "error";
  if (lower.includes('"level":"warn"') || lower.includes("warn") || lower.includes("warning") || lower.includes("[33m")) return "warn";
  if (lower.includes('"level":"info"') || lower.includes("info") || lower.includes("[32m")) return "info";
  if (lower.includes('"level":"debug"') || lower.includes("debug") || lower.includes("trace") || lower.includes("[34m")) return "debug";
  return "none";
}

interface ServiceColor {
  readonly text: string;
  readonly bg: string;
  readonly border: string;
}

const DEFAULT_SERVICE_COLOR: ServiceColor = {
  text: "text-cyan-600 dark:text-cyan-400",
  bg: "bg-cyan-500/10",
  border: "border-cyan-500/30",
};

const SERVICE_COLORS: readonly ServiceColor[] = [
  { text: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30" },
  { text: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/30" },
  { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  { text: "text-pink-600 dark:text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/30" },
  { text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  { text: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/30" },
  { text: "text-teal-600 dark:text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/30" },
  { text: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  { text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30" },
];

function getServiceColor(name?: string | null): ServiceColor {
  if (!name) return SERVICE_COLORS[0] ?? DEFAULT_SERVICE_COLOR;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  const idx = Math.abs(hash) % SERVICE_COLORS.length;
  return SERVICE_COLORS[idx] ?? DEFAULT_SERVICE_COLOR;
}

function formatServiceTag(service?: string | null, container?: string | null, candidates?: string[]) {
  const svc = service ?? (candidates?.length ? candidates.join("/") : "serviço");
  if (!container || container === svc) {
    return `[${svc}]`;
  }
  return `[${svc}/${container}]`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"history" | "live">("history");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSourceTab, setActiveSourceTab] = useState<string>("all");

  const [health, setHealth] = useState<Health | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<"idle" | "checking" | "connected" | "expired" | "error">("idle");
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [cluster, setCluster] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  const [serviceFilter, setServiceFilter] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [sources, setSources] = useState<LogSource[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [period, setPeriod] = useState(60);
  const [startTime, setStartTime] = useState(startFor(60));
  const [endTime, setEndTime] = useState(nowIso());
  const [filterPattern, setFilterPattern] = useState("");
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | "error" | "warn" | "info">("all");
  const [view, setView] = useState<"raw" | "json">("raw");
  const [displayMode, setDisplayMode] = useState<"terminal" | "table" | "cards">("terminal");
  const [terminalTheme, setTerminalTheme] = useState<TerminalThemeId>(() => {
    try {
      return (localStorage.getItem("aws_log_explorer_terminal_theme") as TerminalThemeId) || "slate";
    } catch {
      return "slate";
    }
  });
  const [maxLines, setMaxLines] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem("aws_log_explorer_max_lines"));
      return stored > 0 ? stored : 500;
    } catch {
      return 500;
    }
  });
  const [wrapText, setWrapText] = useState(false);
  const [toast, setToast] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<"search" | null>(null);
  const [confirmedProd, setConfirmedProd] = useState(false);
  const [live, setLive] = useState<"stopped" | "running" | "paused">("stopped");
  const [pollMs, setPollMs] = useState(5000);
  const [pendingLive, setPendingLive] = useState(0);
  const [dropped, setDropped] = useState(0);
  const socket = useRef<WebSocket | null>(null);
  const liveRef = useRef(live);
  const maxLinesRef = useRef(maxLines);
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    maxLinesRef.current = maxLines;
  }, [maxLines]);

  const currentTheme = TERMINAL_THEMES[terminalTheme] ?? TERMINAL_THEMES.slate;

  function setAndStoreTerminalTheme(nextTheme: TerminalThemeId) {
    setTerminalTheme(nextTheme);
    try {
      localStorage.setItem("aws_log_explorer_terminal_theme", nextTheme);
    } catch {
      // ignore
    }
  }

  function setAndStoreMaxLines(nextLimit: number) {
    setMaxLines(nextLimit);
    try {
      localStorage.setItem("aws_log_explorer_max_lines", String(nextLimit));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void Promise.all([api.health(), api.profiles()])
      .then(([nextHealth, nextProfiles]) => {
        setHealth(nextHealth);
        setProfiles(nextProfiles);
      })
      .catch((error: unknown) => setNotice(errorMessage(error)));
  }, []);

  useEffect(() => () => socket.current?.close(), []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const visibleServices = useMemo(
    () => services.filter((item) => item.name.toLowerCase().includes(serviceFilter.toLowerCase())),
    [services, serviceFilter]
  );

  const uniqueQueryKeys = useMemo(
    () => new Set(sources.filter((source) => selectedSources.includes(source.id)).map((source) => source.query_key)).size,
    [sources, selectedSources]
  );

  const activeSources = useMemo(
    () => sources.filter((source) => selectedSources.includes(source.id)),
    [sources, selectedSources]
  );

  const effectiveSourceTab = useMemo(() => {
    if (activeSourceTab === "all") return "all";
    return selectedSources.includes(activeSourceTab) ? activeSourceTab : "all";
  }, [activeSourceTab, selectedSources]);

  function eventMatchesSource(event: LogEvent, source: LogSource): boolean {
    if (event.log_group !== source.log_group) return false;
    if (source.service) {
      if (event.service && event.service !== source.service) return false;
      if (!event.service && !event.service_candidates?.includes(source.service)) return false;
    }
    if (source.container) {
      if (event.container && event.container !== source.container) return false;
      if (!event.container && !event.container_candidates?.includes(source.container)) return false;
    }
    return true;
  }

  const sourceEventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const src of activeSources) {
      counts[src.id] = 0;
    }
    for (const event of events) {
      for (const src of activeSources) {
        if (eventMatchesSource(event, src)) {
          counts[src.id] = (counts[src.id] || 0) + 1;
        }
      }
    }
    return counts;
  }, [activeSources, events]);

  const filteredEvents = useMemo(() => {
    const list = events.filter((event) => {
      if (effectiveSourceTab !== "all") {
        const targetSource = sources.find((s) => s.id === effectiveSourceTab);
        if (targetSource && !eventMatchesSource(event, targetSource)) {
          return false;
        }
      }

      const matchesText = `${event.message} ${event.service ?? ""} ${event.container ?? ""} ${event.log_group}`
        .toLowerCase()
        .includes(timelineFilter.toLowerCase());
      if (!matchesText) return false;

      if (levelFilter === "all") return true;
      const lvl = detectLogLevel(event.message, event.parsed_message);
      if (levelFilter === "error") return lvl === "error";
      if (levelFilter === "warn") return lvl === "warn";
      if (levelFilter === "info") return lvl === "info";
      return true;
    });

    // Inverso: Mais recentes em cima, mais antigos embaixo (ordem decrescente)
    return [...list].sort(
      (a, b) => b.timestamp - a.timestamp || (b.ingestion_time ?? 0) - (a.ingestion_time ?? 0)
    );
  }, [events, effectiveSourceTab, sources, timelineFilter, levelFilter]);

  const levelCounts = useMemo(() => {
    let error = 0;
    let warn = 0;
    let info = 0;
    for (const evt of events) {
      const lvl = detectLogLevel(evt.message, evt.parsed_message);
      if (lvl === "error") error++;
      else if (lvl === "warn") warn++;
      else if (lvl === "info") info++;
    }
    return { error, warn, info, total: events.length };
  }, [events]);

  const displayedEvents = useMemo(() => {
    return maxLines > 0 ? filteredEvents.slice(0, maxLines) : filteredEvents;
  }, [filteredEvents, maxLines]);

  useEffect(() => {
    if (live === "running" && autoScroll && logScrollRef.current) {
      logScrollRef.current.scrollTop = 0;
    }
  }, [events, live, autoScroll]);

  const handleLogScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (live === "running") {
      const target = e.currentTarget;
      const isNearTop = target.scrollTop < 50;
      setAutoScroll(isNearTop);
    }
  };

  const requestBody = (nextCursor?: string): SearchRequest | null =>
    selectedProfile && cluster && selectedSources.length
      ? {
          profile: selectedProfile.name,
          region: selectedProfile.region,
          cluster,
          source_ids: selectedSources,
          start_time: startTime,
          end_time: endTime,
          ...(filterPattern ? { filter_pattern: filterPattern } : {}),
          ...(nextCursor ? { cursor: nextCursor } : {}),
        }
      : null;

  async function selectProfile(profile: Profile) {
    setSelectedProfile(profile);
    setSession("checking");
    setClusters([]);
    setCluster("");
    setServices([]);
    setSelectedServices([]);
    setSources([]);
    setSelectedSources([]);
    setEvents([]);
    setConfirmedProd(false);
    try {
      const state = await api.check(profile.name);
      if (state.status !== "connected") {
        setSession("expired");
        return;
      }
      setSession("connected");
      setClusters(await api.clusters(profile.name, profile.region));
    } catch (error) {
      setSession("error");
      setNotice(errorMessage(error));
    }
  }

  async function login() {
    if (!selectedProfile) return;
    setBusy(true);
    try {
      await api.login(selectedProfile.name);
      setSession("connected");
      setToast("Login SSO concluído para dados simulados.");
      setClusters(await api.clusters(selectedProfile.name, selectedProfile.region));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function chooseCluster(nextCluster: string) {
    if (!selectedProfile) return;
    setCluster(nextCluster);
    setServices([]);
    setSelectedServices([]);
    setSources([]);
    setSelectedSources([]);
    setServiceFilter("");
    try {
      setServices(await api.services(selectedProfile.name, selectedProfile.region, nextCluster));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  function toggle(values: string[], id: string, setter: (value: string[]) => void) {
    setter(values.includes(id) ? values.filter((value) => value !== id) : [...values, id]);
  }

  async function resolveSources(servicesToResolve?: string[]) {
    const targetServices = servicesToResolve ?? selectedServices;
    if (!selectedProfile || !cluster || !targetServices.length) {
      setSources([]);
      setSelectedSources([]);
      return;
    }
    setBusy(true);
    try {
      const nextSources = await api.sources(selectedProfile.name, selectedProfile.region, cluster, targetServices);
      const filteredSources = nextSources.filter(
        (item) =>
          !isIgnoredContainer(item.container) &&
          !item.container_candidates.some((c) => isIgnoredContainer(c))
      );
      setSources(filteredSources);
      setSelectedSources(filteredSources.map((item) => item.id));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleService(serviceName: string) {
    const nextSelected = selectedServices.includes(serviceName)
      ? selectedServices.filter((s) => s !== serviceName)
      : [...selectedServices, serviceName];
    setSelectedServices(nextSelected);
    if (nextSelected.length > 0) {
      void resolveSources(nextSelected);
    } else {
      setSources([]);
      setSelectedSources([]);
    }
  }

  const isAllVisibleSelected = useMemo(
    () => visibleServices.length > 0 && visibleServices.every((s) => selectedServices.includes(s.name)),
    [visibleServices, selectedServices]
  );

  async function toggleAllServices() {
    const visibleNames = visibleServices.map((s) => s.name);
    if (isAllVisibleSelected) {
      const nextSelected = selectedServices.filter((name) => !visibleNames.includes(name));
      setSelectedServices(nextSelected);
      if (nextSelected.length > 0) {
        void resolveSources(nextSelected);
      } else {
        setSources([]);
        setSelectedSources([]);
      }
    } else {
      const nextSelected = Array.from(new Set([...selectedServices, ...visibleNames]));
      setSelectedServices(nextSelected);
      void resolveSources(nextSelected);
    }
  }

  function choosePreset(minutes: number) {
    setPeriod(minutes);
    setStartTime(startFor(minutes));
    setEndTime(nowIso());
  }

  async function runSearch(nextCursor?: string) {
    const body = requestBody(nextCursor);
    if (!body) {
      setNotice("Selecione ao menos uma fonte de log antes de buscar.");
      return;
    }
    if (new Date(body.start_time) >= new Date(body.end_time)) {
      setNotice("O início do intervalo precisa ser anterior ao fim.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await api.search(body);
      setEvents((current) => (nextCursor ? [...current, ...response.events] : response.events));
      setCursor(response.cursor);
      setPartialErrors(response.partial_errors.length);
      setTruncated(response.truncated);
      setToast(`${response.events.length} eventos carregados somente em memória.`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function prepareSearch() {
    if (!requestBody()) {
      setNotice("Selecione ao menos uma fonte de log antes de buscar.");
      return;
    }
    if (period === 1440 || uniqueQueryKeys >= 10 || (selectedProfile?.is_production && !confirmedProd)) {
      setConfirmation("search");
      return;
    }
    void runSearch();
  }

  async function copyMessage(message: string, id?: string) {
    if (id) {
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 2000);
    }
    try {
      await navigator.clipboard?.writeText(message);
      setToast("Mensagem copiada. Nenhum dado foi persistido.");
    } catch {
      setToast("Não foi possível copiar a mensagem neste navegador.");
    }
  }

  async function copyAllVisibleLogs() {
    if (!filteredEvents.length) return;
    const allText = filteredEvents
      .map(
        (e) =>
          `[${formatTime(e.timestamp)}] [${e.service ?? "unknown"}/${e.container ?? "app"}] ${
            view === "json" && e.parsed_message ? JSON.stringify(e.parsed_message) : e.message
          }`
      )
      .join("\n");
    try {
      await navigator.clipboard?.writeText(allText);
      setToast(`${filteredEvents.length} logs copiados para a área de transferência.`);
    } catch {
      setToast("Não foi possível copiar os logs neste navegador.");
    }
  }

  function startLive() {
    const body = requestBody();
    if (!body) {
      setNotice("Selecione fontes antes de iniciar o acompanhamento ao vivo.");
      return;
    }
    setActiveTab("live");
    setLive("running");
    setPendingLive(0);
    setDropped(0);
    socket.current = openLiveSocket(
      body,
      (frame) => {
        if (frame.type === "event") {
          const incoming = frame.event;
          if (incoming) {
            setEvents((current) => {
              if (current.some((e) => e.event_id === incoming.event_id)) {
                return current;
              }
              const next = [incoming, ...current];
              return next.length > 20000 ? next.slice(0, 20000) : next;
            });
            if (liveRef.current === "paused") setPendingLive((value) => value + 1);
          }
        }
        if (frame.type === "status" && frame.pollIntervalMs) setPollMs(frame.pollIntervalMs);
        if (frame.type === "warning") setNotice(frame.message ?? "O polling recebeu um aviso recuperável.");
        if (frame.type === "dropped") setDropped((value) => value + (frame.count ?? 0));
        if (frame.type === "error") {
          setNotice(frame.error?.message ?? "A sessão ao vivo terminou.");
          setLive("stopped");
        }
        if (frame.type === "stopped") setLive("stopped");
      },
      () => setLive("stopped")
    );
  }

  function stopLive() {
    socket.current?.send(JSON.stringify({ type: "stop" }));
    socket.current?.close();
    socket.current = null;
    setLive("stopped");
    setPendingLive(0);
  }

  function toggleTheme() {
    document.documentElement.classList.toggle("dark");
  }

  return (
    <main className="h-screen w-screen overflow-hidden flex flex-col p-3 lg:p-4 bg-background text-foreground gap-2.5">
      {/* Top Header & Navigation Bar */}
      <header className="h-14 shrink-0 flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-card/70 px-4 lg:px-5 shadow-xs backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-primary/25 via-primary/10 to-transparent border border-primary/30 shadow-xs">
            <CloudCog className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-foreground">AWS Log Explorer</h1>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary border border-primary/20">
                PoC
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              Investigação local, somente leitura, para ECS e CloudWatch Logs.
            </p>
          </div>
        </div>

        {/* Center View Navigation Tabs */}
        <nav className="flex items-center rounded-lg bg-muted/60 p-0.5 border border-border/60 shadow-inner" aria-label="Modo de visualização">
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              activeTab === "history"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Database className="h-3.5 w-3.5 text-primary" />
            Consulta Histórica
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("live")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              activeTab === "live"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Radio className="h-3.5 w-3.5 text-emerald-500" />
            Ao Vivo (Live Tail)
            {live === "running" && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            )}
          </button>
        </nav>

        {/* Right Actions, Profile Selector & Diagnostics */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Profile Select */}
          <Select
            value={selectedProfile?.name ?? ""}
            onValueChange={(val) => {
              const found = profiles.find((p) => p.name === val);
              if (found) void selectProfile(found);
            }}
          >
            <SelectTrigger
              aria-label="Selecionar profile"
              className="h-8 w-auto gap-2 border-border/80 bg-background/80 px-2.5 text-xs font-semibold shadow-2xs hover:bg-accent/60 shrink-0"
            >
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <Shield className={`h-3.5 w-3.5 shrink-0 ${selectedProfile?.is_production ? "text-rose-500" : "text-primary"}`} />
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider shrink-0">
                  Profile:
                </span>
                <span className="font-semibold text-foreground">
                  {selectedProfile ? selectedProfile.name : "Selecionar profile..."}
                </span>
                {selectedProfile?.region && (
                  <span className="text-[10px] text-muted-foreground font-mono font-normal">
                    ({selectedProfile.region})
                  </span>
                )}
              </div>
            </SelectTrigger>
            <SelectContent align="end" className="w-64">
              <SelectGroup>
                <SelectLabel>Profiles AWS</SelectLabel>
                {profiles.map((p) => (
                  <SelectItem key={p.name} value={p.name} className="py-2 cursor-pointer">
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-xs truncate">{p.name}</span>
                        {p.is_production && (
                          <Badge variant="destructive" className="text-[8px] px-1 py-0 shadow-2xs font-bold leading-tight">
                            PROD
                          </Badge>
                        )}
                        {p.is_sso && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 bg-muted/40 font-medium leading-tight">
                            SSO
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">{p.region}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {/* Badges for selected profile */}
          {selectedProfile && (
            <div className="flex items-center gap-1.5">
              {selectedProfile.is_production && (
                <Badge variant="destructive" className="h-6 text-[9px] px-1.5 py-0 font-bold shadow-2xs">
                  PROD
                </Badge>
              )}
              {selectedProfile.is_sso && (
                <Badge variant="outline" className="h-6 text-[9px] px-1.5 py-0 bg-muted/40 font-medium hidden sm:inline-flex">
                  SSO
                </Badge>
              )}
              <Badge
                variant={session === "connected" ? "success" : session === "expired" ? "warning" : "secondary"}
                className="h-6 text-[9px] px-1.5 py-0 flex items-center gap-1"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    session === "connected" ? "bg-emerald-500" : session === "expired" ? "bg-amber-500" : "bg-muted-foreground"
                  }`}
                />
                {session === "connected" ? "Conectado" : session === "expired" ? "AUTH_EXPIRED" : session === "checking" ? "Verificando" : "Idle"}
              </Badge>
              {session === "expired" && (
                <Button
                  size="sm"
                  className="h-8 px-2.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                  onClick={() => void login()}
                  disabled={busy}
                  title="Fazer login SSO na AWS"
                >
                  {busy ? "Entrando…" : "Fazer login"}
                </Button>
              )}
            </div>
          )}

          <div className="flex h-8 items-center gap-2 rounded-md border border-border/80 bg-muted/40 px-2.5 text-xs font-medium shrink-0">
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  health?.awsCli.status === "available"
                    ? "bg-emerald-400"
                    : health?.awsCli.status === "fake"
                    ? "bg-sky-400"
                    : "bg-amber-400"
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  health?.awsCli.status === "available"
                    ? "bg-emerald-500"
                    : health?.awsCli.status === "fake"
                    ? "bg-sky-500"
                    : "bg-amber-500"
                }`}
              />
            </span>
            <Badge variant={health?.awsCli.status === "available" ? "success" : "secondary"} className="border-0 p-0 text-xs font-normal hidden sm:inline-flex">
              {health ? `CLI ${health.awsCli.status}` : "Diagnóstico"}
            </Badge>
          </div>

          <Button
            aria-label="Alternar tema claro e escuro"
            title="Alternar tema"
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8 shrink-0"
          >
            <Sun className="h-4 w-4 text-amber-500 dark:hidden" />
            <Moon className="hidden h-4 w-4 text-sky-400 dark:block" />
          </Button>
        </div>
      </header>

      {/* Simulated Data Banner (Compact) */}
      {health?.awsCli.status === "fake" && (
        <Alert
          className="shrink-0 py-2 px-3 border-sky-500/30 bg-gradient-to-r from-sky-500/10 via-primary/5 to-transparent text-sky-950 dark:text-sky-100 shadow-xs"
          data-testid="fake-data-banner"
        >
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-sky-500 shrink-0" />
              <strong>Dados simulados</strong>
              <span className="text-muted-foreground hidden md:inline">
                • Esta demonstração usa fixtures fictícias. Nenhuma chamada AWS, credencial ou token é persistido.
              </span>
            </div>
            <Badge variant="info" className="text-[10px] py-0 px-2 shrink-0">Modo Seguro Offline</Badge>
          </div>
        </Alert>
      )}

      {/* Notice Alert */}
      {notice && (
        <Alert variant="destructive" className="shrink-0 py-2 px-3 shadow-xs animate-in fade-in-50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
              <span className="font-medium">{notice}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setNotice("")}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </Alert>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
        {/* Left Column: Log Sources & ECS Configuration */}
        {/* Left Column: Log Sources & ECS Configuration */}
        <aside
          className={`shrink-0 h-full flex flex-col min-h-0 overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out ${
            sidebarOpen
              ? "w-[340px] 2xl:w-[360px] opacity-100"
              : "w-0 opacity-0 pointer-events-none -mr-3 select-none"
          }`}
          aria-label="Seleção de fontes ECS"
        >
          <div className="w-[340px] 2xl:w-[360px] flex flex-col space-y-3 pr-0.5 min-h-full transition-opacity duration-200">
            <div className="flex items-center justify-between px-1 shrink-0">
              <div className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Fontes de Log
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSidebarOpen(false)}
                title="Ocultar painel lateral"
              >
                <PanelLeftClose className="h-3.5 w-3.5 mr-1" />
                Ocultar
              </Button>
            </div>

            {!selectedProfile ? (
              <Card className="border-border/80 border-dashed bg-muted/20 p-5 text-center shadow-xs animate-in fade-in-50 duration-200">
                <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-xl bg-primary/10 text-primary mb-3 border border-primary/20">
                  <Cloud className="h-5 w-5" />
                </div>
                <h3 className="text-xs font-bold text-foreground">Nenhum profile selecionado</h3>
                <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                  Selecione um profile no menu suspenso no canto superior direito para carregar os clusters e serviços do ECS.
                </p>
              </Card>
            ) : session === "expired" ? (
              <Card className="border-amber-500/40 bg-amber-500/10 p-4 space-y-3 shadow-xs animate-in fade-in-50 duration-200">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div>
                    <h3 className="text-xs font-bold text-amber-900 dark:text-amber-200">Sessão Expirada</h3>
                    <p className="text-[10px] text-amber-700 dark:text-amber-300 font-mono font-medium">{selectedProfile.name} ({selectedProfile.region})</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  A sessão AWS SSO para este profile precisa ser autenticada para listar clusters e fontes.
                </p>
                <Button
                  className="w-full h-8 text-xs font-semibold"
                  onClick={() => void login()}
                  disabled={busy}
                >
                  {busy ? "Autenticando…" : "Fazer login SSO"}
                </Button>
              </Card>
            ) : session === "checking" ? (
              <Card className="border-border/80 p-4 space-y-2 animate-in fade-in-50 duration-200">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <span className="text-xs font-semibold">Verificando sessão de {selectedProfile.name}...</span>
                </div>
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-28 w-full" />
              </Card>
            ) : (
              <Card className="overflow-hidden shrink-0 border-border/80 shadow-xs animate-in fade-in-50 duration-200 flex flex-col">
                {/* Cluster Selector Header */}
                <div className="p-3 bg-muted/20 border-b border-border/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Server className="h-3.5 w-3.5 text-primary" /> Cluster ECS
                    </label>
                    {cluster && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-mono">
                        {services.length} serviços
                      </Badge>
                    )}
                  </div>
                  <Select
                    value={cluster}
                    disabled={session !== "connected"}
                    onValueChange={(val) => void chooseCluster(val)}
                  >
                    <SelectTrigger aria-label="Cluster" className="h-8 text-xs font-medium bg-background/90 shadow-2xs">
                      <SelectValue placeholder="Selecione um cluster ECS" />
                    </SelectTrigger>
                    <SelectContent>
                      {clusters.map((item) => (
                        <SelectItem key={item.name} value={item.name}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {cluster ? (
                  <div className="p-3 space-y-2.5 flex-1 flex flex-col min-h-0">
                    {/* Search & Select All Actions */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {selectedServices.length > 0
                          ? `${selectedServices.length} de ${services.length} selecionados`
                          : `${visibleServices.length} ${visibleServices.length === 1 ? "serviço" : "serviços"}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => void toggleAllServices()}
                        className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                      >
                        {isAllVisibleSelected ? "Desmarcar visíveis" : "Selecionar todos"}
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                      <Input
                        aria-label="Pesquisar serviços"
                        className="pl-8 text-xs h-8 bg-background/80"
                        value={serviceFilter}
                        onChange={(event) => setServiceFilter(event.target.value)}
                        placeholder="Filtrar serviços..."
                      />
                      {serviceFilter && (
                        <button
                          type="button"
                          onClick={() => setServiceFilter("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Unified Tree View List */}
                    <ScrollArea className="flex-1 min-h-[220px] max-h-[500px] border border-border/60 p-2 bg-background/50 rounded-lg">
                      {visibleServices.length === 0 ? (
                        <p className="p-4 text-center text-xs text-muted-foreground">Nenhum serviço encontrado.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {visibleServices.map((serviceItem) => {
                            const isSelected = selectedServices.includes(serviceItem.name);
                            const serviceSources = sources.filter(
                              (s) => s.service === serviceItem.name || s.service_candidates.includes(serviceItem.name)
                            );

                            return (
                              <div
                                key={serviceItem.name}
                                className={cn(
                                  "rounded-lg border border-border/60 bg-card/60 transition-all overflow-hidden",
                                  isSelected ? "border-primary/40 bg-primary/5 shadow-2xs" : "hover:border-border hover:bg-card/90"
                                )}
                              >
                                {/* Service Row */}
                                <div className="flex items-center gap-2 p-2">
                                  <input
                                    id={`service-${serviceItem.name}`}
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => void toggleService(serviceItem.name)}
                                    className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
                                    aria-label={serviceItem.name}
                                  />
                                  <label
                                    htmlFor={`service-${serviceItem.name}`}
                                    className="flex-1 min-w-0 flex items-center justify-between cursor-pointer select-none"
                                  >
                                    <span
                                      className={cn(
                                        "text-xs truncate",
                                        isSelected ? "font-bold text-foreground" : "font-medium text-foreground/90"
                                      )}
                                    >
                                      {serviceItem.name}
                                    </span>
                                    {isSelected && serviceSources.length > 0 && (
                                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-mono ml-1.5 shrink-0">
                                        {serviceSources.filter((s) => selectedSources.includes(s.id)).length}{" "}
                                        {serviceSources.length === 1 ? "fonte" : "fontes"}
                                      </Badge>
                                    )}
                                  </label>
                                </div>

                                {/* Nested Sources for this Service */}
                                {isSelected && serviceSources.length > 0 && (
                                  <div className="border-t border-border/40 bg-muted/20 px-2.5 py-1.5 space-y-1.5">
                                    {serviceSources.map((source) => {
                                      const labelText = `${source.service ?? source.service_candidates.join(" / ")} · ${
                                        source.container ?? source.container_candidates.join(" / ")
                                      } · ${source.log_group}`;
                                      const isSourceChecked = selectedSources.includes(source.id);

                                      return (
                                        <div key={source.id} className="flex items-start gap-2 text-xs">
                                          <input
                                            id={`source-${source.id}`}
                                            type="checkbox"
                                            checked={isSourceChecked}
                                            onChange={() => toggle(selectedSources, source.id, setSelectedSources)}
                                            className="mt-0.5 h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
                                            aria-label={labelText}
                                          />
                                          <label
                                            htmlFor={`source-${source.id}`}
                                            className="flex-1 min-w-0 cursor-pointer select-none space-y-0.5"
                                          >
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              {source.container && source.container !== serviceItem.name && (
                                                <span className="px-1.5 py-0.2 rounded bg-muted border border-border/40 text-[9px] font-mono text-muted-foreground">
                                                  {source.container}
                                                </span>
                                              )}
                                              {source.shared && (
                                                <Badge variant="warning" className="text-[9px] px-1 py-0 h-3.5">
                                                  compartilhado
                                                </Badge>
                                              )}
                                            </div>
                                            <div className="font-mono text-[10px] text-muted-foreground break-all leading-tight">
                                              {source.log_group}
                                            </div>
                                          </label>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>

                    {/* Shared source warning if any */}
                    {sources.some((source) => source.shared && selectedSources.includes(source.id)) && (
                      <Alert variant="warning" className="p-2 text-[11px]">
                        <strong>Grupo compartilhado.</strong> Origem ambígua; candidatos preservados.
                      </Alert>
                    )}

                    {/* Footer Stats & Actions */}
                    {selectedServices.length > 0 && (
                      <div className="pt-1 flex items-center justify-between text-xs border-t border-border/40">
                        <span className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          {selectedSources.length} {selectedSources.length === 1 ? "fonte ativa" : "fontes ativas"}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2"
                          onClick={() => void resolveSources()}
                          disabled={busy}
                        >
                          <RefreshCw className={cn("h-3 w-3 mr-1 text-primary", busy && "animate-spin")} />
                          Atualizar
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    Selecione um cluster ECS acima para carregar os serviços disponíveis.
                  </div>
                )}
              </Card>
            )}
          </div>
        </aside>

        {/* Right Column: Main Investigation Area */}
        <section className="flex-1 min-h-0 h-full flex flex-col gap-2.5 overflow-hidden">
          {/* Top Panel: Search Command Bar or Live HUD */}
          {activeTab === "history" ? (
            <Card className="overflow-hidden shrink-0 border-border/80 shadow-xs">
              <CardContent className="p-3 space-y-2.5">
                {/* Row 1: Presets & Date Times */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!sidebarOpen && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2 mr-1 animate-in fade-in-50 zoom-in-95 duration-200"
                        onClick={() => setSidebarOpen(true)}
                        title="Exibir Fontes"
                      >
                        <PanelLeftOpen className="h-3.5 w-3.5 mr-1 text-primary" />
                        Fontes
                      </Button>
                    )}
                    <span className="text-[11px] font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5 text-primary" /> Intervalo:
                    </span>
                    {presets.map((item) => (
                      <Button
                        key={item.minutes}
                        variant={period === item.minutes ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => choosePreset(item.minutes)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 bg-muted/40 border border-border/70 rounded-lg p-1 shadow-2xs">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background/90 border border-border/60 shadow-xs focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all">
                      <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                      <label htmlFor="start-time-input" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground select-none cursor-pointer">
                        De:
                      </label>
                      <input
                        id="start-time-input"
                        aria-label="De:"
                        type="datetime-local"
                        className="h-5 w-36 sm:w-40 bg-transparent text-[11px] font-medium text-foreground outline-none border-0 p-0 cursor-pointer focus:ring-0"
                        value={toLocalInput(startTime)}
                        onChange={(event) => {
                          setPeriod(0);
                          setStartTime(fromLocalInput(event.target.value));
                        }}
                      />
                    </div>
                    <span className="text-muted-foreground/40 text-xs font-semibold px-0.5 select-none">→</span>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background/90 border border-border/60 shadow-xs focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all">
                      <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                      <label htmlFor="end-time-input" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground select-none cursor-pointer">
                        Até:
                      </label>
                      <input
                        id="end-time-input"
                        aria-label="Até:"
                        type="datetime-local"
                        className="h-5 w-36 sm:w-40 bg-transparent text-[11px] font-medium text-foreground outline-none border-0 p-0 cursor-pointer focus:ring-0"
                        value={toLocalInput(endTime)}
                        onChange={(event) => {
                          setPeriod(0);
                          setEndTime(fromLocalInput(event.target.value));
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Row 2: Filter Pattern + Quick Suggestions + CTA */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="filter-pattern"
                      className="h-8 font-mono text-xs pl-2.5 pr-28"
                      value={filterPattern}
                      onChange={(event) => setFilterPattern(event.target.value)}
                      placeholder='Filter pattern do CloudWatch (ex: { $.level = "error" })'
                    />
                    <div className="absolute right-1 top-1 hidden sm:flex items-center gap-1">
                      {filterPatternSuggestions.slice(0, 2).map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setFilterPattern(suggestion)}
                          className="rounded bg-muted/80 hover:bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground hover:text-foreground border border-border/40"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                    <span className="hidden lg:inline text-[11px]">
                      <strong>{uniqueQueryKeys}</strong> chaves • <strong>{events.length}</strong> eventos
                    </span>
                    <Button onClick={prepareSearch} disabled={busy} className="h-8 px-4 font-semibold text-xs shadow-sm">
                      <Search className="h-3.5 w-3.5 mr-1" />
                      {busy ? "Buscando…" : "Buscar"}
                    </Button>
                    <Button variant="outline" onClick={startLive} disabled={busy} className="h-8 px-3 font-semibold text-xs shadow-sm">
                      <Play className="h-3.5 w-3.5 mr-1 text-emerald-500 fill-current" />
                      Iniciar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden shrink-0 border-border/90 shadow-xs">
              <CardContent className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Left: Live Status & Metrics */}
                  <div className="flex flex-wrap items-center gap-3">
                    {!sidebarOpen && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2 mr-1 animate-in fade-in-50 zoom-in-95 duration-200"
                        onClick={() => setSidebarOpen(true)}
                        title="Exibir Fontes"
                      >
                        <PanelLeftOpen className="h-3.5 w-3.5 mr-1 text-primary" />
                        Fontes
                      </Button>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        {live === "running" ? (
                          <>
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                          </>
                        ) : live === "paused" ? (
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                        ) : (
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-muted-foreground/40" />
                        )}
                      </span>
                      <Badge
                        variant={live === "running" ? "success" : live === "paused" ? "warning" : "secondary"}
                        className="text-xs font-semibold"
                      >
                        {live === "running" ? "Ao vivo" : live === "paused" ? "Pausado" : "Parado"}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px]">
                        <Wifi className="h-3 w-3 text-primary" />
                        <span><strong>{uniqueQueryKeys}</strong> grupos</span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px]">
                        <Clock3 className="h-3 w-3 text-primary" />
                        <span><strong>{pollMs / 1000}s</strong> polling</span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px]">
                        <Database className="h-3 w-3 text-primary" />
                        <span><strong>{events.length}</strong> acumulados</span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px]">
                        <SlidersHorizontal className="h-3 w-3 text-primary" />
                        <span>Max: <strong>{maxLines === 0 ? "Todos" : maxLines}</strong></span>
                      </div>
                      {pendingLive > 0 && (
                        <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                          <span>{pendingLive} novos em pausa</span>
                        </div>
                      )}
                      {dropped > 0 && (
                        <div className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive font-medium">
                          <span>{dropped} descartados</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Control Action Buttons */}
                  <div className="flex items-center gap-2">
                    {live === "stopped" ? (
                      <Button onClick={startLive} className="h-8 px-4 font-semibold text-xs shadow-sm">
                        <Play className="h-3.5 w-3.5 mr-1 fill-current" />
                        Iniciar
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setLive((state) => (state === "paused" ? "running" : "paused"))}
                          className="h-8 text-xs font-semibold"
                        >
                          {live === "paused" ? (
                            <>
                              <Play className="h-3.5 w-3.5 mr-1 fill-current" />
                              Retomar
                            </>
                          ) : (
                            <>
                              <Pause className="h-3.5 w-3.5 mr-1" />
                              Pausar visualização
                            </>
                          )}
                        </Button>
                        <Button variant="destructive" onClick={stopLive} className="h-8 text-xs font-semibold shadow-sm">
                          <Square className="h-3.5 w-3.5 mr-1 fill-current" />
                          Parar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Unified Timeline / High-Visibility Log Viewer with Multiple Display Modes */}
          <Card className="flex-1 min-h-0 flex flex-col overflow-hidden border-border/90 shadow-sm">
            <CardHeader className="bg-muted/20 border-b border-border/40 shrink-0 p-2.5 px-3 flex-wrap flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-xs font-semibold">
                  {activeTab === "history" ? "Timeline agregada" : "Stream de logs em tempo real"}
                </CardTitle>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {filteredEvents.length} {activeTab === "history" ? "visíveis" : "eventos"}
                </Badge>
                {partialErrors > 0 && <Badge variant="warning" className="text-[10px]">{partialErrors} erros parciais</Badge>}
                {truncated && <Badge variant="warning" className="text-[10px]">Truncado</Badge>}
              </div>

              {/* Toolbar with Display Mode Switcher & Quick Tools */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search in results */}
                <div className="relative w-36 sm:w-56">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                  <Input
                    aria-label={activeTab === "history" ? "Filtrar timeline local" : "Filtrar stream ao vivo"}
                    className="pl-8 text-xs h-7"
                    value={timelineFilter}
                    onChange={(event) => setTimelineFilter(event.target.value)}
                    placeholder="Filtrar eventos..."
                  />
                  {timelineFilter && (
                    <button
                      type="button"
                      onClick={() => setTimelineFilter("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Level Filters */}
                <div className="hidden lg:flex items-center rounded-lg border border-border/60 bg-background/50 p-0.5 text-xs shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setLevelFilter("all")}
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                      levelFilter === "all" ? "bg-muted text-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setLevelFilter("error")}
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                      levelFilter === "error" ? "bg-rose-500/20 text-rose-600 dark:text-rose-300 font-semibold shadow-2xs" : "text-muted-foreground hover:text-rose-500"
                    }`}
                  >
                    Erros {levelCounts.error > 0 && <span className="ml-1 px-1 rounded-full bg-rose-500/20 text-[10px] font-bold">{levelCounts.error}</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLevelFilter("warn")}
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                      levelFilter === "warn" ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold shadow-2xs" : "text-muted-foreground hover:text-amber-500"
                    }`}
                  >
                    Avisos {levelCounts.warn > 0 && <span className="ml-1 px-1 rounded-full bg-amber-500/20 text-[10px] font-bold">{levelCounts.warn}</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLevelFilter("info")}
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                      levelFilter === "info" ? "bg-sky-500/20 text-sky-700 dark:text-sky-300 font-semibold shadow-2xs" : "text-muted-foreground hover:text-sky-500"
                    }`}
                  >
                    Info
                  </button>
                </div>

                {/* Display Mode Selector (Terminal / Tabela / Cards) */}
                <div className="flex items-center rounded-lg border border-border/60 bg-muted/60 p-0.5 shadow-xs" aria-label="Estilo de visualização">
                  <button
                    type="button"
                    onClick={() => setDisplayMode("terminal")}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                      displayMode === "terminal"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Modo Terminal Contínuo (Ideal para stack traces e logs de aplicação)"
                  >
                    <Terminal className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="hidden sm:inline">Terminal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisplayMode("table")}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                      displayMode === "table"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Modo Linhas Compactas / Tabela"
                  >
                    <TableIcon className="h-3.5 w-3.5 text-primary" />
                    <span className="hidden sm:inline">Linhas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisplayMode("cards")}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                      displayMode === "cards"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="Modo Cards Detalhados"
                  >
                    <LayoutGrid className="h-3.5 w-3.5 text-amber-500" />
                    <span className="hidden sm:inline">Cards</span>
                  </button>
                </div>

                {/* Terminal Theme Selector */}
                <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 px-2 py-0.5 shadow-xs">
                  <Palette className="h-3.5 w-3.5 text-primary shrink-0" />
                  <label htmlFor="terminal-theme-select" className="text-[10px] font-semibold text-muted-foreground hidden xl:inline cursor-pointer">
                    Tema:
                  </label>
                  <div className="relative flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full border border-border/80 shrink-0"
                      style={{ backgroundColor: currentTheme.dotColor }}
                    />
                    <select
                      id="terminal-theme-select"
                      aria-label="Tema do terminal"
                      value={terminalTheme}
                      onChange={(e) => setAndStoreTerminalTheme(e.target.value as TerminalThemeId)}
                      className="h-6 bg-transparent text-[11px] font-medium text-foreground outline-none border-0 p-0 cursor-pointer pr-4 appearance-none"
                    >
                      {Object.values(TERMINAL_THEMES).map((th) => (
                        <option key={th.id} value={th.id} className="bg-popover text-popover-foreground">
                          {th.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
                  </div>
                </div>

                {/* Max Lines Selector */}
                <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 px-2 py-0.5 shadow-xs">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-primary shrink-0" />
                  <label htmlFor="max-lines-select" className="text-[10px] font-semibold text-muted-foreground hidden xl:inline cursor-pointer">
                    Max:
                  </label>
                  <div className="relative flex items-center gap-1">
                    <select
                      id="max-lines-select"
                      aria-label="Número máximo de linhas"
                      value={maxLines}
                      onChange={(e) => setAndStoreMaxLines(Number(e.target.value))}
                      className="h-6 bg-transparent text-[11px] font-mono font-medium text-foreground outline-none border-0 p-0 cursor-pointer pr-4 appearance-none"
                    >
                      <option value={100} className="bg-popover text-popover-foreground">100 linhas</option>
                      <option value={250} className="bg-popover text-popover-foreground">250 linhas</option>
                      <option value={500} className="bg-popover text-popover-foreground">500 (padrão)</option>
                      <option value={1000} className="bg-popover text-popover-foreground">1.000 linhas</option>
                      <option value={2000} className="bg-popover text-popover-foreground">2.000 linhas</option>
                      <option value={5000} className="bg-popover text-popover-foreground">5.000 linhas</option>
                      <option value={10000} className="bg-popover text-popover-foreground">10.000 linhas</option>
                      <option value={0} className="bg-popover text-popover-foreground">Todas as linhas</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
                  </div>
                </div>

                {/* Wrap Text Toggle */}
                <Button
                  variant={wrapText ? "secondary" : "ghost"}
                  size="icon"
                  className={`h-7 w-7 transition-colors ${
                    wrapText ? "bg-primary/15 text-primary border border-primary/30 font-bold" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setWrapText((w) => !w)}
                  title={wrapText ? "Desativar quebra de linha (soft wrap)" : "Ativar quebra de linha (soft wrap)"}
                  aria-label={wrapText ? "Desativar quebra de linha" : "Ativar quebra de linha"}
                >
                  <WrapText className="h-3.5 w-3.5" />
                </Button>

                {/* Raw vs JSON format */}
                <Tabs className="w-auto">
                  <TabsList className="h-7 p-0.5">
                    <TabsTrigger active={view === "raw"} onClick={() => setView("raw")} className="h-6 text-[11px] px-2">
                      Original
                    </TabsTrigger>
                    <TabsTrigger active={view === "json"} onClick={() => setView("json")} className="h-6 text-[11px] px-2">
                      JSON
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Copy all visible logs */}
                {events.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => void copyAllVisibleLogs()}
                    title="Copiar todos os logs visíveis"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                )}

                {/* Clear Events */}
                {events.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setEvents([])}
                    title="Limpar eventos em memória"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </CardHeader>

            {/* Multi-Source Switcher Tabs */}
            {activeSources.length > 1 && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/30 border-b border-border/40 overflow-x-auto shrink-0 scrollbar-none"
                role="tablist"
                aria-label="Abas de fontes de logs"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1 shrink-0 flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5 text-primary" /> Fontes:
                </span>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveSourceTab === "all"}
                  onClick={() => setActiveSourceTab("all")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all shrink-0 cursor-pointer ${
                    effectiveSourceTab === "all"
                      ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                      : "bg-background/80 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60"
                  }`}
                >
                  <span>Todas as fontes</span>
                  <Badge
                    variant={effectiveSourceTab === "all" ? "outline" : "secondary"}
                    className={`text-[9px] px-1.5 py-0 font-mono ${
                      effectiveSourceTab === "all" ? "border-primary-foreground/40 text-primary-foreground bg-primary-foreground/15" : ""
                    }`}
                  >
                    {events.length}
                  </Badge>
                </button>
                {activeSources.map((source) => {
                  const isSelected = effectiveSourceTab === source.id;
                  const count = sourceEventCounts[source.id] ?? 0;
                  const svc = source.service ?? (source.service_candidates.length ? source.service_candidates.join("/") : "serviço");
                  const cnt = source.container ?? (source.container_candidates.length ? source.container_candidates.join("/") : "contêiner");
                  const label = `${svc} · ${cnt}`;

                  return (
                    <button
                      key={source.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setActiveSourceTab(source.id)}
                      title={`${label}\nLog Group: ${source.log_group}\nRegião: ${source.region}`}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all shrink-0 max-w-[240px] cursor-pointer ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                          : "bg-background/80 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60"
                      }`}
                    >
                      <span className="truncate">{label}</span>
                      <Badge
                        variant={isSelected ? "outline" : "secondary"}
                        className={`text-[9px] px-1.5 py-0 font-mono shrink-0 ${
                          isSelected ? "border-primary-foreground/40 text-primary-foreground bg-primary-foreground/15" : ""
                        }`}
                      >
                        {count}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Log Event Stream Area with Multi-Mode Rendering */}
            <div className="relative flex-1 min-h-0 flex flex-col">
              <ScrollArea
                ref={logScrollRef}
                onScroll={handleLogScroll}
                className="flex-1 min-h-0 overflow-auto border-0 bg-background/50 rounded-b-xl"
                aria-label={activeTab === "history" ? "Eventos de log" : "Eventos ao vivo"}
              >
                {filteredEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-14 text-center text-muted-foreground">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 mb-2.5 border border-border/40">
                      <ListFilter className="h-5 w-5 text-muted-foreground/60" />
                    </div>
                    <p className="text-xs font-semibold text-foreground">
                      {activeTab === "history"
                        ? "Nenhum evento carregado"
                        : live === "running"
                        ? "Aguardando novos eventos..."
                        : "Live Tail parado"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground max-w-sm">
                      {activeTab === "history"
                        ? "Configure um perfil no painel lateral, selecione serviços e faça uma busca."
                        : live === "running"
                        ? "O polling estruturado está ativo. Eventos aparecerão aqui automaticamente."
                        : "Clique em Iniciar para acompanhar logs em tempo real."}
                    </p>
                  </div>
                ) : displayMode === "terminal" ? (
                  /* MODE 1: Unified Continuous Terminal Stream with theme and full horizontal overflow */
                  <div className="p-2 min-w-full inline-block">
                    <div
                      className={`min-h-full rounded-xl border ${currentTheme.borderClass} ${currentTheme.bgClass} p-2.5 font-mono text-xs leading-relaxed ${currentTheme.textClass} shadow-inner min-w-full ${wrapText ? "w-full" : "w-max"}`}
                    >
                      <div className={`divide-y ${currentTheme.divideClass}`}>
                        {displayedEvents.map((event) => {
                          const level = detectLogLevel(event.message, event.parsed_message);
                          const isCopied = copiedId === event.event_id;
                          const content = view === "json" && event.parsed_message ? JSON.stringify(event.parsed_message, null, 2) : event.message;
                          const chunks = view === "json" && event.parsed_message ? [{ text: content }] : parseAnsiString(content);
                          const tagText = formatServiceTag(event.service, event.container, event.service_candidates);
                          const svcColor = getServiceColor(event.service ?? event.service_candidates[0]);

                          return (
                            <div
                              key={event.event_id}
                              className={cn(
                                `group flex items-start gap-2 py-1 px-1.5 transition-colors ${currentTheme.hoverClass} rounded`,
                                wrapText ? "w-full" : "w-fit min-w-full",
                                level === "error" && "border-l-2 border-l-rose-500 bg-rose-500/5 pl-2",
                                level === "warn" && "border-l-2 border-l-amber-500 bg-amber-500/5 pl-2"
                              )}
                            >
                              {/* Timestamp */}
                              <span className={`shrink-0 text-[11px] select-none font-semibold ${currentTheme.timeClass}`}>
                                {formatTime(event.timestamp)}
                              </span>

                              {/* Level Pill */}
                              <span
                                className={`shrink-0 w-12 text-center text-[10px] uppercase font-bold px-1 rounded ${currentTheme.logLevelClasses[level]}`}
                              >
                                {level !== "none" ? level : "LOG"}
                              </span>

                              {/* Service tag with distinct service color */}
                              <span
                                className={cn("shrink-0 text-[11px] font-bold truncate max-w-[200px] select-none", svcColor.text)}
                                title={tagText}
                              >
                                {tagText}
                              </span>

                              {/* Message content */}
                              <div className={wrapText ? "flex-1 min-w-0 whitespace-pre-wrap break-words" : "whitespace-pre shrink-0"}>
                                {chunks.map((chunk, chunkIdx) => {
                                  let className = chunk.colorClass ?? (currentTheme.id === "light" ? "text-slate-800" : "text-slate-100");
                                  if (chunk.isDim) className += ` ${currentTheme.timeClass} opacity-80`;
                                  if (chunk.isBold) className += " font-bold";
                                  return (
                                    <span key={chunkIdx} className={className}>
                                      {chunk.text}
                                    </span>
                                  );
                                })}
                              </div>

                              {/* Copy button */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`shrink-0 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity p-0 ml-auto ${currentTheme.timeClass} hover:text-foreground`}
                                aria-label={`Copiar evento ${event.event_id}`}
                                title="Copiar mensagem"
                                onClick={() => void copyMessage(event.message, event.event_id)}
                              >
                                {isCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Clipboard className="h-3 w-3" />}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : displayMode === "table" ? (
                  /* MODE 2: High-Density Table / Compact Lines */
                  <div className="p-2 min-w-full inline-block">
                    <div className={`rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs min-w-full ${wrapText ? "w-full" : "w-max"}`}>
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-muted/60 text-muted-foreground border-b border-border/60 text-[11px] uppercase tracking-wider font-semibold sticky top-0 backdrop-blur-xs">
                          <tr>
                            <th className="py-2 px-3 w-40 shrink-0">Data / Hora</th>
                            <th className="py-2 px-2 w-20 shrink-0">Nível</th>
                            <th className="py-2 px-2 w-32 shrink-0">Serviço</th>
                            <th className="py-2 px-2 w-28 hidden sm:table-cell shrink-0">Contêiner</th>
                            <th className="py-2 px-3">Mensagem</th>
                            <th className="py-2 px-2 w-10 text-right shrink-0">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 font-mono text-[11px]">
                          {displayedEvents.map((event) => {
                            const level = detectLogLevel(event.message, event.parsed_message);
                            const isCopied = copiedId === event.event_id;
                            const content = view === "json" && event.parsed_message ? JSON.stringify(event.parsed_message, null, 2) : event.message;
                            const chunks = view === "json" && event.parsed_message ? [{ text: content }] : parseAnsiString(content);
                            const svcColor = getServiceColor(event.service ?? event.service_candidates[0]);

                            return (
                              <tr
                                key={event.event_id}
                                className={cn(
                                  "group hover:bg-muted/40 transition-colors",
                                  level === "error" && "bg-rose-500/5",
                                  level === "warn" && "bg-amber-500/5"
                                )}
                              >
                                <td className="py-1.5 px-3 text-muted-foreground whitespace-nowrap font-medium">
                                  {formatTime(event.timestamp)}
                                </td>
                                <td className="py-1.5 px-2 whitespace-nowrap">
                                  <span
                                    className={`inline-block px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                                      level === "error"
                                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                        : level === "warn"
                                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                        : level === "info"
                                        ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20"
                                        : level === "debug"
                                        ? "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-500/20"
                                        : "text-muted-foreground"
                                    }`}
                                  >
                                    {level !== "none" ? level : "LOG"}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 whitespace-nowrap">
                                  <span
                                    className={cn(
                                      "px-1.5 py-0.5 rounded text-[10px] font-bold border",
                                      svcColor.bg,
                                      svcColor.text,
                                      svcColor.border
                                    )}
                                    title={event.service ?? ""}
                                  >
                                    {event.service ?? event.service_candidates.join("/")}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-muted-foreground hidden sm:table-cell truncate max-w-[120px]" title={event.container ?? ""}>
                                  {event.container && event.container !== event.service ? event.container : "—"}
                                </td>
                                <td className={`py-1.5 px-3 ${wrapText ? "whitespace-pre-wrap break-words max-w-2xl xl:max-w-4xl" : "whitespace-pre"}`}>
                                  {chunks.map((chunk, chunkIdx) => {
                                    let className = chunk.colorClass ?? "text-foreground";
                                    if (chunk.isDim) className += " opacity-70";
                                    if (chunk.isBold) className += " font-bold";
                                    return (
                                      <span key={chunkIdx} className={className}>
                                        {chunk.text}
                                      </span>
                                    );
                                  })}
                                </td>
                                <td className="py-1.5 px-2 text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity p-0"
                                    aria-label={`Copiar evento ${event.event_id}`}
                                    title="Copiar mensagem"
                                    onClick={() => void copyMessage(event.message, event.event_id)}
                                  >
                                    {isCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Clipboard className="h-3 w-3" />}
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* MODE 3: Detailed Expanded Cards */
                  <div className="p-2.5 space-y-2">
                    {displayedEvents.map((event) => {
                      const level = detectLogLevel(event.message, event.parsed_message);
                      const isCopied = copiedId === event.event_id;
                      const svcColor = getServiceColor(event.service ?? event.service_candidates[0]);

                      return (
                        <article
                          key={event.event_id}
                          className={cn(
                            "group rounded-xl border border-border/60 bg-card/60 p-3 shadow-xs transition-colors hover:border-border/90",
                            level === "error" && "border-rose-500/40 bg-rose-500/5",
                            level === "warn" && "border-amber-500/40 bg-amber-500/5"
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <time className="font-mono text-[11px] text-muted-foreground font-semibold bg-muted/80 px-2 py-0.5 rounded-md border border-border/50">
                              {formatTime(event.timestamp)}
                            </time>

                            {level === "error" && (
                              <Badge variant="destructive" className="text-[10px] px-2 py-0 uppercase font-bold tracking-wide">
                                ERROR
                              </Badge>
                            )}
                            {level === "warn" && (
                              <Badge variant="warning" className="text-[10px] px-2 py-0 uppercase font-bold tracking-wide">
                                WARN
                              </Badge>
                            )}
                            {level === "info" && (
                              <Badge variant="info" className="text-[10px] px-2 py-0 uppercase font-bold tracking-wide">
                                INFO
                              </Badge>
                            )}
                            {level === "debug" && (
                              <Badge variant="purple" className="text-[10px] px-2 py-0 uppercase font-bold tracking-wide">
                                DEBUG
                              </Badge>
                            )}

                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-md text-[10px] font-bold border",
                                svcColor.bg,
                                svcColor.text,
                                svcColor.border
                              )}
                            >
                              {event.service ?? event.service_candidates.join(" / ")}
                            </span>

                            {event.container && event.container !== event.service && (
                              <Badge variant="secondary" className="text-[10px] px-2 py-0 font-mono text-muted-foreground">
                                {event.container}
                              </Badge>
                            )}

                            <span className="text-[11px] text-muted-foreground/70 font-mono truncate max-w-xs" title={event.log_group}>
                              {event.log_group}
                            </span>

                            {event.shared_source && (
                              <Badge variant="warning" className="text-[9px] px-1.5 py-0">
                                Compartilhado
                              </Badge>
                            )}

                            <Button
                              className="ml-auto h-6 w-6 opacity-70 group-hover:opacity-100 transition-opacity"
                              size="icon"
                              variant="ghost"
                              aria-label={`Copiar evento ${event.event_id}`}
                              title="Copiar mensagem"
                              onClick={() => void copyMessage(event.message, event.event_id)}
                            >
                              {isCopied ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Clipboard className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>

                          <AnsiLog
                            message={event.message}
                            parsedMessage={event.parsed_message}
                            viewMode={view}
                            terminalTheme={terminalTheme}
                            wrapText={wrapText}
                          />
                        </article>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              {/* Auto-scroll resume banner for live mode if user scrolled down */}
              {live === "running" && !autoScroll && displayedEvents.length > 0 && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 animate-in fade-in slide-in-from-top-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs font-semibold shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 px-3 flex items-center gap-1.5"
                    onClick={() => {
                      setAutoScroll(true);
                      if (logScrollRef.current) {
                        logScrollRef.current.scrollTop = 0;
                      }
                    }}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                    Rolar para os logs mais recentes (topo)
                  </Button>
                </div>
              )}
            </div>

            {cursor && activeTab === "history" && (
              <div className="p-2 border-t border-border/40 shrink-0">
                <Button
                  variant="outline"
                  onClick={() => void runSearch(cursor)}
                  disabled={busy}
                  className="w-full text-xs font-semibold h-7"
                >
                  <ChevronDown className="h-3.5 w-3.5 mr-1" />
                  Carregar mais
                </Button>
              </div>
            )}
          </Card>
        </section>
      </div>

      {/* Production & Window Confirmation Modal */}
      <Dialog open={confirmation === "search"} onOpenChange={(open) => !open && setConfirmation(null)}>
        <DialogContent>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Confirmar consulta ampliada</DialogTitle>
              <DialogDescription>
                {selectedProfile?.is_production && !confirmedProd
                  ? "Este é um profile PROD. Confirme antes da primeira consulta desta sessão."
                  : period === 1440
                  ? "Uma janela de 24 horas pode consultar mais eventos e consumir mais chamadas de leitura."
                  : "A seleção alcança o limite de 10 chaves únicas de log no MVP."}{" "}
                Nenhuma chamada será feita se você cancelar.
              </DialogDescription>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setConfirmation(null);
                setConfirmedProd(true);
                void runSearch();
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Confirmar consulta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modern Floating Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl bg-foreground px-4 py-3 text-xs font-medium text-background shadow-xl animate-in fade-in slide-in-from-bottom-3"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
    </main>
  );
}
