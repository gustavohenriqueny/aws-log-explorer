import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

const event = { event_id: "evt-demo-1", timestamp: 1_725_000_000_000, ingestion_time: 1_725_000_000_100, profile: "demo-prod", region: "us-east-1", cluster: "demo-cluster", service: "orders", service_candidates: ["orders"], container: "api", container_candidates: ["api"], log_group: "/demo/orders", log_stream: "ecs/api/demo", message: '{"level":"error","message":"fictitious timeout"}', parsed_message: { level: "error", message: "fictitious timeout" }, shared_source: false };

function response(body: unknown) { return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })); }
function installFetch() {
  return vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/health") return response({ status: "ok", awsCli: { status: "fake", majorVersion: 2 } });
    if (url === "/api/profiles") return response([{ name: "demo-prod", region: "us-east-1", region_source: "profile", is_sso: true, is_production: true }, { name: "sandbox", region: "us-east-1", region_source: "default", is_sso: false, is_production: false }]);
    if (url.includes("/check")) return response({ profile: "demo-prod", status: "expired", checked_at: "2026-01-01T00:00:00Z", error: null });
    if (url.includes("/login")) return response({ id: "job-fake", profile: "demo-prod", status: "succeeded", error: null });
    if (url.startsWith("/api/ecs/clusters")) return response([{ name: "demo-cluster", arn_key: "opaque" }]);
    if (url.startsWith("/api/ecs/services")) return response([{ name: "orders", cluster: "demo-cluster" }, { name: "payments", cluster: "demo-cluster" }]);
    if (url === "/api/ecs/log-sources/resolve") return response([{ id: "source-orders", query_key: "group-orders", service_candidates: ["orders"], service: "orders", container_candidates: ["api"], container: "api", log_group: "/demo/orders", region: "us-east-1", stream_prefix: "ecs", shared: false }]);
    if (url === "/api/logs/search") return response({ events: [event], cursor: null, has_more: false, truncated: false, partial_errors: [], ordering: "approximate" });
    return Promise.reject(new Error(`Unexpected fake endpoint: ${url}`));
  }));
}

describe("AWS Log Explorer frontend", () => {
  beforeEach(() => { installFetch(); });
  it("renders a prominent fake-data state and switches semantic theme", async () => {
    const user = userEvent.setup(); render(<App />);
    expect(await screen.findByTestId("fake-data-banner")).toHaveTextContent("Dados simulados");
    await user.click(screen.getByRole("button", { name: /alternar tema/i }));
    expect(document.documentElement).toHaveClass("dark");
  });
  it("searches profiles locally and performs the fake profile to historical workflow", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText("Nenhum profile selecionado")).toBeInTheDocument();
    
    // Select profile via shadcn Select
    await user.click(screen.getByRole("combobox", { name: /selecionar profile/i }));
    await user.click(await screen.findByRole("option", { name: /demo-prod/i }));
    expect(await screen.findByText("AUTH_EXPIRED")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fazer login" }));
    await waitFor(() => expect(screen.getAllByText("Conectado")[0]).toBeInTheDocument());

    // Select cluster via shadcn Select
    await user.click(await screen.findByRole("combobox", { name: /cluster/i }));
    await user.click(await screen.findByRole("option", { name: /demo-cluster/i }));

    expect(await screen.findByLabelText("Pesquisar serviços")).toBeInTheDocument();
    await user.click(screen.getByLabelText("orders"));
    expect(await screen.findByLabelText(/orders.*api.*demo\/orders/i)).toBeChecked();
    await user.click(screen.getByRole("button", { name: "24 horas" }));
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("profile PROD");
    await user.click(screen.getByRole("button", { name: "Confirmar consulta" }));
    expect(await screen.findByText(/fictitious timeout/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /copiar evento/i }));
    expect(await screen.findByRole("status")).toHaveTextContent("Mensagem copiada");
  });
  it("starts, pauses, and stops local live controls without a backend request", async () => {
    class FakeSocket extends EventTarget { readyState = 1; send = vi.fn(); close = vi.fn(() => this.dispatchEvent(new Event("close"))); }
    const socket = new FakeSocket();
    vi.stubGlobal("WebSocket", vi.fn(() => socket));
    const user = userEvent.setup();
    render(<App />);
    
    await user.click(screen.getByRole("combobox", { name: /selecionar profile/i }));
    await user.click(await screen.findByRole("option", { name: /demo-prod/i }));
    await user.click(await screen.findByRole("button", { name: "Fazer login" }));
    await waitFor(() => expect(screen.getAllByText("Conectado")[0]).toBeInTheDocument());

    await user.click(await screen.findByRole("combobox", { name: /cluster/i }));
    await user.click(await screen.findByRole("option", { name: /demo-cluster/i }));

    await screen.findByLabelText("orders");
    await user.click(screen.getByLabelText("orders"));
    await screen.findByLabelText(/orders.*api/i);
    await user.click(screen.getByRole("button", { name: "Iniciar" }));
    expect(screen.getByText("Ao vivo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /pausar visualização/i }));
    expect(screen.getByText("Pausado")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Parar" }));
    expect(screen.getByText("Parado")).toBeInTheDocument();
  });
  it("displays empty state in sidebar when no profile is selected", async () => {
    render(<App />);
    expect(screen.getByText("Nenhum profile selecionado")).toBeInTheDocument();
    expect(screen.getByText(/Selecione um profile no menu suspenso/i)).toBeInTheDocument();
    expect(await screen.findByText("CLI fake")).toBeInTheDocument();
  });
  it("supports switching tabs between multiple selected sources", async () => {
    const user = userEvent.setup();
    const event1 = {
      event_id: "evt-orders-1",
      timestamp: 1_725_000_000_000,
      ingestion_time: 1_725_000_000_100,
      profile: "demo-prod",
      region: "us-east-1",
      cluster: "demo-cluster",
      service: "orders",
      service_candidates: ["orders"],
      container: "api",
      container_candidates: ["api"],
      log_group: "/demo/orders",
      log_stream: "ecs/api/orders-1",
      message: "Order placed successfully",
      parsed_message: null,
      shared_source: false,
    };
    const event2 = {
      event_id: "evt-payments-1",
      timestamp: 1_725_000_001_000,
      ingestion_time: 1_725_000_001_100,
      profile: "demo-prod",
      region: "us-east-1",
      cluster: "demo-cluster",
      service: "payments",
      service_candidates: ["payments"],
      container: "worker",
      container_candidates: ["worker"],
      log_group: "/demo/payments",
      log_stream: "ecs/worker/payments-1",
      message: "Payment processed successfully",
      parsed_message: null,
      shared_source: false,
    };

    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/health") return response({ status: "ok", awsCli: { status: "fake", majorVersion: 2 } });
      if (url === "/api/profiles") return response([{ name: "sandbox", region: "us-east-1", region_source: "default", is_sso: false, is_production: false }]);
      if (url.includes("/check")) return response({ profile: "sandbox", status: "connected", checked_at: "2026-01-01T00:00:00Z", error: null });
      if (url.startsWith("/api/ecs/clusters")) return response([{ name: "demo-cluster", arn_key: "opaque" }]);
      if (url.startsWith("/api/ecs/services")) return response([{ name: "orders", cluster: "demo-cluster" }, { name: "payments", cluster: "demo-cluster" }]);
      if (url === "/api/ecs/log-sources/resolve") {
        return response([
          { id: "source-orders", query_key: "group-orders", service_candidates: ["orders"], service: "orders", container_candidates: ["api"], container: "api", log_group: "/demo/orders", region: "us-east-1", stream_prefix: "ecs", shared: false },
          { id: "source-payments", query_key: "group-payments", service_candidates: ["payments"], service: "payments", container_candidates: ["worker"], container: "worker", log_group: "/demo/payments", region: "us-east-1", stream_prefix: "ecs", shared: false },
        ]);
      }
      if (url === "/api/logs/search") return response({ events: [event1, event2], cursor: null, has_more: false, truncated: false, partial_errors: [], ordering: "approximate" });
      return Promise.reject(new Error(`Unexpected fake endpoint: ${url}`));
    }));

    render(<App />);
    await user.click(screen.getByRole("combobox", { name: /selecionar profile/i }));
    await user.click(await screen.findByRole("option", { name: /sandbox/i }));

    await user.click(await screen.findByRole("combobox", { name: /cluster/i }));
    await user.click(await screen.findByRole("option", { name: /demo-cluster/i }));

    await screen.findByLabelText("orders");
    await user.click(screen.getByRole("button", { name: /selecionar todos/i }));
    await screen.findByLabelText(/orders.*api.*demo\/orders/i);

    // Search events
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByText("Order placed successfully")).toBeInTheDocument();
    expect(screen.getByText("Payment processed successfully")).toBeInTheDocument();

    // Source tabs are visible
    const ordersTab = screen.getByRole("tab", { name: /orders · api/i });
    const paymentsTab = screen.getByRole("tab", { name: /payments · worker/i });
    const allTab = screen.getByRole("tab", { name: /todas as fontes/i });

    expect(ordersTab).toBeInTheDocument();
    expect(paymentsTab).toBeInTheDocument();
    expect(allTab).toBeInTheDocument();

    // Click orders tab
    await user.click(ordersTab);
    expect(screen.getByText("Order placed successfully")).toBeInTheDocument();
    expect(screen.queryByText("Payment processed successfully")).not.toBeInTheDocument();

    // Click payments tab
    await user.click(paymentsTab);
    expect(screen.queryByText("Order placed successfully")).not.toBeInTheDocument();
    expect(screen.getByText("Payment processed successfully")).toBeInTheDocument();

    // Click All tab
    await user.click(allTab);
    expect(screen.getByText("Order placed successfully")).toBeInTheDocument();
    expect(screen.getByText("Payment processed successfully")).toBeInTheDocument();
  });
  it("starts with soft wrap disabled by default and allows toggling it", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("combobox", { name: /selecionar profile/i }));
    await user.click(await screen.findByRole("option", { name: /demo-prod/i }));
    await user.click(await screen.findByRole("button", { name: "Fazer login" }));
    await waitFor(() => expect(screen.getAllByText("Conectado")[0]).toBeInTheDocument());

    await user.click(await screen.findByRole("combobox", { name: /cluster/i }));
    await user.click(await screen.findByRole("option", { name: /demo-cluster/i }));

    await screen.findByLabelText("orders");
    await user.click(screen.getByLabelText("orders"));
    await screen.findByLabelText(/orders.*api.*demo\/orders/i);
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await user.click(screen.getByRole("button", { name: "Confirmar consulta" }));
    await screen.findByText(/fictitious timeout/);

    const wrapToggle = screen.getByRole("button", { name: /ativar quebra de linha/i });
    expect(wrapToggle).toBeInTheDocument();

    // Toggle wrap text on
    await user.click(wrapToggle);
    expect(screen.getByRole("button", { name: /desativar quebra de linha/i })).toBeInTheDocument();
  });
  it("allows selecting terminal themes and changing max lines limit", async () => {
    render(<App />);
    await screen.findByRole("combobox", { name: /selecionar profile/i });

    // Check terminal theme selector exists
    const themeSelect = screen.getByLabelText("Tema do terminal");
    expect(themeSelect).toBeInTheDocument();
    expect(themeSelect).toHaveValue("slate");

    // Change theme to dracula
    fireEvent.change(themeSelect, { target: { value: "dracula" } });
    expect(themeSelect).toHaveValue("dracula");

    // Check max lines selector exists and defaults to 500
    const maxLinesSelect = screen.getByLabelText("Número máximo de linhas");
    expect(maxLinesSelect).toBeInTheDocument();
    expect(maxLinesSelect).toHaveValue("500");

    // Change max lines to 1000
    fireEvent.change(maxLinesSelect, { target: { value: "1000" } });
    expect(maxLinesSelect).toHaveValue("1000");
  });
  it("allows hiding and showing the log sources sidebar with smooth transitions", async () => {
    const user = userEvent.setup();
    render(<App />);
    const sidebar = screen.getByLabelText("Seleção de fontes ECS");
    expect(sidebar).toHaveClass("w-[340px]");
    expect(sidebar).toHaveClass("opacity-100");

    // Click Ocultar button
    await user.click(screen.getByRole("button", { name: /ocultar/i }));
    expect(sidebar).toHaveClass("w-0");
    expect(sidebar).toHaveClass("opacity-0");

    // Click Fontes button to reopen
    const openBtn = screen.getByRole("button", { name: "Fontes" });
    expect(openBtn).toBeInTheDocument();
    await user.click(openBtn);
    expect(sidebar).toHaveClass("w-[340px]");
    expect(sidebar).toHaveClass("opacity-100");
  });
  it("renders all relative interval presets including 5, 10, 15, 20, 25, 30 min", async () => {
    const user = userEvent.setup();
    render(<App />);
    for (const label of ["5 min", "10 min", "15 min", "20 min", "25 min", "30 min", "1 hora", "6 horas", "24 horas"]) {
      const btn = screen.getByRole("button", { name: label });
      expect(btn).toBeInTheDocument();
    }
    const fiveMinBtn = screen.getByRole("button", { name: "5 min" });
    await user.click(fiveMinBtn);
    expect(fiveMinBtn).toHaveClass("bg-primary");
  });
  it("displays logs with newest on top and oldest at the bottom", async () => {
    const user = userEvent.setup();
    const olderEvent = {
      event_id: "evt-old",
      timestamp: 1_700_000_000_000,
      ingestion_time: 1_700_000_000_100,
      profile: "demo-prod",
      region: "us-east-1",
      cluster: "demo-cluster",
      service: "orders",
      service_candidates: ["orders"],
      container: "api",
      container_candidates: ["api"],
      log_group: "/demo/orders",
      log_stream: "ecs/api/old",
      message: "First oldest log message",
      parsed_message: null,
      shared_source: false,
    };
    const newerEvent = {
      event_id: "evt-new",
      timestamp: 1_700_000_100_000,
      ingestion_time: 1_700_000_100_100,
      profile: "demo-prod",
      region: "us-east-1",
      cluster: "demo-cluster",
      service: "orders",
      service_candidates: ["orders"],
      container: "api",
      container_candidates: ["api"],
      log_group: "/demo/orders",
      log_stream: "ecs/api/new",
      message: "Second newest log message",
      parsed_message: null,
      shared_source: false,
    };

    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/health") return response({ status: "ok", awsCli: { status: "fake", majorVersion: 2 } });
      if (url === "/api/profiles") return response([{ name: "sandbox", region: "us-east-1", region_source: "default", is_sso: false, is_production: false }]);
      if (url.includes("/check")) return response({ profile: "sandbox", status: "connected", checked_at: "2026-01-01T00:00:00Z", error: null });
      if (url.startsWith("/api/ecs/clusters")) return response([{ name: "demo-cluster", arn_key: "opaque" }]);
      if (url.startsWith("/api/ecs/services")) return response([{ name: "orders", cluster: "demo-cluster" }]);
      if (url === "/api/ecs/log-sources/resolve") {
        return response([
          { id: "source-orders", query_key: "group-orders", service_candidates: ["orders"], service: "orders", container_candidates: ["api"], container: "api", log_group: "/demo/orders", region: "us-east-1", stream_prefix: "ecs", shared: false },
        ]);
      }
      if (url === "/api/logs/search") return response({ events: [olderEvent, newerEvent], cursor: null, has_more: false, truncated: false, partial_errors: [], ordering: "approximate" });
      return Promise.reject(new Error(`Unexpected fake endpoint: ${url}`));
    }));

    render(<App />);
    await user.click(screen.getByRole("combobox", { name: /selecionar profile/i }));
    await user.click(await screen.findByRole("option", { name: /sandbox/i }));
    await user.click(await screen.findByRole("combobox", { name: /cluster/i }));
    await user.click(await screen.findByRole("option", { name: /demo-cluster/i }));
    await screen.findByLabelText("orders");
    await user.click(screen.getByLabelText("orders"));
    await screen.findByLabelText(/orders.*api.*demo\/orders/i);
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByText(/Second newest log message/)).toBeInTheDocument();
    expect(screen.getByText(/First oldest log message/)).toBeInTheDocument();

    const logElements = screen.getAllByText(/log message/);
    expect(logElements).toHaveLength(2);
    // Newest event should appear before older event in the DOM
    expect(logElements[0]).toHaveTextContent("Second newest log message");
    expect(logElements[1]).toHaveTextContent("First oldest log message");
  });

  it("organizes sidebar into Unified Tree View and auto-resolves sources on service toggle", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("combobox", { name: /selecionar profile/i }));
    await user.click(await screen.findByRole("option", { name: /demo-prod/i }));
    await user.click(await screen.findByRole("button", { name: "Fazer login" }));
    await waitFor(() => expect(screen.getAllByText("Conectado")[0]).toBeInTheDocument());

    await user.click(await screen.findByRole("combobox", { name: /cluster/i }));
    await user.click(await screen.findByRole("option", { name: /demo-cluster/i }));

    // Check service checkbox, which auto-resolves sources in background and displays nested in tree
    await screen.findByLabelText("orders");
    await user.click(screen.getByLabelText("orders"));

    expect(await screen.findByLabelText(/orders.*api/i)).toBeInTheDocument();
    expect(screen.getByText(/1 fonte ativa/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /atualizar/i })).toBeInTheDocument();
  });

  it("maintains selected services across multiple filter searches", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("combobox", { name: /selecionar profile/i }));
    await user.click(await screen.findByRole("option", { name: /demo-prod/i }));
    await user.click(await screen.findByRole("button", { name: "Fazer login" }));
    await waitFor(() => expect(screen.getAllByText("Conectado")[0]).toBeInTheDocument());

    await user.click(await screen.findByRole("combobox", { name: /cluster/i }));
    await user.click(await screen.findByRole("option", { name: /demo-cluster/i }));

    const searchInput = await screen.findByLabelText("Pesquisar serviços");

    // Filter 1: orders
    await user.type(searchInput, "order");
    expect(screen.getByLabelText("orders")).toBeInTheDocument();
    await user.click(screen.getByLabelText("orders"));

    // Filter 2: payments (different service)
    await user.clear(searchInput);
    await user.type(searchInput, "pay");
    expect(screen.getByLabelText("payments")).toBeInTheDocument();
    await user.click(screen.getByLabelText("payments"));

    // Filter 3: non-matching query
    await user.clear(searchInput);
    await user.type(searchInput, "xyz-non-existent");
    expect(screen.getByText("Nenhum serviço encontrado.")).toBeInTheDocument();

    // Verify 2 services are selected overall and sources are resolved
    expect(screen.getByText(/2 de 2 selecionados/i)).toBeInTheDocument();
    expect(await screen.findByText(/1 fonte ativa/i)).toBeInTheDocument();
  });

  it("formats date filter inputs in local time and supports changing datetime", async () => {
    render(<App />);

    const startInput = screen.getByLabelText("De:") as HTMLInputElement;
    const endInput = screen.getByLabelText("Até:") as HTMLInputElement;

    expect(startInput).toBeInTheDocument();
    expect(endInput).toBeInTheDocument();
    expect(startInput.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(endInput.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

    await waitFor(() => {
      fireEvent.change(startInput, { target: { value: "2026-08-26T10:00" } });
    });
    expect(startInput.value).toBe("2026-08-26T10:00");

    await waitFor(() => {
      fireEvent.change(endInput, { target: { value: "2026-08-26T11:00" } });
    });
    expect(endInput.value).toBe("2026-08-26T11:00");
  });
});


