import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toCanvas } from "html-to-image";
import React from "react";

vi.mock("html-to-image", () => ({
  toCanvas: vi.fn(),
}));

import {
  createVariantProxy,
  getVariantRuntimeState,
  installVariantOverlay,
} from "../runtime";
import { loadVariantAppConfig, shouldReloadVariantState, variantPlugin } from "../plugin";

afterEach(() => {
  document.body.innerHTML = "";
  delete (globalThis as typeof globalThis & {
    __variant_runtime_controller__?: unknown;
  }).__variant_runtime_controller__;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("variant runtime proxy", () => {
  it("renders the selected variant from the runtime store", () => {
    const OrdersTable = createVariantProxy({
      sourceId: "src/components/OrdersTable.tsx",
      displayName: "Orders Table",
      selected: "source",
      variants: {
        source: function SourceVariant() {
          return <div>Source table</div>;
        },
        cta: function CtaVariant() {
          return <div>Go to orders workspace</div>;
        },
      },
    });

    render(<OrdersTable />);
    expect(screen.getByText("Source table")).toBeInTheDocument();
  });

  it("opens the fullscreen canvas from the direct shortcut and closes it with escape", async () => {
    const DashboardCard = createVariantProxy({
      sourceId: "src/pages/home/dashboard.tsx",
      displayName: "Home Dashboard",
      selected: "source",
      variants: {
        source: function DashboardSource() {
          return <div>Dashboard source</div>;
        },
        editorial: function DashboardEditorial() {
          return <div>Dashboard editorial</div>;
        },
      },
    });

    render(<DashboardCard />);
    installVariantOverlay();

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ",",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    await waitFor(() => {
      expect(getVariantRuntimeState().canvasOpen).toBe(true);
    });
    expect(document.querySelector('[data-variiant-canvas-fullscreen="true"]')).not.toBeNull();

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
      }),
    );

    await waitFor(() => {
      expect(getVariantRuntimeState().canvasOpen).toBe(false);
    });
    expect(document.querySelector('[data-variiant-canvas-fullscreen="true"]')).toBeNull();
  });

  it("shows only currently mounted component families in components mode and labels groups by source file", async () => {
    const DashboardCard = createVariantProxy({
      sourceId: "src/pages/home/dashboard.tsx",
      displayName: "Home Dashboard",
      selected: "source",
      variants: {
        source: function DashboardSource() {
          return <div>Dashboard source</div>;
        },
        editorial: function DashboardEditorial() {
          return <div>Dashboard editorial</div>;
        },
      },
    });

    const MatrixCard = createVariantProxy({
      sourceId: "src/components/MatrixCard.tsx",
      displayName: "Matrix Card",
      selected: "source",
      variants: {
        source: function MatrixSource() {
          return <div>Matrix source</div>;
        },
        calm: function MatrixCalm() {
          return <div>Matrix calm</div>;
        },
      },
    });

    createVariantProxy({
      sourceId: "src/components/NotMounted.tsx",
      displayName: "Not Mounted",
      selected: "source",
      variants: {
        source: function NotMountedSource() {
          return <div>Not mounted</div>;
        },
      },
    });

    render(
      <>
        <DashboardCard />
        <MatrixCard />
        <MatrixCard />
      </>,
    );

    installVariantOverlay();
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ",",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    await waitFor(() => {
      expect(document.querySelectorAll('[data-variant-canvas-group-source="src/pages/home/dashboard.tsx"]').length).toBe(1);
    });

    expect(document.body.textContent).toContain("src/pages/home/dashboard.tsx");
    expect(document.body.textContent).toContain("src/components/MatrixCard.tsx");
    expect(document.body.textContent).toContain("2 mounts");
    expect(document.querySelector('[data-variant-canvas-group-source="src/components/NotMounted.tsx"]')).toBeNull();
  });

  it("renders page mode as cloned DOM previews and restores the live selection afterwards", async () => {
    const MatrixCard = createVariantProxy({
      sourceId: "src/components/MatrixCard.tsx",
      displayName: "Matrix Card",
      selected: "source",
      variants: {
        source: function MatrixSource() {
          return <section data-testid="matrix-card-variant">Matrix source</section>;
        },
        calm: function MatrixCalm() {
          return <section data-testid="matrix-card-variant">Matrix calm</section>;
        },
      },
    });

    render(
      <main data-testid="dashboard-page">
        <h1>Dashboard shell</h1>
        <MatrixCard />
      </main>,
    );
    installVariantOverlay();

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ".",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    const activeChoice = await waitFor(() => {
      const select = document.querySelector('[data-variant-active-choice="true"]') as HTMLSelectElement | null;
      expect(select).not.toBeNull();
      return select!;
    });

    fireEvent.change(activeChoice, {
      target: {
        value: "calm",
      },
    });
    await screen.findByText("Matrix calm");

    const openCanvasButton = await screen.findByText("Open Canvas");
    fireEvent.click(openCanvasButton);
    fireEvent.click(await screen.findByText("Pages"));

    await waitFor(() => {
      expect(getVariantRuntimeState().canvas.captureState).toBe("idle");
      expect(
        document.querySelector('[data-variant-page-preview="source"] [data-variant-page-preview-body="true"]'),
      ).not.toBeNull();
      expect(
        document.querySelector('[data-variant-page-preview="calm"] [data-variant-page-preview-body="true"]'),
      ).not.toBeNull();
    });

    expect(vi.mocked(toCanvas)).not.toHaveBeenCalled();
    expect(getVariantRuntimeState().selections["src/components/MatrixCard.tsx"]).toBe("calm");
    expect(screen.getAllByText("Matrix calm").length).toBeGreaterThan(0);

    const sourcePreview = document.querySelector('[data-variant-page-preview="source"]');
    const calmPreview = document.querySelector('[data-variant-page-preview="calm"]');
    expect(sourcePreview?.textContent).toContain("Dashboard shell");
    expect(sourcePreview?.textContent).toContain("Matrix source");
    expect(calmPreview?.textContent).toContain("Dashboard shell");
    expect(calmPreview?.textContent).toContain("Matrix calm");
    expect(calmPreview?.querySelector('[data-testid="dashboard-page"]')).not.toBeNull();
    expect(document.querySelectorAll('img[alt="source page preview"], img[alt="calm page preview"]').length).toBe(0);
  });

  it("uses inferred parent width for wide component groups in components mode", async () => {
    const WidePanel = createVariantProxy({
      sourceId: "src/components/WidePanel.tsx",
      displayName: "Wide Panel",
      selected: "source",
      variants: {
        source: function WidePanelSource() {
          return <section data-testid="wide-panel">Wide panel source</section>;
        },
        editorial: function WidePanelEditorial() {
          return <section data-testid="wide-panel">Wide panel editorial</section>;
        },
      },
    });

    render(
      <div data-testid="wide-shell">
        <WidePanel />
      </div>,
    );
    installVariantOverlay();

    const shell = await screen.findByTestId("wide-shell");
    const panel = await screen.findByTestId("wide-panel");
    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      width: 1180,
      height: 420,
      left: 0,
      top: 0,
      right: 1180,
      bottom: 420,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      width: 1080,
      height: 280,
      left: 0,
      top: 0,
      right: 1080,
      bottom: 280,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    window.dispatchEvent(new Event("resize"));

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ",",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    await waitFor(() => {
      const group = document.querySelector(
        '[data-variant-canvas-group-source="src/components/WidePanel.tsx"]',
      ) as HTMLElement | null;
      expect(group).not.toBeNull();
      expect(group?.getAttribute("style")).toContain("width:1180px");
    });
  });

  it("supports global component cycling with overlay open or closed", () => {
    const DashboardCard = createVariantProxy({
      sourceId: "src/components/DashboardCard.tsx",
      displayName: "Dashboard Card",
      selected: "source",
      variants: {
        source: function DashboardCardSource() {
          return <div>Dashboard card source</div>;
        },
        compact: function DashboardCardCompact() {
          return <div>Dashboard card compact</div>;
        },
      },
    });

    const DataGrid = createVariantProxy({
      sourceId: "src/components/DataGrid.tsx",
      displayName: "Data Grid",
      selected: "source",
      variants: {
        source: function DataGridSource() {
          return <div>Data grid source</div>;
        },
        editorial: function DataGridEditorial() {
          return <div>Data grid editorial</div>;
        },
      },
    });

    const OrdersTable = createVariantProxy({
      sourceId: "src/components/OrdersTableRuntime.tsx",
      displayName: "Orders Table Runtime",
      selected: "source",
      variants: {
        source: function OrdersTableSource() {
          return <div>Orders table runtime</div>;
        },
      },
    });

    render(
      <>
        <DashboardCard />
        <DataGrid />
        <OrdersTable />
      </>,
    );

    installVariantOverlay();

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        metaKey: true,
        altKey: true,
        bubbles: true,
      }),
    );
    expect(getVariantRuntimeState().activeSourceId).toBe("src/components/DataGrid.tsx");

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        metaKey: true,
        altKey: true,
        bubbles: true,
      }),
    );
    expect(getVariantRuntimeState().activeSourceId).toBe("src/components/OrdersTableRuntime.tsx");

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ".",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    const picker = document.querySelector(
      '[data-variant-active-source="true"]',
    ) as HTMLSelectElement | null;
    expect(picker).not.toBeNull();

    picker!.value = "src/components/OrdersTableRuntime.tsx";
    picker!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(getVariantRuntimeState().activeSourceId).toBe("src/components/OrdersTableRuntime.tsx");

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        metaKey: true,
        altKey: true,
        bubbles: true,
      }),
    );
    expect(getVariantRuntimeState().activeSourceId).toBe("src/components/DataGrid.tsx");

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        metaKey: true,
        altKey: true,
        bubbles: true,
      }),
    );
    expect(getVariantRuntimeState().activeSourceId).toBe("src/components/OrdersTableRuntime.tsx");
  });

  it("replaces the prompt area with a single latest-message progress strip while the agent runs", async () => {
    let releaseSecondMessage!: () => void;
    let releaseCompletion!: () => void;
    const secondMessageReady = new Promise<void>((resolve) => {
      releaseSecondMessage = resolve;
    });
    const completionReady = new Promise<void>((resolve) => {
      releaseCompletion = resolve;
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/__variiant/config")) {
        return new Response(JSON.stringify({
          token: "test-token",
          agent: {
            enabled: true,
            commandLabel: "codex exec --json",
            message: null,
            streaming: "text",
            supportsImages: false,
          },
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      expect(url.endsWith("/__variiant/agent/run")).toBe(true);
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/json",
        "X-Variiant-Token": "test-token",
      });

      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(encoder.encode(`${JSON.stringify({
            type: "session",
            sessionId: "session-1",
            sessionPath: ".variiant/sessions/session-1",
          })}\n`));
          streamController.enqueue(encoder.encode(`${JSON.stringify({
            type: "stdout",
            text: JSON.stringify({
              type: "turn.started",
            }),
          })}\n`));
          streamController.enqueue(encoder.encode(`${JSON.stringify({
            type: "stdout",
            text: JSON.stringify({
              type: "item.completed",
              item: {
                id: "item_8",
                type: "command_execution",
                command: "/bin/zsh -lc \"sed -n '1,220p' src/features/dashboard/index.tsx\"",
                aggregated_output: "import { Button } from '@/components/ui/button'",
                status: "completed",
              },
            }),
          })}\n`));
          streamController.enqueue(encoder.encode(`${JSON.stringify({
            type: "stdout",
            text: JSON.stringify({
              type: "item.completed",
              item: {
                id: "item_9",
                type: "message",
                role: "assistant",
                content: [
                  {
                    type: "output_text",
                    channel: "commentary",
                    text: "I will read the dashboard layout and figure out the right variant seam.",
                  },
                ],
              },
            }),
          })}\n`));

          void (async () => {
            await secondMessageReady;
            streamController.enqueue(encoder.encode(`${JSON.stringify({
              type: "stdout",
              text: JSON.stringify({
                type: "item.completed",
                item: {
                  id: "item_10",
                  type: "message",
                  role: "assistant",
                  content: [
                    {
                      type: "output_text",
                      channel: "commentary",
                      text: "Designing the new variant now.",
                    },
                  ],
                },
              }),
            })}\n`));

            await completionReady;
            streamController.enqueue(encoder.encode(`${JSON.stringify({
              type: "done",
              sessionId: "session-1",
              exitCode: 0,
              changedFiles: [".variiant/variants/src/components/OrdersTable.tsx/default/editorial.tsx"],
            })}\n`));
            streamController.close();
          })();
        },
      });

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson",
        },
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const OrdersTable = createVariantProxy({
      sourceId: "src/components/OrdersTable.tsx",
      displayName: "Orders Table",
      selected: "source",
      variants: {
        source: function SourceVariant() {
          return <div>Source table</div>;
        },
      },
    });

    render(<OrdersTable />);
    installVariantOverlay();

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ".",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    await screen.findByText(/Agent: codex exec --json/i);
    const prompt = document.querySelector('[data-variant-agent-prompt="true"]') as HTMLTextAreaElement | null;
    expect(prompt).not.toBeNull();
    prompt!.focus();

    fireEvent.input(prompt!, {
      target: {
        value: "C",
      },
    });
    expect((document.activeElement as HTMLTextAreaElement | null)?.dataset.variantAgentPrompt).toBe("true");

    const refreshedPrompt = document.querySelector('[data-variant-agent-prompt="true"]') as HTMLTextAreaElement | null;
    expect(refreshedPrompt).not.toBeNull();
    fireEvent.input(refreshedPrompt!, {
      target: {
        value: "Create a more editorial orders table variant.",
      },
    });

    const runButton = document.querySelector('[data-variant-agent-run="true"]') as HTMLButtonElement | null;
    expect(runButton).not.toBeNull();
    fireEvent.click(runButton!);

    await screen.findByText("I will read the dashboard layout and figure out the right variant seam.");
    expect(document.querySelector('[data-variant-agent-progress="true"]')).not.toBeNull();
    expect(document.querySelector('[data-variant-agent-prompt="true"]')).toBeNull();
    expect(document.querySelector('[data-variant-agent-run="true"]')).toBeNull();
    expect(screen.queryByText(/Session saved to/i)).toBeNull();
    expect(screen.queryByText(/turn.started/i)).toBeNull();
    expect(screen.queryByText(/command_execution/i)).toBeNull();
    expect(screen.queryByText(/import \{ Button \}/i)).toBeNull();

    releaseSecondMessage();
    await screen.findByText("Designing the new variant now.");
    await waitFor(() => {
      expect(screen.queryByText("I will read the dashboard layout and figure out the right variant seam.")).toBeNull();
    });

    releaseCompletion();
    await screen.findByText(/Changed files:/i);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(document.querySelector('[data-variant-agent-progress="true"]')).toBeNull();
      expect(document.querySelector('[data-variant-agent-prompt="true"]')).not.toBeNull();
      expect(document.querySelector('[data-variant-agent-run="true"]')).not.toBeNull();
    });
  });

  it("attaches the active component screenshot when the agent config supports CLI images", async () => {
    let runPayload: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/__variiant/config")) {
        return new Response(JSON.stringify({
          token: "test-token",
          agent: {
            enabled: true,
            commandLabel: "codex exec --json",
            message: null,
            streaming: "text",
            supportsImages: true,
          },
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      expect(url.endsWith("/__variiant/agent/run")).toBe(true);
      runPayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response([
        JSON.stringify({
          type: "done",
          sessionId: "session-2",
          exitCode: 0,
          changedFiles: [],
        }),
        "",
      ].join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson",
        },
      });
    });

    vi.stubGlobal("fetch", fetchMock);
    const toCanvasMock = vi.mocked(toCanvas);
    toCanvasMock.mockResolvedValue({} as HTMLCanvasElement);
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
      drawImage,
      fillRect,
      fillStyle: "#ffffff",
    }) as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
      (_type?: string) => "data:image/jpeg;base64,c2NyZWVuc2hvdA==",
    );

    const OrdersTable = createVariantProxy({
      sourceId: "src/components/OrdersTable.tsx",
      displayName: "Orders Table",
      selected: "source",
      variants: {
        source: function SourceVariant() {
          return <div data-testid="orders-table-preview">Source table</div>;
        },
      },
    });

    render(<OrdersTable />);
    installVariantOverlay();

    const preview = await screen.findByTestId("orders-table-preview");
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      width: 320,
      height: 180,
      left: 0,
      top: 0,
      right: 320,
      bottom: 180,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ".",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    await screen.findByText(/Agent: codex exec --json/i);
    const checkbox = document.querySelector(
      '[data-variant-agent-attach-screenshot="true"]',
    ) as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox!);

    const prompt = document.querySelector('[data-variant-agent-prompt="true"]') as HTMLTextAreaElement | null;
    expect(prompt).not.toBeNull();
    fireEvent.input(prompt!, {
      target: {
        value: "Update this component using the attached reference.",
      },
    });

    const runButton = document.querySelector('[data-variant-agent-run="true"]') as HTMLButtonElement | null;
    expect(runButton).not.toBeNull();
    fireEvent.click(runButton!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(runPayload).not.toBeNull();
    });

    expect(toCanvasMock).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({
        backgroundColor: "#ffffff",
        pixelRatio: 1,
        filter: expect.any(Function),
      }),
    );
    expect(fillRect).toHaveBeenCalledWith(0, 0, 320, 180);
    expect(drawImage).toHaveBeenCalled();

    const attachments = Array.isArray(runPayload?.attachments) ? runPayload.attachments : [];
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      kind: "component-screenshot",
      displayName: "Orders Table",
      variantName: "source",
      mimeType: "image/jpeg",
      width: 320,
      height: 180,
      scale: 1,
      fileName: "orders-table.jpg",
      dataUrl: "data:image/jpeg;base64,c2NyZWVuc2hvdA==",
    });
  });

  it("still attaches a screenshot for a display-contents wrapper with OKLCH-styled descendants", async () => {
    let runPayload: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/__variiant/config")) {
        return new Response(JSON.stringify({
          token: "test-token",
          agent: {
            enabled: true,
            commandLabel: "codex exec --json",
            message: null,
            streaming: "text",
            supportsImages: true,
          },
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      runPayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(`${JSON.stringify({
        type: "done",
        sessionId: "session-3",
        exitCode: 0,
        changedFiles: [],
      })}\n`, {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson",
        },
      });
    });

    vi.stubGlobal("fetch", fetchMock);
    const toCanvasMock = vi.mocked(toCanvas);
    toCanvasMock.mockResolvedValue({} as HTMLCanvasElement);
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
      drawImage,
      fillRect,
      fillStyle: "#ffffff",
    }) as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
      (_type?: string) => "data:image/jpeg;base64,b2tsY2g=",
    );

    const MetricsCards = createVariantProxy({
      sourceId: "src/features/dashboard/components/metrics-cards.tsx#MetricsCards",
      displayName: "MetricsCards",
      selected: "source",
      variants: {
        source: function SourceVariant() {
          return (
            <div
              data-testid="metrics-cards-root"
              style={{
                background: "oklch(0.92 0.03 255)",
                color: "oklch(0.32 0.02 255)",
                width: "320px",
                height: "672px",
              }}
            >
              cards
            </div>
          );
        },
      },
    });

    render(<MetricsCards />);
    installVariantOverlay();

    const root = await screen.findByTestId("metrics-cards-root");
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue({
      width: 320,
      height: 672,
      left: 289.5,
      top: 212,
      right: 609.5,
      bottom: 884,
      x: 289.5,
      y: 212,
      toJSON: () => ({}),
    } as DOMRect);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ".",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    await screen.findByText(/Agent: codex exec --json/i);
    const checkbox = document.querySelector(
      '[data-variant-agent-attach-screenshot="true"]',
    ) as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox!);

    const prompt = document.querySelector('[data-variant-agent-prompt="true"]') as HTMLTextAreaElement | null;
    expect(prompt).not.toBeNull();
    fireEvent.input(prompt!, {
      target: {
        value: "Use the screenshot.",
      },
    });

    const runButton = document.querySelector('[data-variant-agent-run="true"]') as HTMLButtonElement | null;
    expect(runButton).not.toBeNull();
    fireEvent.click(runButton!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(runPayload).not.toBeNull();
    });

    expect(toCanvasMock).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({
        backgroundColor: "#ffffff",
        pixelRatio: 1,
        filter: expect.any(Function),
      }),
    );
    expect(fillRect).toHaveBeenCalledWith(0, 0, 320, 672);
    expect(drawImage).toHaveBeenCalled();

    const attachments = Array.isArray(runPayload?.attachments) ? runPayload.attachments : [];
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      displayName: "MetricsCards",
      mimeType: "image/jpeg",
      fileName: "metricscards.jpg",
      dataUrl: "data:image/jpeg;base64,b2tsY2g=",
    });
  });

  it("captures the full descendant bounds for a multi-node display-contents boundary", async () => {
    let runPayload: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/__variiant/config")) {
        return new Response(JSON.stringify({
          token: "test-token",
          agent: {
            enabled: true,
            commandLabel: "codex exec --json",
            message: null,
            streaming: "text",
            supportsImages: true,
          },
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      runPayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(`${JSON.stringify({
        type: "done",
        sessionId: "session-4",
        exitCode: 0,
        changedFiles: [],
      })}\n`, {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson",
        },
      });
    });

    vi.stubGlobal("fetch", fetchMock);
    const toCanvasMock = vi.mocked(toCanvas);
    toCanvasMock.mockResolvedValue({} as HTMLCanvasElement);
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
      drawImage,
      fillRect: vi.fn(),
      fillStyle: "#ffffff",
    }) as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
      () => "data:image/jpeg;base64,ZGFzaGJvYXJk",
    );

    const Dashboard = createVariantProxy({
      sourceId: "src/features/dashboard/index.tsx#Dashboard",
      displayName: "Dashboard",
      selected: "source",
      variants: {
        source: function SourceVariant() {
          return (
            <>
              <div data-testid="dashboard-header">header</div>
              <div data-testid="dashboard-body">body</div>
            </>
          );
        },
      },
    });

    render(<Dashboard />);
    installVariantOverlay();

    const header = await screen.findByTestId("dashboard-header");
    const body = await screen.findByTestId("dashboard-body");
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue({
      width: 800,
      height: 120,
      left: 100,
      top: 50,
      right: 900,
      bottom: 170,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    } as DOMRect);
    vi.spyOn(body, "getBoundingClientRect").mockReturnValue({
      width: 800,
      height: 500,
      left: 100,
      top: 200,
      right: 900,
      bottom: 700,
      x: 100,
      y: 200,
      toJSON: () => ({}),
    } as DOMRect);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ".",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    await screen.findByText(/Agent: codex exec --json/i);
    const sourcePicker = document.querySelector('[data-variant-active-source="true"]') as HTMLSelectElement | null;
    expect(sourcePicker).not.toBeNull();
    fireEvent.change(sourcePicker!, {
      target: { value: "src/features/dashboard/index.tsx#Dashboard" },
    });

    const checkbox = document.querySelector(
      '[data-variant-agent-attach-screenshot="true"]',
    ) as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox!);

    const prompt = document.querySelector('[data-variant-agent-prompt="true"]') as HTMLTextAreaElement | null;
    expect(prompt).not.toBeNull();
    fireEvent.input(prompt!, {
      target: {
        value: "Use the full dashboard screenshot.",
      },
    });

    const runButton = document.querySelector('[data-variant-agent-run="true"]') as HTMLButtonElement | null;
    expect(runButton).not.toBeNull();
    fireEvent.click(runButton!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(runPayload).not.toBeNull();
    });

    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      100,
      50,
      800,
      650,
      0,
      0,
      800,
      650,
    );

    const attachments = Array.isArray(runPayload?.attachments) ? runPayload.attachments : [];
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      displayName: "Dashboard",
      width: 800,
      height: 650,
      mimeType: "image/jpeg",
      fileName: "dashboard.jpg",
      dataUrl: "data:image/jpeg;base64,ZGFzaGJvYXJk",
    });
  });
});

describe("variant plugin", () => {
  it("only reloads when variant state inputs change", () => {
    const projectRoot = "/repo";
    const variantsRoots = ["/repo/.variiant/variants", "/repo/.variants"];
    const configPath = "/repo/variiant.config.json";

    expect(shouldReloadVariantState(projectRoot, variantsRoots, configPath, "/repo/.variiant/variants/src/foo.tsx/default/new.tsx")).toBe(true);
    expect(shouldReloadVariantState(projectRoot, variantsRoots, configPath, "/repo/.variants/src/foo.tsx/default/new.tsx")).toBe(true);
    expect(shouldReloadVariantState(projectRoot, variantsRoots, configPath, "/repo/variiant.config.json")).toBe(true);
    expect(shouldReloadVariantState(projectRoot, variantsRoots, configPath, "/repo/.variiant/sessions/abc/request.json")).toBe(false);
    expect(shouldReloadVariantState(projectRoot, variantsRoots, configPath, "/repo/src/App.tsx")).toBe(false);
  });

  it("accepts flat dotted agent config keys for compatibility", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variant-plugin-config-"));
    fs.writeFileSync(
      path.join(tempRoot, "variiant.config.json"),
      JSON.stringify({
        "agent.command": ["codex", "exec"],
        "agent.streaming": "text",
        "agent.image.cliFlag": "--image",
      }, null, 2),
    );

    expect(loadVariantAppConfig(tempRoot)).toEqual({
      agent: {
        command: ["codex", "exec"],
        streaming: "text",
        image: {
          cliFlag: "--image",
        },
      },
    });
  });

  it("builds a proxy module for a conventional default export target", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variant-plugin-"));
    const sourcePath = path.join(tempRoot, "src", "components");
    const variantsPath = path.join(
      tempRoot,
      ".variiant",
      "variants",
      "src",
      "components",
      "OrdersTable.tsx",
      "default",
    );
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(variantsPath, { recursive: true });
    fs.writeFileSync(path.join(sourcePath, "OrdersTable.tsx"), "export default function OrdersTable(){ return null; }");
    fs.writeFileSync(path.join(variantsPath, "compact.tsx"), "export default function Compact(){ return null; }");

    process.chdir(tempRoot);
    const plugin = variantPlugin({ projectRoot: tempRoot });
    plugin.configResolved?.({
      root: tempRoot,
    } as never);

    const resolved = await plugin.resolveId?.call(
      {
        resolve: async () => ({ id: path.join(tempRoot, "src", "components", "OrdersTable.tsx") }),
      } as never,
      "./components/OrdersTable",
      path.join(tempRoot, "src", "App.tsx"),
      {},
    );

    expect(String(resolved)).toContain("variant-proxy:");

    const loaded = await plugin.load?.call(
      {
        meta: { watchMode: true },
      } as never,
      String(resolved),
    );

    expect(String(loaded)).toContain('import * as SourceModule from');
    expect(String(loaded)).toContain('import DefaultCompactVariant from');
    expect(String(loaded)).toContain('createVariantProxy');
    expect(String(loaded)).toContain('installVariantOverlay()');
  });

  it("builds a proxy module for a named export target", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variant-plugin-named-"));
    const sourcePath = path.join(tempRoot, "src", "features");
    const variantsPath = path.join(
      tempRoot,
      ".variiant",
      "variants",
      "src",
      "features",
      "dashboard.tsx",
      "Dashboard",
    );
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(variantsPath, { recursive: true });
    fs.writeFileSync(
      path.join(sourcePath, "dashboard.tsx"),
      "export function Dashboard(){ return null; }",
    );
    fs.writeFileSync(
      path.join(variantsPath, "sparkline.tsx"),
      "export default function Sparkline(){ return null; }",
    );

    process.chdir(tempRoot);
    const plugin = variantPlugin({ projectRoot: tempRoot });
    plugin.configResolved?.({
      root: tempRoot,
    } as never);

    const resolved = await plugin.resolveId?.call(
      {
        resolve: async () => ({ id: path.join(tempRoot, "src", "features", "dashboard.tsx") }),
      } as never,
      "./features/dashboard",
      path.join(tempRoot, "src", "App.tsx"),
      {},
    );

    const loaded = await plugin.load?.call(
      {
        meta: { watchMode: true },
      } as never,
      String(resolved),
    );

    expect(String(loaded)).toContain('import * as SourceModule from');
    expect(String(loaded)).toContain('SourceModule["Dashboard"]');
    expect(String(loaded)).toContain('sourceId: "src/features/dashboard.tsx#Dashboard"');
    expect(String(loaded)).toContain('export { DashboardVariantVariantProxy as Dashboard };');

    const productionLoaded = await plugin.load?.call(
      {
        meta: { watchMode: false },
      } as never,
      String(resolved),
    );

    expect(String(productionLoaded)).toContain('export * from');
    expect(String(productionLoaded)).toContain('export * from');
  });

  it("builds a proxy module for a conventional default export target from an index file", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variant-plugin-default-"));
    const sourcePath = path.join(tempRoot, "src", "features", "dashboard");
    const variantsPath = path.join(
      tempRoot,
      ".variiant",
      "variants",
      "src",
      "features",
      "dashboard",
      "index.tsx",
      "default",
    );
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(variantsPath, { recursive: true });
    fs.writeFileSync(
      path.join(sourcePath, "index.tsx"),
      "export default function Dashboard(){ return null; }\nexport const helper = 1;",
    );
    fs.writeFileSync(
      path.join(variantsPath, "sparkline.tsx"),
      "export default function Sparkline(){ return null; }",
    );

    process.chdir(tempRoot);
    const plugin = variantPlugin({ projectRoot: tempRoot });
    plugin.configResolved?.({
      root: tempRoot,
    } as never);

    const resolved = await plugin.resolveId?.call(
      {
        resolve: async () => ({ id: path.join(tempRoot, "src", "features", "dashboard", "index.tsx") }),
      } as never,
      "./features/dashboard",
      path.join(tempRoot, "src", "App.tsx"),
      {},
    );

    const loaded = await plugin.load?.call(
      {
        meta: { watchMode: true },
      } as never,
      String(resolved),
    );

    expect(String(loaded)).toContain('export * from');
    expect(String(loaded)).toContain('import * as SourceModule from');
    expect(String(loaded)).toContain('sourceId: "src/features/dashboard/index.tsx"');
    expect(String(loaded)).toContain('export default DefaultVariantVariantProxy;');
  });

  it("exposes a dev-only local agent bridge that can modify files inside the project root", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variant-plugin-agent-"));
    fs.writeFileSync(
      path.join(tempRoot, "variiant.config.json"),
      JSON.stringify({
        agent: {
          command: [
            "node",
            "-e",
            [
              "const fs=require('node:fs');",
              "let input='';",
              "process.stdin.on('data',chunk=>input+=chunk);",
              "process.stdin.on('end',()=>{",
              "fs.writeFileSync('created-by-agent.txt', input);",
              "console.log('agent wrote file');",
              "});",
            ].join(""),
          ],
          streaming: "text",
        },
      }, null, 2),
    );

    let middleware:
      | ((req: unknown, res: unknown, next: () => void) => void)
      | undefined;

    const plugin = variantPlugin({ projectRoot: tempRoot });
    plugin.configResolved?.({
      root: tempRoot,
    } as never);
    plugin.configureServer?.({
      watcher: {
        add: vi.fn(),
        on: vi.fn(),
      },
      ws: {
        send: vi.fn(),
      },
      middlewares: {
        use(handler: (req: unknown, res: unknown, next: () => void) => void) {
          middleware = handler;
        },
      },
    } as never);

    expect(middleware).toBeDefined();

    const configResponse = await invokeMiddleware(middleware!, {
      method: "GET",
      url: "/__variiant/config",
    });
    expect(configResponse.statusCode).toBe(200);

    const configPayload = JSON.parse(configResponse.body) as {
      token: string;
      agent: {
        enabled: boolean;
      };
    };
    expect(configPayload.agent.enabled).toBe(true);

    const runResponse = await invokeMiddleware(middleware!, {
      method: "POST",
      url: "/__variiant/agent/run",
      headers: {
        "x-variiant-token": configPayload.token,
      },
      body: JSON.stringify({
        prompt: "Create a new variant.",
        page: {
          url: "http://localhost:5173/dashboard",
          title: "Dashboard",
        },
      }),
    });

    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.body).toContain('"type":"session"');
    expect(runResponse.body).toContain("agent wrote file");
    expect(runResponse.body).toContain('"type":"done"');
    expect(fs.existsSync(path.join(tempRoot, "created-by-agent.txt"))).toBe(true);
    expect(runResponse.body).toContain("created-by-agent.txt");
    expect(fs.readFileSync(path.join(tempRoot, ".variiant", ".gitignore"), "utf8")).toBe("sessions/\n");
  });

  it("passes a saved screenshot to the configured agent CLI image flag", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variant-plugin-agent-image-"));
    const agentScriptPath = path.join(tempRoot, "agent-image.js");
    fs.writeFileSync(
      agentScriptPath,
      [
        "const fs=require('node:fs');",
        "let input='';",
        "process.stdin.on('data',chunk=>input+=chunk);",
        "process.stdin.on('end',()=>{",
        "const imageFlagIndex=process.argv.indexOf('--image');",
        "const imagePath=imageFlagIndex===-1?null:process.argv[imageFlagIndex+1];",
        "fs.writeFileSync('agent-input.json', JSON.stringify({",
        "stdin:input,",
        "imagePath,",
        "imageContents:imagePath?fs.readFileSync(imagePath,'utf8'):null,",
        "}, null, 2));",
        "console.log('agent received image');",
        "});",
      ].join(""),
    );
    fs.writeFileSync(
      path.join(tempRoot, "variiant.config.json"),
      JSON.stringify({
        agent: {
          command: ["node", agentScriptPath],
          streaming: "text",
          image: {
            cliFlag: "--image",
          },
        },
      }, null, 2),
    );

    let middleware:
      | ((req: unknown, res: unknown, next: () => void) => void)
      | undefined;

    const plugin = variantPlugin({ projectRoot: tempRoot });
    plugin.configResolved?.({
      root: tempRoot,
    } as never);
    plugin.configureServer?.({
      watcher: {
        add: vi.fn(),
        on: vi.fn(),
      },
      ws: {
        send: vi.fn(),
      },
      middlewares: {
        use(handler: (req: unknown, res: unknown, next: () => void) => void) {
          middleware = handler;
        },
      },
    } as never);

    expect(middleware).toBeDefined();

    const configResponse = await invokeMiddleware(middleware!, {
      method: "GET",
      url: "/__variiant/config",
    });
    const configPayload = JSON.parse(configResponse.body) as {
      token: string;
      agent: {
        enabled: boolean;
        supportsImages: boolean;
      };
    };

    expect(configPayload.agent.enabled).toBe(true);
    expect(configPayload.agent.supportsImages).toBe(true);

    const runResponse = await invokeMiddleware(middleware!, {
      method: "POST",
      url: "/__variiant/agent/run",
      headers: {
        "x-variiant-token": configPayload.token,
      },
      body: JSON.stringify({
        prompt: "Use the attached screenshot.",
        attachments: [
          {
            kind: "component-screenshot",
            sourceId: "src/components/OrdersTable.tsx",
            displayName: "Orders Table",
            variantName: "source",
            mimeType: "image/png",
            fileName: "orders-table.png",
            width: 320,
            height: 180,
            scale: 1,
            dataUrl: "data:image/png;base64,c2NyZWVuc2hvdA==",
          },
        ],
      }),
    });

    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.body).toContain("agent received image");

    const agentInput = JSON.parse(
      fs.readFileSync(path.join(tempRoot, "agent-input.json"), "utf8"),
    ) as {
      stdin: string;
      imagePath: string | null;
      imageContents: string | null;
    };

    expect(agentInput.imagePath).toMatch(/orders-table\.png$/);
    expect(agentInput.imageContents).toBe("screenshot");
    expect(agentInput.stdin).toContain("Image attachments:");

    const sessionDirs = fs.readdirSync(path.join(tempRoot, ".variiant", "sessions"));
    expect(sessionDirs).toHaveLength(1);
    const requestPayload = JSON.parse(
      fs.readFileSync(
        path.join(tempRoot, ".variiant", "sessions", sessionDirs[0]!, "request.json"),
        "utf8",
      ),
    ) as {
      attachments?: Array<{ path?: string; dataUrl?: string }>;
    };

    expect(requestPayload.attachments?.[0]?.path).toMatch(/orders-table\.png$/);
    expect(requestPayload.attachments?.[0]?.dataUrl).toBeUndefined();
  });

  it("falls back to the legacy .variants directory when the canonical workspace is absent", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variant-plugin-legacy-"));
    const sourcePath = path.join(tempRoot, "src", "components");
    const legacyVariantsPath = path.join(
      tempRoot,
      ".variants",
      "src",
      "components",
      "OrdersTable.tsx",
      "default",
    );
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(legacyVariantsPath, { recursive: true });
    fs.writeFileSync(path.join(sourcePath, "OrdersTable.tsx"), "export default function OrdersTable(){ return null; }");
    fs.writeFileSync(path.join(legacyVariantsPath, "compact.tsx"), "export default function Compact(){ return null; }");

    process.chdir(tempRoot);
    const plugin = variantPlugin({ projectRoot: tempRoot });
    plugin.configResolved?.({
      root: tempRoot,
    } as never);

    const resolved = await plugin.resolveId?.call(
      {
        resolve: async () => ({ id: path.join(tempRoot, "src", "components", "OrdersTable.tsx") }),
      } as never,
      "./components/OrdersTable",
      path.join(tempRoot, "src", "App.tsx"),
      {},
    );

    expect(String(resolved)).toContain("variant-proxy:");
  });
});

async function invokeMiddleware(
  middleware: (req: unknown, res: unknown, next: () => void) => void,
  options: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<{
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}> {
  const req = new PassThrough() as PassThrough & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = options.method;
  req.url = options.url;
  req.headers = options.headers ?? {};
  req.end(options.body ?? "");

  const headers: Record<string, string> = {};
  const chunks: string[] = [];

  return await new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      write(chunk: string | Buffer) {
        chunks.push(chunk.toString());
        return true;
      },
      end(chunk?: string | Buffer) {
        if (chunk) {
          chunks.push(chunk.toString());
        }

        resolve({
          statusCode: this.statusCode,
          body: chunks.join(""),
          headers,
        });
      },
    };

    try {
      middleware(req, res, () => {
        reject(new Error(`Middleware did not handle ${options.method} ${options.url}.`));
      });
    } catch (error) {
      reject(error);
    }
  });
}
