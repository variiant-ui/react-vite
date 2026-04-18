import { toCanvas } from "html-to-image";
import type { VariantRuntimeController, VariantRuntimeSnapshot } from "../runtime-core";
import { getRepresentativeMountedInstance } from "../runtime-core";
import { escapeAttributeValue, getRenderableComponentRect } from "./shared";
import { getDisplayableAgentEvent, normalizeAgentMessageText } from "./agent-parse";

export { normalizeAgentMessageText } from "./agent-parse";

const variantTweakCatalogRoutePath = "/__variiant/tweak/catalog";
const variantTweakApplyRoutePath = "/__variiant/tweak/apply";

type VariantAgentRequestAttachment = {
  kind: "component-screenshot" | "sketch";
  sourceId: string;
  displayName: string;
  variantName: string | null;
  mimeType: "image/jpeg" | "image/png";
  fileName: string;
  width: number;
  height: number;
  scale: 1;
  dataUrl: string;
};

type VariantAgentRequestTarget = {
  sourceId: string;
  displayName: string;
  selected: string;
  variantNames: string[];
  sourceRelativePath: string;
  exportName: string;
  variantDirectory: string;
  exampleVariantFile: string;
  stabilityRisk: "higher" | "normal";
  stabilityRiskReason: string | null;
};

const agentBridgeStates = new WeakMap<VariantRuntimeController, {
  loaded: boolean;
  loadingPromise: Promise<void> | null;
  token: string | null;
}>();

function getAgentBridgeState(controller: VariantRuntimeController): {
  loaded: boolean;
  loadingPromise: Promise<void> | null;
  token: string | null;
} {
  let existing = agentBridgeStates.get(controller);
  if (!existing) {
    existing = {
      loaded: false,
      loadingPromise: null,
      token: null,
    };
    agentBridgeStates.set(controller, existing);
  }

  return existing;
}

export async function loadAgentBridgeConfig(controller: VariantRuntimeController): Promise<void> {
  const bridgeState = getAgentBridgeState(controller);
  if (bridgeState.loaded) {
    return;
  }

  if (bridgeState.loadingPromise) {
    await bridgeState.loadingPromise;
    return;
  }

  bridgeState.loadingPromise = (async () => {
    try {
      const response = await fetch("/__variiant/config");
      if (!response.ok) {
        throw new Error("Failed to load local agent config.");
      }

      const payload = await response.json() as {
        token?: string;
        agent?: {
          enabled?: boolean;
          commandLabel?: string | null;
          message?: string | null;
          streaming?: "auto" | "text" | "none" | null;
          supportsImages?: boolean;
        };
      };

      bridgeState.token = typeof payload.token === "string" ? payload.token : null;
      controller.actions.setAgentAvailability({
        enabled: Boolean(payload.agent?.enabled),
        commandLabel: payload.agent?.commandLabel ?? null,
        message: payload.agent?.message ?? null,
        streaming: payload.agent?.streaming ?? null,
        supportsImages: Boolean(payload.agent?.supportsImages),
      });
    } catch (error) {
      controller.actions.setAgentAvailability({
        enabled: false,
        commandLabel: null,
        message: error instanceof Error ? error.message : "Local agent bridge unavailable.",
        streaming: null,
        supportsImages: false,
      });
    } finally {
      bridgeState.loaded = true;
      bridgeState.loadingPromise = null;
    }
  })();

  await bridgeState.loadingPromise;
}

export function getActiveMountedComponent(snapshot: VariantRuntimeSnapshot) {
  const mounted = snapshot.components.filter((component) => component.mountedCount > 0);
  return mounted.find((component) => component.sourceId === snapshot.activeSourceId) ?? mounted[0] ?? null;
}

export async function submitAgentPrompt(controller: VariantRuntimeController): Promise<void> {
  await loadAgentBridgeConfig(controller);

  const bridgeState = getAgentBridgeState(controller);
  const snapshot = controller.getSnapshot();
  const prompt = snapshot.agent.prompt.trim();
  if (!prompt) {
    return;
  }

  if (!snapshot.agent.availability.enabled) {
    controller.actions.clearAgentRun();
    controller.actions.finishAgentRun({
      error: snapshot.agent.availability.message ?? "Local agent bridge is disabled.",
    });
    return;
  }

  controller.actions.startAgentRun();
  const attachments: VariantAgentRequestAttachment[] = [];
  const activeComponent = getActiveMountedComponent(snapshot);
  if (
    snapshot.agent.attachActiveComponentScreenshot
    && snapshot.agent.availability.supportsImages
    && activeComponent
  ) {
    try {
      const attachment = await captureComponentScreenshot(
        activeComponent.sourceId,
        activeComponent.displayName,
        snapshot.selections[activeComponent.sourceId] ?? activeComponent.selected,
      );
      if (attachment) {
        attachments.push(attachment);
        controller.actions.appendAgentLog(
          "system",
          `Attached ${activeComponent.displayName} screenshot.`,
        );
      } else {
        controller.actions.appendAgentLog(
          "system",
          `Skipped ${activeComponent.displayName} screenshot because it could not be captured.`,
        );
      }
    } catch (error) {
      controller.actions.appendAgentLog(
        "system",
        `Failed to attach ${activeComponent.displayName} screenshot: ${error instanceof Error ? error.message : "Unknown error."}`,
      );
    }
  }
  if (
    snapshot.sketch.status === "ready"
    && snapshot.sketch.dataUrl
    && snapshot.sketch.width
    && snapshot.sketch.height
  ) {
    attachments.push({
      kind: "sketch",
      sourceId: snapshot.activeSourceId ?? "page",
      displayName: "Sketch Overlay",
      variantName: null,
      mimeType: "image/png",
      fileName: snapshot.sketch.fileName ?? "sketch.png",
      width: snapshot.sketch.width,
      height: snapshot.sketch.height,
      scale: 1,
      dataUrl: snapshot.sketch.dataUrl,
    });
    controller.actions.appendAgentLog("system", "Attached sketch overlay.");
  }
  controller.actions.appendAgentLog(
    "system",
    `Running ${snapshot.agent.availability.commandLabel ?? "local agent"}...`,
  );

  try {
    const response = await fetch("/__variiant/agent/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bridgeState.token ? { "X-Variiant-Token": bridgeState.token } : {}),
      },
      body: JSON.stringify(buildAgentRequestPayload(snapshot, attachments)),
    });

    if (!response.ok) {
      const errorText = await readResponseText(response);
      controller.actions.finishAgentRun({
        error: errorText || "The configured agent command returned an error.",
      });
      return;
    }

    await consumeAgentResponse(response, controller);
  } catch (error) {
    controller.actions.finishAgentRun({
      error: error instanceof Error ? error.message : "The configured agent command failed.",
    });
  }
}

export async function loadDeterministicTweaks(controller: VariantRuntimeController): Promise<void> {
  await loadAgentBridgeConfig(controller);
  const snapshot = controller.getSnapshot();
  const activeComponent = getActiveMountedComponent(snapshot);
  const selectedVariant = activeComponent
    ? snapshot.selections[activeComponent.sourceId] ?? activeComponent.selected
    : null;
  if (!activeComponent || !selectedVariant) {
    controller.actions.finishLoadingTweaks({
      error: "Select a mounted component before loading tweaks.",
    });
    return;
  }

  if (selectedVariant === "source") {
    controller.actions.finishLoadingTweaks({
      error: "Select a generated variant before loading deterministic tweaks.",
    });
    return;
  }

  controller.actions.startLoadingTweaks();
  const bridgeState = getAgentBridgeState(controller);

  try {
    const response = await fetch(variantTweakCatalogRoutePath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bridgeState.token ? { "X-Variiant-Token": bridgeState.token } : {}),
      },
      body: JSON.stringify({
        sourceId: activeComponent.sourceId,
        variantName: selectedVariant,
      }),
    });

    if (!response.ok) {
      controller.actions.finishLoadingTweaks({
        error: await readResponseText(response),
      });
      return;
    }

    const payload = await response.json() as {
      targetFile?: string | null;
      entries?: Array<{
        id: string;
        kind: "jsx-text" | "string-prop";
        label: string;
        currentValue: string;
      }>;
    };

    controller.actions.finishLoadingTweaks({
      targetFile: payload.targetFile ?? null,
      entries: payload.entries ?? [],
      error: null,
    });
  } catch (error) {
    controller.actions.finishLoadingTweaks({
      error: error instanceof Error ? error.message : "Failed to load deterministic tweaks.",
    });
  }
}

export async function applyDeterministicTweak(
  controller: VariantRuntimeController,
  entryId: string,
): Promise<void> {
  await loadAgentBridgeConfig(controller);
  const snapshot = controller.getSnapshot();
  const activeComponent = getActiveMountedComponent(snapshot);
  const selectedVariant = activeComponent
    ? snapshot.selections[activeComponent.sourceId] ?? activeComponent.selected
    : null;
  const entry = snapshot.tweaks.entries.find((candidate) => candidate.id === entryId);
  if (!activeComponent || !selectedVariant || !entry) {
    controller.actions.finishApplyingTweaks({
      error: "The requested tweak entry is no longer available.",
    });
    return;
  }

  controller.actions.startApplyingTweaks();
  const bridgeState = getAgentBridgeState(controller);

  try {
    const response = await fetch(variantTweakApplyRoutePath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bridgeState.token ? { "X-Variiant-Token": bridgeState.token } : {}),
      },
      body: JSON.stringify({
        sourceId: activeComponent.sourceId,
        variantName: selectedVariant,
        entryId,
        nextValue: entry.draftValue,
      }),
    });

    if (!response.ok) {
      controller.actions.finishApplyingTweaks({
        error: await readResponseText(response),
      });
      return;
    }

    const payload = await response.json() as {
      targetFile?: string | null;
      changedFiles?: string[];
      entries?: Array<{
        id: string;
        kind: "jsx-text" | "string-prop";
        label: string;
        currentValue: string;
      }>;
    };

    controller.actions.finishApplyingTweaks({
      targetFile: payload.targetFile ?? null,
      entries: payload.entries ?? [],
      error: null,
    });
    if (Array.isArray(payload.changedFiles) && payload.changedFiles.length > 0) {
      controller.actions.applyReviewChangedFiles(payload.changedFiles);
      controller.actions.setDockMode("tweak");
    }
  } catch (error) {
    controller.actions.finishApplyingTweaks({
      error: error instanceof Error ? error.message : "Failed to apply the deterministic tweak.",
    });
  }
}

function buildAgentRequestPayload(
  snapshot: VariantRuntimeSnapshot,
  attachments: VariantAgentRequestAttachment[] = [],
): Record<string, unknown> {
  const mountedComponents = snapshot.components
    .filter((component) => component.mountedCount > 0)
    .map((component) =>
      buildAgentRequestTarget(
        component.sourceId,
        component.displayName,
        snapshot.selections[component.sourceId] ?? component.selected,
        component.variantNames,
      ),
    );

  const activeComponent = getActiveMountedComponent(snapshot);
  const activeTarget = activeComponent
    ? buildAgentRequestTarget(
        activeComponent.sourceId,
        activeComponent.displayName,
        snapshot.selections[activeComponent.sourceId] ?? activeComponent.selected,
        activeComponent.variantNames,
      )
    : null;

  return {
    mode: snapshot.dockMode,
    prompt: snapshot.agent.prompt,
    page: {
      title: document.title,
      url: window.location.href,
    },
    activeSourceId: snapshot.activeSourceId,
    activeVariant: activeTarget?.selected ?? null,
    activeComponent: activeTarget,
    mountedComponents,
    comments: snapshot.comments
      .filter((comment) => comment.text.trim().length > 0)
      .map((comment) => ({
        id: comment.id,
        sourceId: comment.sourceId,
        instanceId: comment.instanceId,
        text: comment.text.trim(),
        domOpeningTag: comment.domOpeningTag,
        domTextSnippet: comment.domTextSnippet,
        anchor: comment.anchor,
        viewportPoint: comment.viewportPoint,
        visibilityKey: comment.visibilityKey,
      })),
    attachments: attachments.map((attachment) => ({
      kind: attachment.kind,
      sourceId: attachment.sourceId,
      displayName: attachment.displayName,
      variantName: attachment.variantName,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
      width: attachment.width,
      height: attachment.height,
      scale: attachment.scale,
      dataUrl: attachment.dataUrl,
    })),
  };
}

function buildAgentRequestTarget(
  sourceId: string,
  displayName: string,
  selected: string,
  variantNames: string[],
): VariantAgentRequestTarget {
  const { sourceRelativePath, exportName } = parseSourceId(sourceId);
  const variantDirectory = `.variiant/variants/${sourceRelativePath}/${exportName}`;
  const stabilityRiskReason = getStabilityRiskReason(sourceRelativePath, exportName, displayName);

  return {
    sourceId,
    displayName,
    selected,
    variantNames,
    sourceRelativePath,
    exportName,
    variantDirectory,
    exampleVariantFile: `${variantDirectory}/example.tsx`,
    stabilityRisk: stabilityRiskReason ? "higher" : "normal",
    stabilityRiskReason,
  };
}

function parseSourceId(sourceId: string): {
  sourceRelativePath: string;
  exportName: string;
} {
  const hashIndex = sourceId.indexOf("#");
  if (hashIndex === -1) {
    return {
      sourceRelativePath: sourceId,
      exportName: "default",
    };
  }

  return {
    sourceRelativePath: sourceId.slice(0, hashIndex),
    exportName: sourceId.slice(hashIndex + 1) || "default",
  };
}

function getStabilityRiskReason(
  sourceRelativePath: string,
  exportName: string,
  displayName: string,
): string | null {
  const text = `${sourceRelativePath} ${exportName} ${displayName}`.toLowerCase();
  if (
    text.includes("dialog")
    || text.includes("modal")
    || text.includes("offcanvas")
    || text.includes("drawer")
    || text.includes("sheet")
    || text.includes("panel")
  ) {
    return "This boundary may own broad layout or container state, so swapping it can cause large content shifts, remounts, or UI resets beyond the intended variant change.";
  }

  return null;
}

async function readResponseText(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return "";
  }

  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error ?? text;
  } catch {
    return text;
  }
}

async function consumeAgentResponse(
  response: Response,
  controller: VariantRuntimeController,
): Promise<void> {
  let completed = false;
  let partialDisplayLog:
    | {
      stream: "stdout" | "stderr" | "system";
      text: string;
    }
    | null = null;

  const processDisplayableAgentOutput = (
    stream: "stdout" | "stderr" | "system",
    text: string,
  ): void => {
    const displayEvent = getDisplayableAgentEvent(stream, text);
    if (!displayEvent) {
      return;
    }

    if (displayEvent.partial) {
      const nextText = partialDisplayLog?.stream === stream
        ? `${partialDisplayLog.text}${displayEvent.text}`
        : displayEvent.text;

      if (partialDisplayLog?.stream === stream) {
        controller.actions.replaceLatestAgentLog(stream, nextText);
      } else {
        controller.actions.appendAgentLog(stream, nextText);
      }

      partialDisplayLog = {
        stream,
        text: nextText,
      };
      return;
    }

    partialDisplayLog = null;
    controller.actions.appendAgentLog(stream, displayEvent.text);
  };

  const processLine = (line: string): void => {
    if (!line.trim()) {
      return;
    }

    try {
      const event = JSON.parse(line) as {
        type?: string;
        text?: string;
        sessionId?: string | null;
        sessionPath?: string | null;
        exitCode?: number | null;
        changedFiles?: string[];
        error?: string | null;
      };

      switch (event.type) {
        case "session":
          controller.actions.appendAgentLog(
            "system",
            event.sessionPath
              ? `Session saved to ${event.sessionPath}.`
              : "Started local agent session.",
          );
          break;
        case "stdout":
        case "stderr":
        case "system":
          {
            processDisplayableAgentOutput(event.type, event.text ?? "");
          }
          break;
        case "done":
          controller.actions.finishAgentRun({
            sessionId: event.sessionId ?? null,
            exitCode: event.exitCode ?? null,
            changedFiles: Array.isArray(event.changedFiles) ? event.changedFiles : [],
            error: event.error ?? null,
          });
          completed = true;
          break;
        default:
          controller.actions.appendAgentLog("system", line);
      }
    } catch {
      controller.actions.appendAgentLog("stdout", line);
    }
  };

  if (!response.body) {
    const bodyText = await response.text();
    for (const line of bodyText.split(/\r?\n/)) {
      processLine(line);
    }
  } else {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffered += decoder.decode();
        break;
      }

      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        processLine(line);
      }
    }

    if (buffered.trim()) {
      processLine(buffered);
    }
  }

  if (!completed) {
    controller.actions.finishAgentRun({
      error: "The local agent finished without sending a completion event.",
    });
  }
}

async function captureComponentScreenshot(
  sourceId: string,
  displayName: string,
  variantName: string | null,
): Promise<VariantAgentRequestAttachment | null> {
  const boundary = document.querySelector<HTMLElement>(
    `[data-variiant-source-id="${escapeAttributeValue(sourceId)}"]`,
  );
  if (!boundary) {
    return null;
  }

  const rect = getRenderableComponentRect(boundary);
  if (!rect || rect.width < 1 || rect.height < 1) {
    return null;
  }

  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));
  const captureCanvas = await toCanvas(document.body, {
    backgroundColor: "#ffffff",
    cacheBust: true,
    pixelRatio: 1,
    width: getDocumentCaptureWidth(),
    height: getDocumentCaptureHeight(),
    canvasWidth: getDocumentCaptureWidth(),
    canvasHeight: getDocumentCaptureHeight(),
    skipAutoScale: true,
    filter: (node) => !(node instanceof HTMLElement && node.dataset.variantOverlayRoot === "true"),
  });

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = width;
  cropCanvas.height = height;
  const cropContext = cropCanvas.getContext("2d");
  if (!cropContext) {
    throw new Error("Canvas 2D context unavailable.");
  }

  cropContext.fillStyle = "#ffffff";
  cropContext.fillRect(0, 0, width, height);
  cropContext.drawImage(
    captureCanvas,
    Math.max(0, Math.floor(rect.left + window.scrollX)),
    Math.max(0, Math.floor(rect.top + window.scrollY)),
    width,
    height,
    0,
    0,
    width,
    height,
  );
  const dataUrl = cropCanvas.toDataURL("image/jpeg", 0.82);

  return {
    kind: "component-screenshot",
    sourceId,
    displayName,
    variantName,
    mimeType: "image/jpeg",
    fileName: `${slugify(displayName || sourceId)}.jpg`,
    width,
    height,
    scale: 1,
    dataUrl,
  };
}

function getDocumentCaptureWidth(): number {
  return Math.max(
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
    document.body.scrollWidth,
    document.body.clientWidth,
  );
}

function getDocumentCaptureHeight(): number {
  return Math.max(
    document.documentElement.scrollHeight,
    document.documentElement.clientHeight,
    document.body.scrollHeight,
    document.body.clientHeight,
  );
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "component-screenshot";
}
