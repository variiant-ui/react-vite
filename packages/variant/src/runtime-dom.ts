import { toCanvas } from "html-to-image";
import type {
  Shortcut,
  VariantRuntimeController,
  VariantRuntimeSnapshot,
} from "./runtime-core";

const installedKeyboardControllers = new WeakSet<VariantRuntimeController>();
const installedOverlayControllers = new WeakSet<VariantRuntimeController>();
const overlayStyleTagId = "variiant-overlay-styles";
const agentBridgeStates = new WeakMap<VariantRuntimeController, {
  loaded: boolean;
  loadingPromise: Promise<void> | null;
  token: string | null;
}>();

type VariantAgentRequestAttachment = {
  kind: "component-screenshot";
  sourceId: string;
  displayName: string;
  variantName: string | null;
  mimeType: "image/jpeg";
  fileName: string;
  width: number;
  height: number;
  scale: 1;
  dataUrl: string;
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

    const { shortcutConfig, overlayOpen } = controller.getSnapshot();
    if (matchesShortcut(event, shortcutConfig.toggleOverlay)) {
      event.preventDefault();
      controller.actions.toggleOverlay();
      return;
    }

    if (matchesShortcut(event, shortcutConfig.closeOverlay)) {
      if (overlayOpen) {
        event.preventDefault();
        controller.actions.closeOverlay();
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
  document.body.appendChild(container);

  const render = (): void => {
    renderOverlay(container, controller.getSnapshot(), controller);
  };

  controller.subscribe(render);
  installedOverlayControllers.add(controller);
  void loadAgentBridgeConfig(controller);
  render();
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

function buildAgentRequestPayload(
  snapshot: VariantRuntimeSnapshot,
  attachments: VariantAgentRequestAttachment[] = [],
): Record<string, unknown> {
  const mountedComponents = snapshot.components
    .filter((component) => component.mountedCount > 0)
    .map((component) => ({
      sourceId: component.sourceId,
      displayName: component.displayName,
      selected: snapshot.selections[component.sourceId] ?? component.selected,
      variantNames: component.variantNames,
    }));

  const activeComponent = getActiveMountedComponent(snapshot);

  return {
    prompt: snapshot.agent.prompt,
    page: {
      title: document.title,
      url: window.location.href,
    },
    activeSourceId: snapshot.activeSourceId,
    activeVariant: activeComponent
      ? snapshot.selections[activeComponent.sourceId] ?? activeComponent.selected
      : null,
    mountedComponents,
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
            const displayText = getDisplayableAgentEventText(event.type, event.text ?? "");
            if (displayText) {
              controller.actions.appendAgentLog(event.type, displayText);
            }
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

function getDisplayableAgentEventText(
  stream: "stdout" | "stderr" | "system",
  text: string,
): string | null {
  const normalized = normalizeAgentMessageText(text);
  if (!normalized) {
    return null;
  }

  const parsed = tryParseJsonLine(normalized);
  if (!parsed) {
    return normalized;
  }

  const extracted = extractHumanMessageFromAgentJson(parsed);
  if (extracted) {
    return extracted;
  }

  return stream === "stderr" ? normalized : null;
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

function getRenderableComponentRect(
  boundary: HTMLElement,
): { left: number; top: number; width: number; height: number } | null {
  const boundaryRect = boundary.getBoundingClientRect();
  if (boundaryRect.width >= 1 && boundaryRect.height >= 1) {
    return {
      left: boundaryRect.left,
      top: boundaryRect.top,
      width: Math.max(1, Math.round(boundaryRect.width)),
      height: Math.max(1, Math.round(boundaryRect.height)),
    };
  }

  const descendantRects = Array.from(boundary.querySelectorAll<HTMLElement>("*"))
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width >= 1 && rect.height >= 1);

  if (descendantRects.length === 0) {
    return null;
  }

  const left = Math.min(...descendantRects.map((rect) => rect.left));
  const top = Math.min(...descendantRects.map((rect) => rect.top));
  const right = Math.max(...descendantRects.map((rect) => rect.right));
  const bottom = Math.max(...descendantRects.map((rect) => rect.bottom));

  return {
    left,
    top,
    width: Math.max(1, Math.round(right - left)),
    height: Math.max(1, Math.round(bottom - top)),
  };
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "component-screenshot";
}

function escapeAttributeValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function renderOverlay(
  container: HTMLDivElement,
  snapshot: VariantRuntimeSnapshot,
  controller: VariantRuntimeController,
): void {
  if (!snapshot.overlayOpen) {
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

  container.innerHTML = `
<div style="${hudShellStyle()}">
  <div style="${panelStyle()}">
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
      <div data-variant-agent-status="true" style="${statusPillStyle(snapshot.agent.status)}">${escapeHtml(statusText)}</div>
    </div>
    ${runningProgressMarkup}
    ${snapshot.agent.status === "running" ? "" : `
    <textarea
      data-variant-agent-prompt="true"
      style="${textareaStyle()}"
      placeholder="Ask the local agent to create or update a design variant..."
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
    .querySelector<HTMLButtonElement>('[data-variant-agent-run="true"]')
    ?.addEventListener("click", () => {
      void submitAgentPrompt(controller);
    });

  container
    .querySelector<HTMLButtonElement>('[data-variant-agent-clear="true"]')
    ?.addEventListener("click", () => {
      controller.actions.clearAgentRun();
    });
}

type PreservedOverlayFocus =
  | {
      key: "prompt";
      selectionStart: number | null;
      selectionEnd: number | null;
    }
  | null;

function capturePreservedOverlayFocus(container: HTMLDivElement): PreservedOverlayFocus {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLTextAreaElement)) {
    return null;
  }

  if (!container.contains(activeElement)) {
    return null;
  }

  if (!activeElement.matches('[data-variant-agent-prompt="true"]')) {
    return null;
  }

  return {
    key: "prompt",
    selectionStart: activeElement.selectionStart,
    selectionEnd: activeElement.selectionEnd,
  };
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hudShellStyle(): string {
  return [
    "position:fixed",
    "top:16px",
    "right:16px",
    "z-index:9999",
    "pointer-events:none",
    "width:min(460px,calc(100vw - 32px))",
  ].join(";");
}

function panelStyle(): string {
  return [
    "display:flex",
    "flex-direction:column",
    "gap:8px",
    "width:100%",
    "background:rgba(255,255,255,0.98)",
    "backdrop-filter:blur(16px)",
    "box-shadow:0 18px 40px rgba(15,23,42,0.18)",
    "border:1px solid rgba(148,163,184,0.35)",
    "border-radius:16px",
    "padding:10px",
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
    "box-shadow:inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -3px 10px rgba(148,163,184,0.18)",
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
