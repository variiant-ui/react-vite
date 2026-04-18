import { toCanvas } from "html-to-image";
import type {
  Shortcut,
  VariantRuntimeController,
  VariantRuntimeSnapshot,
} from "./runtime-core";
import { getRepresentativeMountedInstance } from "./runtime-core";
import {
  clearVariantToolSketch,
  renderVariantToolLayer,
} from "./runtime-dom-tools";
import {
  escapeAttributeValue,
  escapeHtml,
  formatCanvasGroupLabel,
  getRenderableComponentRect,
} from "./runtime-dom-shared";

const installedKeyboardControllers = new WeakSet<VariantRuntimeController>();
const installedOverlayControllers = new WeakSet<VariantRuntimeController>();
const overlayStyleTagId = "variiant-overlay-styles";
const variantCanvasZIndex = 2147483646;
const variantOverlayZIndex = 2147483647;
const variantOverlayPopoverSelector = '[data-variant-overlay-popover="true"]';
const variantTweakCatalogRoutePath = "/__variiant/tweak/catalog";
const variantTweakApplyRoutePath = "/__variiant/tweak/apply";
const agentBridgeStates = new WeakMap<VariantRuntimeController, {
  loaded: boolean;
  loadingPromise: Promise<void> | null;
  token: string | null;
}>();
const canvasDomStates = new WeakMap<VariantRuntimeController, VariantCanvasDomState>();

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

type VariantCanvasDomState = {
  root: HTMLDivElement;
  viewport: HTMLDivElement;
  stage: HTMLDivElement;
  content: HTMLDivElement;
  title: HTMLDivElement;
  sourceSelect: HTMLSelectElement;
  resetButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  lastContentKey: string | null;
  drag: {
    active: boolean;
    pointerId: number | null;
    lastX: number;
    lastY: number;
  };
};

type PopoverCapableElement = HTMLDivElement & {
  hidePopover: () => void;
  showPopover: () => void;
};

function normalizeKey(key: string): string {
  const normalized = key.toLowerCase();
  if (normalized === "esc") {
    return "escape";
  }

  return normalized;
}

function parseShortcut(shortcut: string): {
  key: string;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
} {
  const tokens = shortcut.split("+").map((token) => token.trim().toLowerCase()).filter(Boolean);
  const key = tokens[tokens.length - 1] ?? "";
  const modifiers = new Set(tokens.slice(0, -1));

  return {
    key: normalizeKey(key),
    alt: modifiers.has("alt") || modifiers.has("option"),
    ctrl: modifiers.has("ctrl") || modifiers.has("control"),
    meta: modifiers.has("meta") || modifiers.has("cmd") || modifiers.has("command"),
    shift: modifiers.has("shift"),
  };
}

function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean {
  const shortcuts = Array.isArray(shortcut) ? shortcut : [shortcut];
  return shortcuts.some((candidate) => {
    const parsed = parseShortcut(candidate);
    return (
      normalizeKey(event.key) === parsed.key &&
      event.altKey === parsed.alt &&
      event.ctrlKey === parsed.ctrl &&
      event.metaKey === parsed.meta &&
      event.shiftKey === parsed.shift
    );
  });
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

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

function ensureOverlayStyles(): void {
  if (typeof document === "undefined" || document.getElementById(overlayStyleTagId)) {
    return;
  }

  const style = document.createElement("style");
  style.id = overlayStyleTagId;
  style.textContent = `
@keyframes variiant-agent-gradient {
  0% {
    background-position: 0% 50%;
  }

  100% {
    background-position: 200% 50%;
  }
}

@keyframes variiant-agent-spin {
  to {
    transform: rotate(360deg);
  }
}

${variantOverlayPopoverSelector} {
  padding: 0;
  border: 0;
  margin: 0;
  background: transparent;
  overflow: visible;
  width: auto;
  max-width: none;
  max-height: none;
}

${variantOverlayPopoverSelector}::backdrop {
  background: transparent;
}`;
  document.head.appendChild(style);
}

async function loadAgentBridgeConfig(controller: VariantRuntimeController): Promise<void> {
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

export function installVariantKeyboardBindings(controller: VariantRuntimeController): void {
  if (installedKeyboardControllers.has(controller) || typeof window === "undefined") {
    return;
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) {
      return;
    }

    const { shortcutConfig, surface } = controller.getSnapshot();
    if (matchesShortcut(event, shortcutConfig.toggleOverlay)) {
      event.preventDefault();
      controller.actions.toggleOverlay();
      return;
    }

    if (matchesShortcut(event, shortcutConfig.toggleCanvas)) {
      event.preventDefault();
      controller.actions.toggleCanvas();
      return;
    }

    if (matchesShortcut(event, shortcutConfig.closeOverlay)) {
      if (surface !== "closed") {
        event.preventDefault();
        controller.actions.closeSurface();
      }
      return;
    }

    if (matchesShortcut(event, shortcutConfig.nextComponent)) {
      event.preventDefault();
      controller.actions.nextComponent();
      return;
    }

    if (matchesShortcut(event, shortcutConfig.previousComponent)) {
      event.preventDefault();
      controller.actions.previousComponent();
      return;
    }

    if (matchesShortcut(event, shortcutConfig.nextVariant)) {
      event.preventDefault();
      controller.actions.nextVariant();
      return;
    }

    if (matchesShortcut(event, shortcutConfig.previousVariant)) {
      event.preventDefault();
      controller.actions.previousVariant();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  installedKeyboardControllers.add(controller);
}

export function installVariantOverlayUi(controller: VariantRuntimeController): void {
  if (installedOverlayControllers.has(controller) || typeof document === "undefined") {
    return;
  }

  ensureOverlayStyles();
  const container = document.createElement("div");
  container.setAttribute("data-variant-overlay-root", "true");
  const overlayPopoverHost = document.createElement("div");
  overlayPopoverHost.setAttribute("data-variant-overlay-popover", "true");
  overlayPopoverHost.setAttribute("popover", "manual");
  const overlayContainer = document.createElement("div");
  const canvasContainer = document.createElement("div");
  const toolLayerContainer = document.createElement("div");
  overlayPopoverHost.appendChild(overlayContainer);
  container.appendChild(overlayPopoverHost);
  container.appendChild(canvasContainer);
  container.appendChild(toolLayerContainer);
  document.body.appendChild(container);

  const render = (): void => {
    const snapshot = controller.getSnapshot();
    syncOverlayMountParent(container, snapshot);
    renderOverlay(overlayContainer, snapshot, controller);
    syncOverlayPopover(overlayPopoverHost, snapshot);
    renderCanvas(canvasContainer, snapshot, controller);
    renderVariantToolLayer(toolLayerContainer, snapshot, controller, variantOverlayZIndex - 1);
  };

  controller.subscribe(render);
  installedOverlayControllers.add(controller);
  installOverlayPromotionObserver(controller, overlayPopoverHost);
  void loadAgentBridgeConfig(controller);
  render();
}

function installOverlayPromotionObserver(
  controller: VariantRuntimeController,
  overlayPopoverHost: HTMLDivElement,
): void {
  if (typeof MutationObserver === "undefined" || !supportsPopover(overlayPopoverHost)) {
    return;
  }

  const observer = new MutationObserver((mutations) => {
    const snapshot = controller.getSnapshot();
    syncOverlayMountParent(overlayPopoverHost.parentElement as HTMLDivElement, snapshot);
    if (snapshot.surface !== "overlay" || !isPopoverOpen(overlayPopoverHost)) {
      return;
    }

    if (!mutations.some((mutation) => mutationTouchesCompetingTopLayerSurface(mutation, overlayPopoverHost))) {
      return;
    }

    promoteOverlayPopover(overlayPopoverHost);
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["open", "popover"],
    childList: true,
    subtree: true,
  });
}

function syncOverlayMountParent(
  container: HTMLDivElement,
  snapshot: VariantRuntimeSnapshot,
): void {
  const nextParent = getPreferredOverlayMountParent(container, snapshot);
  if (!nextParent || container.parentElement === nextParent) {
    return;
  }

  nextParent.appendChild(container);
}

function getPreferredOverlayMountParent(
  container: HTMLDivElement,
  snapshot: VariantRuntimeSnapshot,
): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  if (snapshot.surface !== "overlay") {
    return document.body;
  }

  const openDialogs = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")];
  for (let index = openDialogs.length - 1; index >= 0; index -= 1) {
    const dialog = openDialogs[index];
    if (dialog !== container && !container.contains(dialog)) {
      return dialog;
    }
  }

  return document.body;
}

function mutationTouchesCompetingTopLayerSurface(
  mutation: MutationRecord,
  overlayPopoverHost: HTMLDivElement,
): boolean {
  if (mutation.type === "attributes") {
    return isCompetingTopLayerSurface(mutation.target, overlayPopoverHost);
  }

  return [...mutation.addedNodes].some((node) => isCompetingTopLayerSurface(node, overlayPopoverHost));
}

function isCompetingTopLayerSurface(
  node: Node | null,
  overlayPopoverHost: HTMLDivElement,
): boolean {
  if (!(node instanceof Element) || node === overlayPopoverHost || overlayPopoverHost.contains(node)) {
    return false;
  }

  if (node.matches("dialog[open], [popover]")) {
    return true;
  }

  return Boolean(node.querySelector("dialog[open], [popover]"));
}

function syncOverlayPopover(
  overlayPopoverHost: HTMLDivElement,
  snapshot: VariantRuntimeSnapshot,
): void {
  if (!supportsPopover(overlayPopoverHost)) {
    return;
  }

  if (snapshot.surface !== "overlay") {
    hideOverlayPopover(overlayPopoverHost);
    return;
  }

  if (!isPopoverOpen(overlayPopoverHost)) {
    showOverlayPopover(overlayPopoverHost);
  }
}

function supportsPopover(element: HTMLDivElement): boolean {
  return typeof (element as PopoverCapableElement).showPopover === "function";
}

function isPopoverOpen(element: HTMLDivElement): boolean {
  return element.matches(":popover-open");
}

function showOverlayPopover(element: HTMLDivElement): void {
  if (!supportsPopover(element) || isPopoverOpen(element)) {
    return;
  }

  (element as PopoverCapableElement).showPopover();
}

function hideOverlayPopover(element: HTMLDivElement): void {
  if (!supportsPopover(element) || !isPopoverOpen(element)) {
    return;
  }

  (element as PopoverCapableElement).hidePopover();
}

function promoteOverlayPopover(element: HTMLDivElement): void {
  if (!supportsPopover(element)) {
    return;
  }

  if (isPopoverOpen(element)) {
    hideOverlayPopover(element);
  }

  showOverlayPopover(element);
}

async function submitAgentPrompt(controller: VariantRuntimeController): Promise<void> {
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

async function loadDeterministicTweaks(controller: VariantRuntimeController): Promise<void> {
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

async function applyDeterministicTweak(
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

function getDisplayableAgentEvent(
  stream: "stdout" | "stderr" | "system",
  text: string,
): { text: string; partial: boolean } | null {
  const normalized = normalizeAgentMessageText(text);
  if (!normalized) {
    return null;
  }

  const parsed = tryParseJsonLine(normalized);
  if (!parsed) {
    return { text, partial: false };
  }

  const partialText = extractPartialHumanMessageFromAgentJson(parsed);
  if (partialText) {
    return {
      text: partialText,
      partial: true,
    };
  }

  const extracted = extractHumanMessageFromAgentJson(parsed);
  if (extracted) {
    return {
      text: extracted,
      partial: false,
    };
  }

  return stream === "stderr"
    ? {
      text,
      partial: false,
    }
    : null;
}

function tryParseJsonLine(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function extractHumanMessageFromAgentJson(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const eventType = typeof value.type === "string" ? value.type : null;
  if (eventType) {
    if (eventType.startsWith("turn.")) {
      return null;
    }

    if (eventType === "item.completed" || eventType === "item.updated" || eventType === "item.started") {
      return extractHumanMessageFromAgentItem(value.item);
    }
  }

  return extractHumanMessageFromAgentItem(value);
}

function extractPartialHumanMessageFromAgentJson(value: unknown): string | null {
  if (!isRecord(value) || value.type !== "stream_event" || !isRecord(value.event)) {
    return null;
  }

  const delta = isRecord(value.event.delta) ? value.event.delta : null;
  if (!delta || delta.type !== "text_delta" || typeof delta.text !== "string") {
    return null;
  }

  return delta.text;
}

function extractHumanMessageFromAgentItem(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const channel = typeof value.channel === "string" ? value.channel : null;
  if (channel && channel !== "commentary" && channel !== "final") {
    return null;
  }

  const itemType = typeof value.type === "string" ? value.type : null;
  if (itemType && isFilteredAgentItemType(itemType)) {
    return null;
  }

  if (typeof value.text === "string") {
    return normalizeAgentMessageText(value.text);
  }

  if (typeof value.message === "string") {
    return normalizeAgentMessageText(value.message);
  }

  const role = typeof value.role === "string" ? value.role : null;
  if (role && role !== "assistant") {
    return null;
  }

  const contentText = extractHumanMessageFromContent(value.content);
  if (contentText) {
    return contentText;
  }

  if (Array.isArray(value.messages)) {
    for (const message of value.messages) {
      const extracted = extractHumanMessageFromAgentItem(message);
      if (extracted) {
        return extracted;
      }
    }
  }

  return null;
}

function extractHumanMessageFromContent(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeAgentMessageText(value);
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const textParts: string[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const channel = typeof entry.channel === "string" ? entry.channel : null;
    if (channel && channel !== "commentary" && channel !== "final") {
      continue;
    }

    const entryType = typeof entry.type === "string" ? entry.type : null;
    if (entryType && isFilteredAgentItemType(entryType)) {
      continue;
    }

    if (typeof entry.text === "string") {
      const text = normalizeAgentMessageText(entry.text);
      if (text) {
        textParts.push(text);
      }
      continue;
    }

    if (typeof entry.message === "string") {
      const text = normalizeAgentMessageText(entry.message);
      if (text) {
        textParts.push(text);
      }
    }
  }

  return textParts.length > 0 ? textParts.join(" ") : null;
}

function isFilteredAgentItemType(type: string): boolean {
  return [
    "command_execution",
    "function_call",
    "function_call_output",
    "tool_call",
    "tool_result",
    "mcp_call",
    "mcp_tool_call",
    "reasoning",
    "reasoning_summary",
    "web_search",
    "file_search",
  ].includes(type);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getActiveMountedComponent(snapshot: VariantRuntimeSnapshot) {
  const mounted = snapshot.components.filter((component) => component.mountedCount > 0);
  return mounted.find((component) => component.sourceId === snapshot.activeSourceId) ?? mounted[0] ?? null;
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

export function getVariantCanvasComponentSlot(
  sourceId: string,
  variantName: string,
): HTMLDivElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  return document.querySelector<HTMLDivElement>(
    `[data-variant-canvas-slot-source="${escapeAttributeValue(sourceId)}"][data-variant-canvas-slot-variant="${escapeAttributeValue(variantName)}"]`,
  );
}

function renderCanvas(
  container: HTMLDivElement,
  snapshot: VariantRuntimeSnapshot,
  controller: VariantRuntimeController,
): void {
  if (snapshot.surface !== "canvas") {
    container.innerHTML = "";
    canvasDomStates.delete(controller);
    return;
  }

  const dom = getOrCreateCanvasDomState(container, controller);
  const mounted = snapshot.components.filter((component) => component.mountedCount > 0);
  const targetSourceId = snapshot.canvas.targetSourceId ?? snapshot.activeSourceId ?? mounted[0]?.sourceId ?? "";

  dom.root.style.display = "flex";
  dom.root.setAttribute("data-variiant-canvas-fullscreen", "true");
  dom.root.style.setProperty("--variiant-canvas-zoom", String(snapshot.canvas.camera.zoom));
  dom.root.style.backgroundPosition = `${snapshot.canvas.camera.x}px ${snapshot.canvas.camera.y}px`;
  dom.root.style.backgroundSize = `${Math.max(8, Math.round(24 * snapshot.canvas.camera.zoom))}px ${Math.max(8, Math.round(24 * snapshot.canvas.camera.zoom))}px`;
  dom.title.textContent = "Review Stack";

  dom.sourceSelect.innerHTML = mounted.length > 0
    ? mounted.map((component) => {
        const selected = component.sourceId === targetSourceId ? " selected" : "";
        return `<option value="${escapeHtml(component.sourceId)}"${selected}>${escapeHtml(component.displayName)}</option>`;
      }).join("")
    : '<option value="">No mounted components</option>';
  dom.sourceSelect.disabled = mounted.length === 0;

  dom.stage.style.transform = `translate(${snapshot.canvas.camera.x}px, ${snapshot.canvas.camera.y}px) scale(${snapshot.canvas.camera.zoom})`;

  const contentKey = buildComponentsContentKey(snapshot, mounted);
  const contentChanged = dom.lastContentKey !== contentKey;

  if (contentChanged) {
    dom.content.innerHTML = buildComponentsCanvasMarkup(snapshot, mounted);
    dom.lastContentKey = contentKey;
  }
}

function getOrCreateCanvasDomState(
  container: HTMLDivElement,
  controller: VariantRuntimeController,
): VariantCanvasDomState {
  const existing = canvasDomStates.get(controller);
  if (existing) {
    return existing;
  }

  const root = document.createElement("div");
  root.style.cssText = canvasRootStyle();

  const chrome = document.createElement("div");
  chrome.setAttribute("data-variant-canvas-chrome", "true");
  chrome.style.cssText = canvasChromeStyle();

  const title = document.createElement("div");
  title.style.cssText = canvasTitleStyle();

  const actions = document.createElement("div");
  actions.style.cssText = canvasActionsStyle();

  const sourceSelect = document.createElement("select");
  sourceSelect.style.cssText = canvasSelectStyle();
  sourceSelect.setAttribute("data-variant-canvas-source-select", "true");

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.textContent = "Reset View";
  resetButton.style.cssText = canvasSecondaryButtonStyle();

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.style.cssText = canvasPrimaryButtonStyle();

  actions.appendChild(sourceSelect);
  actions.appendChild(resetButton);
  actions.appendChild(closeButton);

  chrome.appendChild(title);
  chrome.appendChild(actions);

  const viewport = document.createElement("div");
  viewport.style.cssText = canvasViewportStyle();
  viewport.setAttribute("data-variant-canvas-viewport", "true");

  const stage = document.createElement("div");
  stage.style.cssText = canvasStageStyle();

  const content = document.createElement("div");
  content.style.cssText = canvasContentStyle();
  content.setAttribute("data-variant-canvas-content", "true");

  stage.appendChild(content);
  viewport.appendChild(stage);
  root.appendChild(chrome);
  root.appendChild(viewport);
  container.appendChild(root);

  const dom: VariantCanvasDomState = {
    root,
    viewport,
    stage,
    content,
    title,
    sourceSelect,
    resetButton,
    closeButton,
    lastContentKey: null,
    drag: {
      active: false,
      pointerId: null,
      lastX: 0,
      lastY: 0,
    },
  };

  sourceSelect.addEventListener("change", (event) => {
    const target = event.currentTarget as HTMLSelectElement;
    controller.actions.setCanvasTarget(target.value || null);
  });
  resetButton.addEventListener("click", () => {
    controller.actions.resetCanvasCamera();
  });
  closeButton.addEventListener("click", () => {
    controller.actions.closeCanvas();
  });

  viewport.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest('[data-variant-canvas-chrome="true"]')) {
      return;
    }

    event.preventDefault();
    dom.drag.active = true;
    dom.drag.pointerId = event.pointerId;
    dom.drag.lastX = event.clientX;
    dom.drag.lastY = event.clientY;
    viewport.style.cursor = "grabbing";
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!dom.drag.active || dom.drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dom.drag.lastX;
    const deltaY = event.clientY - dom.drag.lastY;
    dom.drag.lastX = event.clientX;
    dom.drag.lastY = event.clientY;
    controller.actions.panCanvas(deltaX, deltaY);
  });

  const endDrag = (event: PointerEvent): void => {
    if (!dom.drag.active || dom.drag.pointerId !== event.pointerId) {
      return;
    }

    dom.drag.active = false;
    dom.drag.pointerId = null;
    viewport.style.cursor = "grab";
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
  };

  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  viewport.addEventListener("selectstart", (event) => {
    event.preventDefault();
  });
  viewport.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const viewportRect = viewport.getBoundingClientRect();
    const currentZoom = controller.getSnapshot().canvas.camera.zoom;
    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    const nextZoom = clamp(currentZoom * zoomFactor, 0.25, 2.5);
    if (nextZoom === currentZoom) {
      return;
    }

    const currentCamera = controller.getSnapshot().canvas.camera;
    const localX = event.clientX - viewportRect.left;
    const localY = event.clientY - viewportRect.top;
    const worldX = (localX - currentCamera.x) / currentZoom;
    const worldY = (localY - currentCamera.y) / currentZoom;

    controller.actions.setCanvasCamera({
      ...currentCamera,
      x: localX - worldX * nextZoom,
      y: localY - worldY * nextZoom,
      zoom: nextZoom,
    });
  }, { passive: false });

  canvasDomStates.set(controller, dom);
  return dom;
}

function buildComponentsContentKey(
  snapshot: VariantRuntimeSnapshot,
  mounted: VariantRuntimeSnapshot["components"],
): string {
  return JSON.stringify({
    mode: snapshot.canvas.mode,
    mounted: mounted.map((component) => {
      const representative = getRepresentativeMountedInstance(snapshot, component.sourceId);
      return {
        sourceId: component.sourceId,
        variantNames: component.variantNames,
        mountedCount: component.mountedCount,
        activeVariant: snapshot.effectiveSelections[component.sourceId] ?? component.selected,
        width: representative?.width ?? null,
        preferredWidth: representative?.preferredWidth ?? null,
        height: representative?.height ?? null,
      };
    }),
  });
}

function buildComponentsCanvasMarkup(
  snapshot: VariantRuntimeSnapshot,
  mounted: VariantRuntimeSnapshot["components"],
): string {
  if (mounted.length === 0) {
    return `<div style="${canvasEmptyStateStyle()}">Open the canvas on a page with mounted variant boundaries to compare them here.</div>`;
  }

  return `<div style="${canvasGroupsRowStyle()}">${mounted.map((component) => {
    const representative = getRepresentativeMountedInstance(snapshot, component.sourceId);
    const width = getCanvasGroupWidth(representative);
    const slotHeight = clamp(representative?.height ?? 180, 120, 520);
    return `
      <section data-variant-canvas-group-source="${escapeHtml(component.sourceId)}" style="${canvasGroupStyle(width)}">
        <div style="${canvasGroupLabelStyle()}">${escapeHtml(formatCanvasGroupLabel(component.sourceId))}</div>
        <div style="${canvasVariantStackStyle()}">
          ${component.variantNames.map((variantName) => `
            <article style="${canvasVariantTileStyle()}">
              <div style="${canvasVariantTileHeaderStyle()}">
                <span>${escapeHtml(variantName)}</span>
              </div>
              <div
                data-variant-canvas-slot-source="${escapeHtml(component.sourceId)}"
                data-variant-canvas-slot-variant="${escapeHtml(variantName)}"
                style="${canvasVariantSlotStyle(slotHeight)}"
              ></div>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }).join("")}</div>`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getCanvasGroupWidth(
  representative: ReturnType<typeof getRepresentativeMountedInstance>,
): number {
  const preferredWidth = representative?.preferredWidth ?? representative?.width ?? 360;
  return clamp(preferredWidth, 280, 1600);
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "component-screenshot";
}

function renderOverlay(
  container: HTMLDivElement,
  snapshot: VariantRuntimeSnapshot,
  controller: VariantRuntimeController,
): void {
  if (snapshot.surface !== "overlay") {
    container.innerHTML = "";
    return;
  }

  const preservedFocus = capturePreservedOverlayFocus(container);

  const mounted = snapshot.components.filter((component) => component.mountedCount > 0);
  const active = getActiveMountedComponent(snapshot);
  const activeSelection = active ? snapshot.selections[active.sourceId] ?? active.selected : null;
  const componentOptions = mounted
    .map((component) => {
      const selected = component.sourceId === active?.sourceId;
      return `<option value="${escapeHtml(component.sourceId)}"${selected ? " selected" : ""}>${escapeHtml(
        component.displayName,
      )}</option>`;
    })
    .join("");

  const variantOptions = active
    ? active.variantNames
        .map((variantName) => {
          const selected = activeSelection === variantName;
          return `<option value="${escapeHtml(variantName)}"${selected ? " selected" : ""}>${escapeHtml(
            variantName,
          )}</option>`;
        })
        .join("")
    : "";

  const availabilityMessage = snapshot.agent.availability.enabled
    ? snapshot.agent.availability.commandLabel
      ? `Agent: ${snapshot.agent.availability.commandLabel}`
      : "Local agent bridge ready."
    : snapshot.agent.availability.message ?? "Local agent bridge unavailable.";
  const imageSupportMessage = snapshot.agent.availability.supportsImages
    ? null
    : "Configure agent.image.cliFlag in variiant.config.json to attach screenshots.";
  const screenshotOptionMarkup = active
    ? `
    <label style="${checkboxRowStyle(!snapshot.agent.availability.supportsImages)}">
      <input
        data-variant-agent-attach-screenshot="true"
        type="checkbox"
        ${snapshot.agent.attachActiveComponentScreenshot ? "checked" : ""}
        ${!snapshot.agent.availability.supportsImages ? "disabled" : ""}
      />
      <span>Attach ${escapeHtml(active.displayName)} screenshot</span>
    </label>
    ${imageSupportMessage ? `<div style="${hintTextStyle()}">${escapeHtml(imageSupportMessage)}</div>` : ""}`
    : "";

  const statusText = renderStatusText(snapshot);
  const latestAgentMessage = getLatestAgentMessage(snapshot);
  const errorSummary =
    snapshot.agent.status === "error"
      ? normalizeAgentMessageText(snapshot.agent.error ?? "") || latestAgentMessage
      : null;
  const changedFilesMarkup = snapshot.agent.changedFiles.length > 0
    ? `<div style="${metaTextStyle()}">Changed files: ${escapeHtml(snapshot.agent.changedFiles.slice(0, 4).join(", "))}${snapshot.agent.changedFiles.length > 4 ? "..." : ""}</div>`
    : "";
  const runningProgressMarkup = snapshot.agent.status === "running"
    ? `
    <div data-variant-agent-progress="true" style="${progressStripStyle()}">
      <div data-variant-agent-progress-text="true" style="${progressTextStyle()}">${escapeHtml(latestAgentMessage)}</div>
      <div aria-hidden="true" style="${spinnerStyle()}"></div>
    </div>`
    : "";
  const errorSummaryMarkup = errorSummary
    ? `<div data-variant-agent-error="true" style="${errorNoteStyle()}">${escapeHtml(errorSummary)}</div>`
    : "";
  const toolSummary = snapshot.toolMode === "none"
    ? "No tool active."
    : snapshot.toolMode === "inspect"
      ? "Inspect mode is active. Hover the live page to inspect exact component boundaries."
      : snapshot.toolMode === "comment"
        ? "Comment mode is active. Click the live page to pin contextual comments to visible component instances."
        : snapshot.toolMode === "sketch"
          ? "Sketch mode is active. Draw directly on top of the page; the red overlay will be attached to the next run."
          : "Tweak mode is active. Load deterministic copy targets from the active variant file and apply narrow edits locally.";
  const tweakLoadDisabled = !active || activeSelection === "source";
  const tweakEntriesMarkup = snapshot.tweaks.entries.length > 0
    ? `<div style="${stackStyle()}">${snapshot.tweaks.entries.map((entry) => `
      <div style="${reviewCardStyle()}">
        <div style="${reviewResultTitleStyle()}">${escapeHtml(entry.label)}</div>
        <div style="${hintTextStyle()}">Current: ${escapeHtml(entry.currentValue)}</div>
        <input
          data-variant-tweak-input="${escapeHtml(entry.id)}"
          value="${escapeHtml(entry.draftValue)}"
          style="${textInputStyle()}"
        />
        <div style="${buttonRowStyle()}">
          <button
            data-variant-tweak-apply="${escapeHtml(entry.id)}"
            style="${buttonStyle(snapshot.tweaks.status === "applying" ? "disabled" : "secondary")}"
            ${snapshot.tweaks.status === "applying" ? "disabled" : ""}
          >Apply</button>
        </div>
      </div>
    `).join("")}</div>`
    : `<div style="${hintTextStyle()}">Load copy targets from the active variant to make small deterministic text edits without another agent run.</div>`;
  const attachmentChipsMarkup = [
    snapshot.comments.length > 0
      ? `<div style="${attachmentChipStyle()}">${escapeHtml(`${snapshot.comments.length} comment${snapshot.comments.length === 1 ? "" : "s"}`)}</div>`
      : "",
    snapshot.sketch.status === "ready"
      ? `<div style="${attachmentChipStyle()}">Sketch attached</div>`
      : "",
  ].filter(Boolean).join("");
  const reviewResultsMarkup = snapshot.reviewResults.length > 0
    ? `<div style="${stackStyle()}">${snapshot.reviewResults.map((result) => `
      <div data-variant-review-result="${escapeHtml(result.sourceId)}" style="${reviewCardStyle()}">
        <div style="${reviewResultTitleStyle()}">${escapeHtml(formatCanvasGroupLabel(result.sourceId))}</div>
        <div style="${metaTextStyle()}">Variants: ${escapeHtml(result.variantNames.join(", "))}</div>
        <div style="${hintTextStyle()}">${escapeHtml(result.changedFiles.slice(0, 2).join(", "))}${result.changedFiles.length > 2 ? "..." : ""}</div>
      </div>
    `).join("")}</div>`
    : `<div style="${hintTextStyle()}">No generated results yet. Run the agent from Ideate mode to populate review targets.</div>`;

  container.innerHTML = `
<div style="${hudShellStyle()}">
  <div style="${panelStyle()}">
    <div style="${metaRowStyle()}">
      <div style="${segmentedRowStyle()}">
        ${(["ideate", "review", "tweak"] as const).map((mode) => `
          <button
            data-variant-dock-mode="${mode}"
            style="${segmentedButtonStyle(snapshot.dockMode === mode)}"
          >${escapeHtml(mode.charAt(0).toUpperCase() + mode.slice(1))}</button>
        `).join("")}
      </div>
      <div data-variant-agent-status="true" style="${statusPillStyle(snapshot.agent.status)}">${escapeHtml(statusText)}</div>
    </div>
    <div style="${rowStyle()}">
      <select data-variant-active-source="true" style="${selectStyle()}" ${mounted.length === 0 ? "disabled" : ""}>
        ${componentOptions || `<option value="">No mounted components</option>`}
      </select>
      <select data-variant-active-choice="true" style="${selectStyle()}" ${!active ? "disabled" : ""}>
        ${variantOptions || `<option value="">No variants</option>`}
      </select>
    </div>
    <div style="${metaRowStyle()}">
      <div style="${metaTextStyle()}">${escapeHtml(availabilityMessage)}</div>
      <button
        data-variant-open-canvas="true"
        style="${buttonStyle("secondary")}"
      >Open Review Stack</button>
    </div>
    <div style="${rowStyle()}">
      ${(["inspect", "comment", "sketch", "tweak"] as const).map((mode) => `
        <button
          data-variant-tool-mode="${mode}"
          style="${toolButtonStyle(snapshot.toolMode === mode)}"
        >${escapeHtml(mode.charAt(0).toUpperCase() + mode.slice(1))}</button>
      `).join("")}
      <button
        data-variant-tool-mode="none"
        style="${toolButtonStyle(snapshot.toolMode === "none")}"
      >Clear Tool</button>
    </div>
    <div style="${hintTextStyle()}">${escapeHtml(toolSummary)}</div>
    ${attachmentChipsMarkup ? `<div style="${attachmentRowStyle()}">${attachmentChipsMarkup}</div>` : ""}
    ${snapshot.toolMode === "comment" || snapshot.toolMode === "sketch" ? `
    <div style="${buttonRowStyle()}">
      ${snapshot.toolMode === "comment" ? `
      <button
        data-variant-comments-clear="true"
        style="${buttonStyle(snapshot.comments.length > 0 ? "secondary" : "disabled")}"
        ${snapshot.comments.length > 0 ? "" : "disabled"}
      >Clear Comments</button>` : ""}
      ${snapshot.toolMode === "sketch" ? `
      <button
        data-variant-sketch-clear="true"
        style="${buttonStyle(snapshot.sketch.status === "ready" ? "secondary" : "disabled")}"
        ${snapshot.sketch.status === "ready" ? "" : "disabled"}
      >Clear Sketch</button>` : ""}
    </div>` : ""}
    ${runningProgressMarkup}
    ${snapshot.agent.status === "running" || snapshot.dockMode !== "ideate" ? "" : `
    <textarea
      data-variant-agent-prompt="true"
      style="${textareaStyle()}"
      placeholder="Describe the next variant direction for the active component..."
    >${escapeHtml(snapshot.agent.prompt)}</textarea>
    ${screenshotOptionMarkup}
    <div style="${buttonRowStyle()}">
      <button
        data-variant-agent-run="true"
        style="${buttonStyle("primary")}"
        ${!snapshot.agent.availability.enabled || !snapshot.agent.prompt.trim() ? "disabled" : ""}
      >Ask Agent</button>
      <button
        data-variant-agent-clear="true"
        style="${buttonStyle(snapshot.agent.status === "idle" ? "disabled" : "secondary")}"
        ${snapshot.agent.status === "idle" ? "disabled" : ""}
      >Clear</button>
    </div>`}
    ${snapshot.dockMode === "review" ? `
    <div style="${sectionCardStyle()}">
      <div style="${sectionLabelStyle()}">Review Results</div>
      ${reviewResultsMarkup}
    </div>` : ""}
    ${snapshot.dockMode === "tweak" ? `
    <div style="${sectionCardStyle()}">
      <div style="${sectionLabelStyle()}">Deterministic Tweaks</div>
      <div style="${hintTextStyle()}">${escapeHtml(snapshot.tweaks.targetFile ?? "Select a generated variant to inspect deterministic copy tweaks.")}</div>
      <div style="${buttonRowStyle()}">
        <button
          data-variant-tweaks-load="true"
          style="${buttonStyle(snapshot.tweaks.status === "loading" || tweakLoadDisabled ? "disabled" : "secondary")}"
          ${snapshot.tweaks.status === "loading" || tweakLoadDisabled ? "disabled" : ""}
        >${snapshot.tweaks.status === "loading" ? "Loading..." : "Load Copy Tweaks"}</button>
      </div>
      ${snapshot.tweaks.error ? `<div style="${errorNoteStyle()}">${escapeHtml(snapshot.tweaks.error)}</div>` : ""}
      ${tweakEntriesMarkup}
    </div>` : ""}
    ${errorSummaryMarkup}
    ${changedFilesMarkup}
  </div>
</div>`;

  restorePreservedOverlayFocus(container, preservedFocus);

  container
    .querySelector<HTMLSelectElement>('[data-variant-active-source="true"]')
    ?.addEventListener("change", (event) => {
      const target = event.currentTarget as HTMLSelectElement;
      controller.actions.selectComponent(target.value || null);
    });

  container
    .querySelector<HTMLSelectElement>('[data-variant-active-choice="true"]')
    ?.addEventListener("change", (event) => {
      const target = event.currentTarget as HTMLSelectElement;
      if (!active || !target.value) {
        return;
      }

      controller.actions.selectVariant(active.sourceId, target.value);
    });

  container
    .querySelectorAll<HTMLButtonElement>('[data-variant-dock-mode]')
    .forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.variantDockMode as typeof snapshot.dockMode | undefined;
        if (!mode) {
          return;
        }
        controller.actions.setDockMode(mode);
      });
    });

  container
    .querySelectorAll<HTMLButtonElement>('[data-variant-tool-mode]')
    .forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.variantToolMode as typeof snapshot.toolMode | undefined;
        if (!mode) {
          return;
        }
        controller.actions.setToolMode(mode);
      });
    });

  container
    .querySelector<HTMLTextAreaElement>('[data-variant-agent-prompt="true"]')
    ?.addEventListener("input", (event) => {
      const target = event.currentTarget as HTMLTextAreaElement;
      controller.actions.setAgentPrompt(target.value);
    });

  container
    .querySelector<HTMLTextAreaElement>('[data-variant-agent-prompt="true"]')
    ?.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void submitAgentPrompt(controller);
      }
    });

  container
    .querySelector<HTMLInputElement>('[data-variant-agent-attach-screenshot="true"]')
    ?.addEventListener("change", (event) => {
      const target = event.currentTarget as HTMLInputElement;
      controller.actions.setAgentAttachActiveComponentScreenshot(target.checked);
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-open-canvas="true"]')
    ?.addEventListener("click", () => {
      controller.actions.openCanvas();
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-agent-run="true"]')
    ?.addEventListener("click", () => {
      void submitAgentPrompt(controller);
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-agent-clear="true"]')
    ?.addEventListener("click", () => {
      controller.actions.clearAgentRun();
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-comments-clear="true"]')
    ?.addEventListener("click", () => {
      controller.actions.clearComments();
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-sketch-clear="true"]')
    ?.addEventListener("click", () => {
      clearVariantToolSketch(controller);
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-tweaks-load="true"]')
    ?.addEventListener("click", () => {
      void loadDeterministicTweaks(controller);
    });

  container
    .querySelectorAll<HTMLInputElement>("[data-variant-tweak-input]")
    .forEach((field) => {
      field.addEventListener("input", (event) => {
        const target = event.currentTarget as HTMLInputElement;
        const id = target.dataset.variantTweakInput;
        if (!id) {
          return;
        }

        controller.actions.updateTweakDraft(id, target.value);
      });
    });

  container
    .querySelectorAll<HTMLButtonElement>("[data-variant-tweak-apply]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.variantTweakApply;
        if (!id) {
          return;
        }

        void applyDeterministicTweak(controller, id);
      });
    });
}

type PreservedOverlayFocus =
  | {
      key: "prompt";
      selectionStart: number | null;
      selectionEnd: number | null;
    }
  | {
      key: "tweak-input";
      tweakId: string;
      selectionStart: number | null;
      selectionEnd: number | null;
    }
  | null;

function capturePreservedOverlayFocus(container: HTMLDivElement): PreservedOverlayFocus {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLTextAreaElement) && !(activeElement instanceof HTMLInputElement)) {
    return null;
  }

  if (!container.contains(activeElement)) {
    return null;
  }

  if (activeElement instanceof HTMLTextAreaElement && activeElement.matches('[data-variant-agent-prompt="true"]')) {
    return {
      key: "prompt",
      selectionStart: activeElement.selectionStart,
      selectionEnd: activeElement.selectionEnd,
    };
  }

  if (activeElement instanceof HTMLInputElement && activeElement.matches("[data-variant-tweak-input]")) {
    return {
      key: "tweak-input",
      tweakId: activeElement.dataset.variantTweakInput ?? "",
      selectionStart: activeElement.selectionStart,
      selectionEnd: activeElement.selectionEnd,
    };
  }

  return null;
}

function restorePreservedOverlayFocus(
  container: HTMLDivElement,
  preservedFocus: PreservedOverlayFocus,
): void {
  if (!preservedFocus) {
    return;
  }

  if (preservedFocus.key === "prompt") {
    const nextField = container.querySelector<HTMLTextAreaElement>('[data-variant-agent-prompt="true"]');
    if (!nextField || nextField.disabled) {
      return;
    }

    nextField.focus();
    if (preservedFocus.selectionStart !== null && preservedFocus.selectionEnd !== null) {
      nextField.setSelectionRange(preservedFocus.selectionStart, preservedFocus.selectionEnd);
    }
  }

  if (preservedFocus.key === "tweak-input") {
    const nextField = container.querySelector<HTMLInputElement>(
      `[data-variant-tweak-input="${escapeAttributeValue(preservedFocus.tweakId)}"]`,
    );
    if (!nextField || nextField.disabled) {
      return;
    }

    nextField.focus();
    if (preservedFocus.selectionStart !== null && preservedFocus.selectionEnd !== null) {
      nextField.setSelectionRange(preservedFocus.selectionStart, preservedFocus.selectionEnd);
    }
  }
}

function renderStatusText(snapshot: VariantRuntimeSnapshot): string {
  if (snapshot.agent.status === "running") {
    return "Running";
  }

  if (snapshot.agent.status === "success") {
    return snapshot.agent.exitCode === 0 ? "Done" : `Exit ${snapshot.agent.exitCode}`;
  }

  if (snapshot.agent.status === "error") {
    return snapshot.agent.exitCode !== null ? `Exit ${snapshot.agent.exitCode}` : "Error";
  }

  return "Idle";
}

function getLatestAgentMessage(snapshot: VariantRuntimeSnapshot): string {
  const latestStreamMessage = [...snapshot.agent.logs]
    .reverse()
    .find((entry) => entry.stream !== "system" && normalizeAgentMessageText(entry.text));

  if (latestStreamMessage) {
    return normalizeAgentMessageText(latestStreamMessage.text);
  }

  if (snapshot.agent.status === "error") {
    return normalizeAgentMessageText(snapshot.agent.error ?? "") || "Agent run failed.";
  }

  if (snapshot.agent.status === "success") {
    return "Agent run finished.";
  }

  return "Starting local agent session...";
}

function normalizeAgentMessageText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hudShellStyle(): string {
  return [
    "position:fixed",
    "left:50%",
    "bottom:18px",
    "transform:translateX(-50%)",
    `z-index:${variantOverlayZIndex}`,
    "pointer-events:none",
    "width:min(720px,calc(100vw - 32px))",
  ].join(";");
}

function panelStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:10px",
    "width:100%",
    "background:rgba(255,255,255,0.985)",
    "border:1px solid rgba(148,163,184,0.28)",
    "box-shadow:0 20px 60px rgba(15,23,42,0.16)",
    "border-radius:22px",
    "padding:12px",
    "pointer-events:auto",
    'font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    "color:#0f172a",
  ].join(";");
}

function rowStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:8px",
  ].join(";");
}

function metaRowStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
    "gap:8px",
  ].join(";");
}

function buttonRowStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "justify-content:flex-end",
    "gap:8px",
  ].join(";");
}

function attachmentRowStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "flex-wrap:wrap",
    "gap:6px",
  ].join(";");
}

function attachmentChipStyle(): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "height:26px",
    "padding:0 10px",
    "border-radius:999px",
    "background:#e0f2fe",
    "color:#075985",
    "font-size:12px",
    "font-weight:700",
  ].join(";");
}

function segmentedRowStyle(): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "gap:6px",
    "padding:4px",
    "border-radius:999px",
    "background:#f1f5f9",
  ].join(";");
}

function segmentedButtonStyle(active: boolean): string {
  return [
    "height:32px",
    "border:none",
    "border-radius:999px",
    "padding:0 12px",
    active ? "background:#0f172a" : "background:transparent",
    active ? "color:#f8fafc" : "color:#334155",
    "font-size:12px",
    "font-weight:700",
    "cursor:pointer",
  ].join(";");
}

function toolButtonStyle(active: boolean): string {
  return [
    "height:30px",
    active ? "border:1px solid #0f172a" : "border:1px solid #cbd5e1",
    "border-radius:999px",
    "padding:0 10px",
    active ? "background:#e2e8f0" : "background:#fff",
    active ? "color:#0f172a" : "color:#475569",
    "font-size:12px",
    "font-weight:600",
    "cursor:pointer",
  ].join(";");
}

function checkboxRowStyle(disabled: boolean): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "font-size:12px",
    "line-height:1.4",
    disabled ? "color:#94a3b8" : "color:#334155",
  ].join(";");
}

function metaTextStyle(): string {
  return [
    "font-size:12px",
    "line-height:1.4",
    "color:#475569",
    "min-width:0",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
  ].join(";");
}

function hintTextStyle(): string {
  return [
    "font-size:11px",
    "line-height:1.4",
    "color:#64748b",
  ].join(";");
}

function sectionCardStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:8px",
    "padding:10px 12px",
    "border-radius:16px",
    "background:#f8fafc",
    "border:1px solid #e2e8f0",
  ].join(";");
}

function sectionLabelStyle(): string {
  return [
    "font-size:12px",
    "font-weight:700",
    "letter-spacing:0.02em",
    "text-transform:uppercase",
    "color:#334155",
  ].join(";");
}

function stackStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:8px",
  ].join(";");
}

function reviewCardStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:4px",
    "padding:10px",
    "border-radius:14px",
    "background:#fff",
    "border:1px solid #dbe4ee",
  ].join(";");
}

function reviewResultTitleStyle(): string {
  return [
    "font-size:13px",
    "font-weight:700",
    "line-height:1.4",
    "color:#0f172a",
  ].join(";");
}

function statusPillStyle(status: VariantRuntimeSnapshot["agent"]["status"]): string {
  const palette = status === "success"
    ? { background: "#dcfce7", color: "#166534" }
    : status === "error"
      ? { background: "#fee2e2", color: "#991b1b" }
      : status === "running"
        ? { background: "#dbeafe", color: "#1d4ed8" }
        : { background: "#e2e8f0", color: "#334155" };

  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "padding:4px 8px",
    "border-radius:999px",
    `background:${palette.background}`,
    `color:${palette.color}`,
    "font-size:12px",
    "font-weight:600",
    "white-space:nowrap",
  ].join(";");
}

function selectStyle(): string {
  return [
    "flex:1",
    "min-width:0",
    "max-width:100%",
    "border:1px solid #cbd5e1",
    "height:32px",
    "border-radius:10px",
    "background:#fff",
    "color:#0f172a",
    "padding:0 10px",
    "font-size:13px",
    "outline:none",
  ].join(";");
}

function textareaStyle(): string {
  return [
    "width:100%",
    "min-height:88px",
    "max-height:180px",
    "border:1px solid #cbd5e1",
    "border-radius:12px",
    "background:#fff",
    "color:#0f172a",
    "padding:10px 12px",
    "font-size:13px",
    "line-height:1.5",
    "resize:vertical",
    "outline:none",
    "box-sizing:border-box",
  ].join(";");
}

function textInputStyle(): string {
  return [
    "width:100%",
    "height:34px",
    "border:1px solid #cbd5e1",
    "border-radius:10px",
    "background:#fff",
    "color:#0f172a",
    "padding:0 10px",
    "font-size:13px",
    "outline:none",
    "box-sizing:border-box",
  ].join(";");
}

function progressStripStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:12px",
    "min-height:44px",
    "padding:0 14px",
    "border:1px solid rgba(203,213,225,0.95)",
    "border-radius:999px",
    "background:linear-gradient(180deg,#f8fafc 0%,#eef2f7 100%)",
  ].join(";");
}

function progressTextStyle(): string {
  return [
    "flex:1",
    "min-width:0",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
    "font-size:13px",
    "font-weight:600",
    "line-height:1.4",
    "background-image:linear-gradient(90deg,#475569 0%,#0f172a 20%,#64748b 45%,#0f172a 70%,#475569 100%)",
    "background-size:200% 100%",
    "background-clip:text",
    "-webkit-background-clip:text",
    "color:transparent",
    "-webkit-text-fill-color:transparent",
    "animation:variiant-agent-gradient 2.1s linear infinite",
  ].join(";");
}

function spinnerStyle(): string {
  return [
    "width:16px",
    "height:16px",
    "flex-shrink:0",
    "border-radius:999px",
    "border:2px solid rgba(148,163,184,0.35)",
    "border-top-color:#0f172a",
    "animation:variiant-agent-spin 0.85s linear infinite",
  ].join(";");
}

function buttonStyle(kind: "primary" | "secondary" | "disabled"): string {
  if (kind === "disabled") {
    return [
      "height:34px",
      "border:none",
      "border-radius:10px",
      "padding:0 12px",
      "background:#e2e8f0",
      "color:#94a3b8",
      "font-size:13px",
      "font-weight:600",
      "cursor:not-allowed",
    ].join(";");
  }

  const palette = kind === "primary"
    ? { background: "#0f172a", color: "#f8fafc", border: "none" }
    : { background: "#fff", color: "#334155", border: "1px solid #cbd5e1" };

  return [
    "height:34px",
    `border:${palette.border}`,
    "border-radius:10px",
    "padding:0 12px",
    `background:${palette.background}`,
    `color:${palette.color}`,
    "font-size:13px",
    "font-weight:600",
    "cursor:pointer",
  ].join(";");
}

function errorNoteStyle(): string {
  return [
    "font-size:12px",
    "line-height:1.5",
    "word-break:break-word",
    "border-radius:12px",
    "background:#fff1f2",
    "color:#9f1239",
    "padding:10px 12px",
    "border:1px solid #fecdd3",
  ].join(";");
}

function canvasRootStyle(): string {
  return [
    "position:fixed",
    "inset:0",
    `z-index:${variantCanvasZIndex}`,
    "display:flex",
    "flex-direction:column",
    "background-image:radial-gradient(circle at 1px 1px, rgba(148,163,184,0.35) 1px, transparent 0)",
    "background-size:24px 24px",
    "background-color:#f8fafc",
    "color:#0f172a",
    'font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  ].join(";");
}

function canvasChromeStyle(): string {
  return [
    "display:grid",
    "grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)",
    "align-items:center",
    "gap:16px",
    "padding:18px 24px 14px",
    "background:rgba(255,255,255,0.94)",
    "border-bottom:1px solid rgba(148,163,184,0.22)",
  ].join(";");
}

function canvasTitleStyle(): string {
  return [
    "font-size:14px",
    "font-weight:700",
    "letter-spacing:0.01em",
  ].join(";");
}

function canvasTabsStyle(): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-self:center",
    "gap:6px",
    "padding:6px",
    "border-radius:999px",
    "background:rgba(226,232,240,0.92)",
  ].join(";");
}

function canvasModeButtonStyle(): string {
  return [
    "height:34px",
    "padding:0 14px",
    "border:none",
    "border-radius:999px",
    "background:transparent",
    "color:#475569",
    "font-size:13px",
    "font-weight:700",
    "cursor:pointer",
  ].join(";");
}

function canvasModeButtonActiveStyle(): string {
  return [
    "height:34px",
    "padding:0 14px",
    "border:none",
    "border-radius:999px",
    "background:#ffffff",
    "color:#0f172a",
    "font-size:13px",
    "font-weight:700",
    "cursor:pointer",
  ].join(";");
}

function canvasActionsStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "justify-content:flex-end",
    "gap:10px",
    "min-width:0",
  ].join(";");
}

function canvasSelectStyle(): string {
  return [
    "min-width:260px",
    "max-width:min(36vw,480px)",
    "height:36px",
    "border:1px solid rgba(203,213,225,1)",
    "border-radius:12px",
    "background:#ffffff",
    "padding:0 12px",
    "font-size:13px",
    "color:#0f172a",
    "outline:none",
  ].join(";");
}

function canvasSecondaryButtonStyle(): string {
  return [
    "height:36px",
    "padding:0 14px",
    "border:1px solid rgba(203,213,225,1)",
    "border-radius:12px",
    "background:#ffffff",
    "color:#334155",
    "font-size:13px",
    "font-weight:700",
    "cursor:pointer",
  ].join(";");
}

function canvasPrimaryButtonStyle(): string {
  return [
    "height:36px",
    "padding:0 14px",
    "border:none",
    "border-radius:12px",
    "background:#0f172a",
    "color:#f8fafc",
    "font-size:13px",
    "font-weight:700",
    "cursor:pointer",
  ].join(";");
}

function canvasViewportStyle(): string {
  return [
    "position:relative",
    "flex:1",
    "overflow:hidden",
    "touch-action:none",
    "cursor:grab",
    "user-select:none",
    "-webkit-user-select:none",
  ].join(";");
}

function canvasStageStyle(): string {
  return [
    "position:absolute",
    "left:0",
    "top:0",
    "transform-origin:0 0",
    "will-change:transform",
    "padding:96px",
    "user-select:none",
    "-webkit-user-select:none",
  ].join(";");
}

function canvasContentStyle(): string {
  return [
    "display:block",
    "min-width:max-content",
    "user-select:none",
    "-webkit-user-select:none",
  ].join(";");
}

function canvasEmptyStateStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "min-width:720px",
    "min-height:360px",
    "padding:48px",
    "border:2px dashed rgba(148,163,184,0.45)",
    "border-radius:28px",
    "background:rgba(255,255,255,0.72)",
    "color:#475569",
    "font-size:15px",
    "font-weight:600",
  ].join(";");
}

function canvasGroupsRowStyle(): string {
  return [
    "display:flex",
    "align-items:flex-start",
    "gap:88px",
    "min-width:max-content",
  ].join(";");
}

function canvasGroupStyle(width: number): string {
  return [
    "position:relative",
    `width:${width}px`,
    "padding:18px 14px 14px",
    "border:1px solid rgba(203,213,225,0.9)",
    "background:rgba(255,255,255,0.72)",
  ].join(";");
}

function canvasGroupLabelStyle(): string {
  return [
    "position:absolute",
    "left:10px",
    "top:-12px",
    "display:inline-flex",
    "align-items:center",
    "padding:2px 8px",
    "border:1px solid rgba(203,213,225,0.9)",
    "background:rgba(248,250,252,0.96)",
    "color:#334155",
    "font-size:14px",
    "font-weight:600",
    "line-height:1.2",
    "white-space:nowrap",
    "transform-origin:top left",
    "transform:scale(calc(1 / var(--variiant-canvas-zoom, 1)))",
    "pointer-events:none",
  ].join(";");
}

function canvasVariantStackStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:18px",
  ].join(";");
}

function canvasVariantTileStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:8px",
  ].join(";");
}

function canvasVariantTileHeaderStyle(): string {
  return [
    "font-size:12px",
    "font-weight:600",
    "color:#64748b",
    "pointer-events:none",
  ].join(";");
}

function canvasVariantSlotStyle(height: number): string {
  return [
    `min-height:${height}px`,
    "border:1px solid rgba(226,232,240,1)",
    "background:#ffffff",
    "padding:14px",
    "overflow:hidden",
  ].join(";");
}

function canvasPagesRowStyle(): string {
  return [
    "display:flex",
    "align-items:flex-start",
    "gap:64px",
    "min-width:max-content",
  ].join(";");
}

function canvasPageTileStyle(): string {
  return [
    "position:relative",
    "width:420px",
    "padding:18px 14px 14px",
    "border:1px solid rgba(203,213,225,0.9)",
    "background:rgba(255,255,255,0.72)",
  ].join(";");
}

function canvasPageFrameStyle(): string {
  return [
    "display:flex",
    "align-items:flex-start",
    "justify-content:center",
    "min-height:700px",
    "border:1px solid rgba(226,232,240,1)",
    "background:#ffffff",
    "padding:12px",
    "overflow:hidden",
  ].join(";");
}

function canvasPageContentStyle(width: number, height: number): string {
  const scale = Math.min(396 / Math.max(width, 1), 676 / Math.max(height, 1), 1);
  const scaledWidth = Math.max(1, Math.round(width * scale));
  const scaledHeight = Math.max(1, Math.round(height * scale));
  return [
    `width:${width}px`,
    `height:${height}px`,
    `transform:scale(${scale})`,
    "transform-origin:top left",
    "overflow:hidden",
    `margin-right:-${Math.max(0, width - scaledWidth)}px`,
    `margin-bottom:-${Math.max(0, height - scaledHeight)}px`,
    `min-width:${scaledWidth}px`,
    `min-height:${scaledHeight}px`,
  ].join(";");
}

function canvasPagePreviewBodyStyle(width: number, height: number): string {
  return [
    "display:block",
    `width:${width}px`,
    `height:${height}px`,
    "background:#ffffff",
    "overflow:hidden",
    "pointer-events:none",
    "user-select:none",
  ].join(";");
}

function canvasPagePlaceholderStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "width:100%",
    "min-height:640px",
    "border:2px dashed rgba(148,163,184,0.45)",
    "border-radius:16px",
    "color:#64748b",
    "font-size:13px",
    "font-weight:700",
    "background:rgba(255,255,255,0.72)",
  ].join(";");
}
