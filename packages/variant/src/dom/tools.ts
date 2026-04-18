import { toCanvas } from "html-to-image";
import type {
  VariantComment,
  VariantCommentAnchor,
  VariantCommentViewportPoint,
  VariantRuntimeController,
  VariantRuntimeSnapshot,
  VariantSketchAttachment,
} from "../runtime-core";
import {
  escapeAttributeValue,
  getRenderableComponentRect,
} from "./shared";

type VariantHoverTarget = {
  sourceId: string;
  instanceId: string | null;
  displayName: string;
  domOpeningTag: string | null;
  domTextSnippet: string | null;
  anchor: VariantCommentAnchor;
  viewportPoint: VariantCommentViewportPoint;
  visibilityKey: string | null;
};

const maxCommentDomOpeningTagLength = 240;
const maxCommentDomTextLength = 280;
const maxCommentDomAttributeValueLength = 80;
const maxCommentDomAttributes = 8;
const commentNoteWidth = 220;
const commentNoteMinHeight = 138;
const commentNoteGap = 12;
const commentNoteViewportPadding = 16;

type VariantCommentBubbleDom = {
  root: HTMLDivElement;
  textarea: HTMLTextAreaElement;
};

type VariantToolDomState = {
  root: HTMLDivElement;
  interactionLayer: HTMLDivElement;
  highlightBox: HTMLDivElement;
  commentsLayer: HTMLDivElement;
  sketchCanvas: HTMLCanvasElement;
  hoveredTarget: VariantHoverTarget | null;
  focusedCommentId: string | null;
  sketchPointerId: number | null;
  sketchActive: boolean;
  sketchHasStroke: boolean;
  lastPoint: {
    x: number;
    y: number;
  } | null;
  commentBubbles: Map<string, VariantCommentBubbleDom>;
};

const toolDomStates = new WeakMap<VariantRuntimeController, VariantToolDomState>();

export function renderVariantToolLayer(
  container: HTMLDivElement,
  snapshot: VariantRuntimeSnapshot,
  controller: VariantRuntimeController,
  layerZIndex: number,
): void {
  const state = getOrCreateToolDomState(controller, container, layerZIndex);
  state.root.style.display = shouldShowToolLayer(snapshot) ? "block" : "none";
  state.interactionLayer.style.pointerEvents =
    snapshot.toolMode === "inspect" || snapshot.toolMode === "comment" ? "auto" : "none";
  state.interactionLayer.style.cursor =
    snapshot.toolMode === "comment"
      ? "crosshair"
      : snapshot.toolMode === "inspect"
        ? "default"
        : "auto";

  const shouldShowHighlight =
    (snapshot.toolMode === "inspect" || snapshot.toolMode === "comment")
    && state.hoveredTarget;
  if (shouldShowHighlight && state.hoveredTarget) {
    const { anchor } = state.hoveredTarget;
    state.highlightBox.style.display = "block";
    state.highlightBox.style.left = `${anchor.x}px`;
    state.highlightBox.style.top = `${anchor.y}px`;
    state.highlightBox.style.width = `${anchor.width}px`;
    state.highlightBox.style.height = `${anchor.height}px`;
  } else {
    state.highlightBox.style.display = "none";
  }

  state.sketchCanvas.style.display = snapshot.toolMode === "sketch" ? "block" : "none";
  state.sketchCanvas.style.pointerEvents = snapshot.toolMode === "sketch" ? "auto" : "none";
  if (snapshot.toolMode === "sketch") {
    resizeSketchCanvas(state);
  } else if (state.sketchActive) {
    state.sketchActive = false;
    state.sketchPointerId = null;
    state.lastPoint = null;
  }

  syncCommentBubbles(state, snapshot, controller);
}

export function clearVariantToolSketch(controller: VariantRuntimeController): void {
  const state = toolDomStates.get(controller);
  if (!state) {
    controller.actions.clearSketchAttachment();
    return;
  }

  clearSketchCanvas(controller, state);
}

function getOrCreateToolDomState(
  controller: VariantRuntimeController,
  container: HTMLDivElement,
  layerZIndex: number,
): VariantToolDomState {
  const existing = toolDomStates.get(controller);
  if (existing) {
    return existing;
  }

  const root = document.createElement("div");
  root.setAttribute("data-variant-tool-layer", "true");
  root.style.cssText = [
    "position:fixed",
    "inset:0",
    `z-index:${layerZIndex}`,
    "pointer-events:none",
  ].join(";");

  const interactionLayer = document.createElement("div");
  interactionLayer.setAttribute("data-variant-tool-capture", "true");
  interactionLayer.style.cssText = [
    "position:fixed",
    "inset:0",
    "background:transparent",
    "pointer-events:none",
  ].join(";");

  const highlightBox = document.createElement("div");
  highlightBox.setAttribute("data-variant-hover-highlight", "true");
  highlightBox.style.cssText = [
    "display:none",
    "position:fixed",
    "border:2px solid rgba(239,68,68,0.92)",
    "background:rgba(239,68,68,0.1)",
    "border-radius:12px",
    "pointer-events:none",
    "box-shadow:0 0 0 1px rgba(255,255,255,0.7) inset",
  ].join(";");

  const commentsLayer = document.createElement("div");
  commentsLayer.setAttribute("data-variant-comments-layer", "true");
  commentsLayer.style.cssText = [
    "position:fixed",
    "inset:0",
    "pointer-events:none",
  ].join(";");

  const sketchCanvas = document.createElement("canvas");
  sketchCanvas.setAttribute("data-variant-sketch-canvas", "true");
  sketchCanvas.style.cssText = [
    "display:none",
    "position:fixed",
    "inset:0",
    "width:100vw",
    "height:100vh",
    "pointer-events:none",
    "touch-action:none",
    "cursor:crosshair",
  ].join(";");

  root.appendChild(interactionLayer);
  root.appendChild(highlightBox);
  root.appendChild(commentsLayer);
  root.appendChild(sketchCanvas);
  container.replaceChildren(root);

  const state: VariantToolDomState = {
    root,
    interactionLayer,
    highlightBox,
    commentsLayer,
    sketchCanvas,
    hoveredTarget: null,
    focusedCommentId: null,
    sketchPointerId: null,
    sketchActive: false,
    sketchHasStroke: false,
    lastPoint: null,
    commentBubbles: new Map(),
  };

  interactionLayer.addEventListener("mousemove", (event) => {
    const snapshot = controller.getSnapshot();
    if (snapshot.toolMode !== "inspect" && snapshot.toolMode !== "comment") {
      return;
    }

    const hoveredTarget = resolveHoverTarget(event.clientX, event.clientY, state.root);
    const hoverChanged = !areHoverTargetsEqual(state.hoveredTarget, hoveredTarget);
    state.hoveredTarget = hoveredTarget;
    if (!hoverChanged) {
      return;
    }

    renderVariantToolLayer(container, snapshot, controller, layerZIndex);
  });

  interactionLayer.addEventListener("mouseleave", () => {
    if (!state.hoveredTarget) {
      return;
    }

    state.hoveredTarget = null;
    renderVariantToolLayer(container, controller.getSnapshot(), controller, layerZIndex);
  });

  interactionLayer.addEventListener("click", (event) => {
    const snapshot = controller.getSnapshot();
    if (snapshot.toolMode !== "comment" || !state.hoveredTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const commentId = createVariantCommentId();
    controller.actions.upsertComment({
      id: commentId,
      sourceId: state.hoveredTarget.sourceId,
      instanceId: state.hoveredTarget.instanceId,
      text: "",
      domOpeningTag: state.hoveredTarget.domOpeningTag,
      domTextSnippet: state.hoveredTarget.domTextSnippet,
      anchor: state.hoveredTarget.anchor,
      viewportPoint: state.hoveredTarget.viewportPoint,
      visibilityKey: state.hoveredTarget.visibilityKey,
      createdAt: Date.now(),
    });
    state.focusedCommentId = commentId;
    renderVariantToolLayer(container, controller.getSnapshot(), controller, layerZIndex);
  });

  sketchCanvas.addEventListener("pointerdown", (event) => {
    const snapshot = controller.getSnapshot();
    if (snapshot.toolMode !== "sketch") {
      return;
    }

    event.preventDefault();
    resizeSketchCanvas(state);
    state.sketchActive = true;
    state.sketchPointerId = event.pointerId;
    state.lastPoint = { x: event.clientX, y: event.clientY };
    sketchCanvas.setPointerCapture(event.pointerId);
    drawSketchSegment(state, event.clientX, event.clientY, event.clientX + 0.01, event.clientY + 0.01);
  });

  sketchCanvas.addEventListener("pointermove", (event) => {
    if (!state.sketchActive || state.sketchPointerId !== event.pointerId || !state.lastPoint) {
      return;
    }

    event.preventDefault();
    drawSketchSegment(state, state.lastPoint.x, state.lastPoint.y, event.clientX, event.clientY);
    state.lastPoint = { x: event.clientX, y: event.clientY };
  });

  const finalizeSketchPointer = (event: PointerEvent): void => {
    if (!state.sketchActive || state.sketchPointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    state.sketchActive = false;
    state.sketchPointerId = null;
    state.lastPoint = null;
    syncSketchAttachmentFromCanvas(controller, state);
  };

  sketchCanvas.addEventListener("pointerup", finalizeSketchPointer);
  sketchCanvas.addEventListener("pointercancel", finalizeSketchPointer);

  toolDomStates.set(controller, state);
  return state;
}

function shouldShowToolLayer(snapshot: VariantRuntimeSnapshot): boolean {
  return (
    snapshot.toolMode !== "none"
    || snapshot.comments.length > 0
    || snapshot.sketch.status === "ready"
  );
}

function areHoverTargetsEqual(
  left: VariantHoverTarget | null,
  right: VariantHoverTarget | null,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.sourceId === right.sourceId
    && left.instanceId === right.instanceId
    && left.visibilityKey === right.visibilityKey
    && left.anchor.x === right.anchor.x
    && left.anchor.y === right.anchor.y
    && left.anchor.width === right.anchor.width
    && left.anchor.height === right.anchor.height
  );
}

function resolveHoverTarget(
  clientX: number,
  clientY: number,
  toolLayerRoot: HTMLDivElement,
): VariantHoverTarget | null {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const candidate of elements) {
    if (!(candidate instanceof HTMLElement)) {
      continue;
    }

    if (
      toolLayerRoot.contains(candidate)
      || candidate.closest('[data-variant-overlay-root="true"]')
      || candidate.closest('[data-variiant-canvas-fullscreen="true"]')
    ) {
      continue;
    }

    const boundary = candidate.closest<HTMLElement>("[data-variiant-source-id][data-variiant-instance-id]");
    if (!boundary) {
      continue;
    }

    const rect = candidate.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      continue;
    }

    return {
      sourceId: boundary.dataset.variiantSourceId ?? "",
      instanceId: boundary.dataset.variiantInstanceId ?? null,
      displayName: boundary.dataset.variiantDisplayName ?? boundary.dataset.variiantSourceId ?? "Component",
      domOpeningTag: getCommentTargetOpeningTag(candidate),
      domTextSnippet: getCommentTargetTextSnippet(candidate),
      anchor: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
      viewportPoint: {
        x: clientX,
        y: clientY,
      },
      visibilityKey: boundary.dataset.variiantInstanceId ?? null,
    };
  }

  return null;
}

function getCommentTargetOpeningTag(element: HTMLElement): string | null {
  const prioritizedAttributes = [
    "class",
    "id",
    "data-testid",
    "data-state",
    "data-slot",
    "role",
    "type",
    "name",
    "aria-label",
    "href",
  ];
  const attributeNames = element.getAttributeNames();
  const orderedNames = [
    ...prioritizedAttributes.filter((name) => attributeNames.includes(name)),
    ...attributeNames
      .filter((name) => !prioritizedAttributes.includes(name))
      .sort((left, right) => left.localeCompare(right)),
  ].slice(0, maxCommentDomAttributes);
  const renderedAttributes = orderedNames
    .map((name) => {
      const value = element.getAttribute(name);
      if (value === null) {
        return null;
      }

      return `${name}="${truncateCommentDomValue(normalizeCommentDomWhitespace(value), maxCommentDomAttributeValueLength)}"`;
    })
    .filter((value): value is string => Boolean(value));
  const openingTag = `<${element.tagName.toLowerCase()}${renderedAttributes.length > 0 ? ` ${renderedAttributes.join(" ")}` : ""}>`;
  return truncateCommentDomValue(openingTag, maxCommentDomOpeningTagLength);
}

function getCommentTargetTextSnippet(element: HTMLElement): string | null {
  let rawText = "";
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    rawText = element.value;
  } else if (element instanceof HTMLSelectElement) {
    rawText = element.value || element.options[element.selectedIndex]?.text || "";
  } else {
    rawText = element.textContent ?? "";
  }

  const normalizedText = normalizeCommentDomWhitespace(rawText);
  if (!normalizedText) {
    return null;
  }

  return truncateCommentDomValue(normalizedText, maxCommentDomTextLength);
}

function normalizeCommentDomWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateCommentDomValue(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function syncCommentBubbles(
  state: VariantToolDomState,
  snapshot: VariantRuntimeSnapshot,
  controller: VariantRuntimeController,
): void {
  const shouldShowComments = snapshot.comments.length > 0 && snapshot.surface === "overlay";
  if (!shouldShowComments) {
    for (const bubble of state.commentBubbles.values()) {
      bubble.root.remove();
    }
    state.commentBubbles.clear();
    return;
  }

  const nextIds = new Set(snapshot.comments.map((comment) => comment.id));
  for (const [commentId, bubble] of state.commentBubbles.entries()) {
    if (nextIds.has(commentId)) {
      continue;
    }

    bubble.root.remove();
    state.commentBubbles.delete(commentId);
  }

  const occupiedRects: Array<{ left: number; top: number; width: number; height: number }> = [];
  for (const comment of snapshot.comments) {
    const bubble = getOrCreateCommentBubble(state, comment.id, controller);

    if (document.activeElement !== bubble.textarea && bubble.textarea.value !== comment.text) {
      bubble.textarea.value = comment.text;
    }

    const placement = getCommentPlacement(comment, occupiedRects);
    if (!placement) {
      bubble.root.style.display = "none";
      continue;
    }

    bubble.root.style.display = "flex";
    bubble.root.style.left = `${placement.left}px`;
    bubble.root.style.top = `${placement.top}px`;
    bubble.root.style.height = `${placement.height}px`;
    bubble.root.style.transform = `rotate(${getCommentRotationDegrees(comment.id)}deg)`;
    occupiedRects.push(placement);
  }

  if (state.focusedCommentId) {
    const bubble = state.commentBubbles.get(state.focusedCommentId);
    if (bubble && document.activeElement !== bubble.textarea) {
      bubble.textarea.focus();
      bubble.textarea.setSelectionRange(bubble.textarea.value.length, bubble.textarea.value.length);
    }
    state.focusedCommentId = null;
  }
}

function getOrCreateCommentBubble(
  state: VariantToolDomState,
  commentId: string,
  controller: VariantRuntimeController,
): VariantCommentBubbleDom {
  const existing = state.commentBubbles.get(commentId);
  if (existing) {
    return existing;
  }

  const root = document.createElement("div");
  root.dataset.variantCommentBubble = commentId;
  root.style.cssText = commentBubbleStyle();

  const textarea = document.createElement("textarea");
  textarea.dataset.variantCommentInput = commentId;
  textarea.placeholder = "Add contextual direction for this area...";
  textarea.style.cssText = commentTextareaStyle();
  textarea.addEventListener("input", (event) => {
    const target = event.currentTarget as HTMLTextAreaElement;
    controller.actions.updateComment(commentId, target.value);
    state.focusedCommentId = commentId;
  });
  textarea.addEventListener("blur", () => {
    if (textarea.value.trim()) {
      return;
    }

    controller.actions.removeComment(commentId);
    if (state.focusedCommentId === commentId) {
      state.focusedCommentId = null;
    }
  });

  root.appendChild(textarea);
  state.commentsLayer.appendChild(root);

  const bubble: VariantCommentBubbleDom = {
    root,
    textarea,
  };
  state.commentBubbles.set(commentId, bubble);
  return bubble;
}

function getCommentPlacement(
  comment: VariantComment,
  occupiedRects: Array<{ left: number; top: number; width: number; height: number }>,
): {
  left: number;
  top: number;
  width: number;
  height: number;
} | null {
  const boundary = resolveCommentBoundary(comment);
  if (!boundary) {
    return null;
  }

  const rect = getRenderableComponentRect(boundary);
  if (!rect || rect.width < 1 || rect.height < 1) {
    return null;
  }

  return placeCommentNearViewportPoint(comment.viewportPoint, estimateCommentNoteHeight(comment.text), occupiedRects);
}

function placeCommentNearViewportPoint(
  viewportPoint: VariantCommentViewportPoint,
  height: number,
  occupiedRects: Array<{ left: number; top: number; width: number; height: number }>,
): { left: number; top: number; width: number; height: number } {
  const width = commentNoteWidth;
  const x = Number.isFinite(viewportPoint.x) ? viewportPoint.x : commentNoteViewportPadding;
  const y = Number.isFinite(viewportPoint.y) ? viewportPoint.y : commentNoteViewportPadding;
  const candidatePositions: Array<{ left: number; top: number }> = [
    { left: x + commentNoteGap, top: y - 10 },
    { left: x - width - commentNoteGap, top: y - 10 },
    { left: x + commentNoteGap, top: y - height - commentNoteGap },
    { left: x - width - commentNoteGap, top: y - height - commentNoteGap },
  ];

  for (let row = 1; row <= 12; row += 1) {
    const downOffset = row * (height + commentNoteGap);
    const upOffset = row * (height + commentNoteGap);
    candidatePositions.push(
      { left: x + commentNoteGap, top: y - 10 + downOffset },
      { left: x - width - commentNoteGap, top: y - 10 + downOffset },
      { left: x + commentNoteGap, top: y - 10 - upOffset },
      { left: x - width - commentNoteGap, top: y - 10 - upOffset },
    );
  }

  for (const candidate of candidatePositions) {
    const placed = clampCommentRect(candidate.left, candidate.top, width, height);
    if (!rectIntersectsAny(placed, occupiedRects)) {
      return placed;
    }
  }

  return clampCommentRect(x + commentNoteGap, y - 10, width, height);
}

function clampCommentRect(
  left: number,
  top: number,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const maxLeft = Math.max(commentNoteViewportPadding, window.innerWidth - width - commentNoteViewportPadding);
  const maxTop = Math.max(commentNoteViewportPadding, window.innerHeight - height - commentNoteViewportPadding);
  return {
    left: clamp(left, commentNoteViewportPadding, maxLeft),
    top: clamp(top, commentNoteViewportPadding, maxTop),
    width,
    height,
  };
}

function rectIntersectsAny(
  target: { left: number; top: number; width: number; height: number },
  occupiedRects: Array<{ left: number; top: number; width: number; height: number }>,
): boolean {
  return occupiedRects.some((candidate) => rectsIntersect(target, candidate));
}

function rectsIntersect(
  left: { left: number; top: number; width: number; height: number },
  right: { left: number; top: number; width: number; height: number },
): boolean {
  return !(
    left.left + left.width + commentNoteGap <= right.left
    || right.left + right.width + commentNoteGap <= left.left
    || left.top + left.height + commentNoteGap <= right.top
    || right.top + right.height + commentNoteGap <= left.top
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function estimateCommentNoteHeight(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return commentNoteMinHeight;
  }

  const explicitLines = normalized.split("\n");
  const wrappedLineCount = explicitLines.reduce((sum, line) => {
    const lineLength = normalizeCommentDomWhitespace(line).length;
    return sum + Math.max(1, Math.ceil(lineLength / 22));
  }, 0);
  return Math.max(commentNoteMinHeight, 36 + wrappedLineCount * 24);
}

function getCommentRotationDegrees(commentId: string): number {
  let hash = 0;
  for (let index = 0; index < commentId.length; index += 1) {
    hash = (hash * 31 + commentId.charCodeAt(index)) % 997;
  }

  return ((hash % 7) - 3) * 0.45;
}

function resolveCommentBoundary(comment: VariantComment): HTMLElement | null {
  if (comment.instanceId) {
    const boundary = document.querySelector<HTMLElement>(
      `[data-variiant-instance-id="${escapeAttributeValue(comment.instanceId)}"]`,
    );
    if (boundary) {
      return boundary;
    }
  }

  return document.querySelector<HTMLElement>(
    `[data-variiant-source-id="${escapeAttributeValue(comment.sourceId)}"]`,
  );
}

function createVariantCommentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `variant-comment-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function resizeSketchCanvas(state: VariantToolDomState): void {
  const canvas = state.sketchCanvas;
  const nextWidth = Math.max(1, Math.round(window.innerWidth));
  const nextHeight = Math.max(1, Math.round(window.innerHeight));
  if (canvas.width === nextWidth && canvas.height === nextHeight) {
    return;
  }

  const previousCanvas = document.createElement("canvas");
  previousCanvas.width = canvas.width;
  previousCanvas.height = canvas.height;
  previousCanvas.getContext("2d")?.drawImage(canvas, 0, 0);

  canvas.width = nextWidth;
  canvas.height = nextHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  if (previousCanvas.width > 0 && previousCanvas.height > 0) {
    context.drawImage(previousCanvas, 0, 0);
  }
}

function drawSketchSegment(
  state: VariantToolDomState,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): void {
  const context = state.sketchCanvas.getContext("2d");
  if (!context) {
    return;
  }

  context.strokeStyle = "rgba(220, 38, 38, 0.92)";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 6;
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();
  state.sketchHasStroke = true;
}

function syncSketchAttachmentFromCanvas(
  controller: VariantRuntimeController,
  state: VariantToolDomState,
): void {
  if (!state.sketchHasStroke) {
    controller.actions.clearSketchAttachment();
    return;
  }

  void (async () => {
    try {
      const attachment = await composeVariantSketchAttachment(state.sketchCanvas);
      controller.actions.setSketchAttachment(attachment);
    } catch {
      controller.actions.setSketchAttachment(buildRawSketchAttachment(state.sketchCanvas));
    }
  })();
}

function clearSketchCanvas(
  controller: VariantRuntimeController,
  state: VariantToolDomState,
): void {
  const context = state.sketchCanvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, state.sketchCanvas.width, state.sketchCanvas.height);
  }
  state.sketchHasStroke = false;
  state.sketchActive = false;
  state.sketchPointerId = null;
  state.lastPoint = null;
  controller.actions.clearSketchAttachment();
}

function buildRawSketchAttachment(sketchCanvas: HTMLCanvasElement): VariantSketchAttachment {
  return {
    status: "ready",
    fileName: "sketch.png",
    dataUrl: sketchCanvas.toDataURL("image/png"),
    width: sketchCanvas.width,
    height: sketchCanvas.height,
  };
}

export async function composeVariantSketchAttachment(
  sketchCanvas: HTMLCanvasElement,
): Promise<VariantSketchAttachment> {
  const documentWidth = getDocumentCaptureWidth();
  const documentHeight = getDocumentCaptureHeight();
  const viewportWidth = sketchCanvas.width;
  const viewportHeight = sketchCanvas.height;
  const documentCanvas = await toCanvas(document.body, {
    backgroundColor: "#ffffff",
    cacheBust: true,
    pixelRatio: 1,
    width: documentWidth,
    height: documentHeight,
    canvasWidth: documentWidth,
    canvasHeight: documentHeight,
    skipAutoScale: true,
    filter: (node) => !(
      node instanceof HTMLElement
      && (
        node.dataset.variantOverlayRoot === "true"
        || node.dataset.variantToolLayer === "true"
        || node.dataset.variiantCanvasFullscreen === "true"
      )
    ),
  });

  const compositeCanvas = document.createElement("canvas");
  compositeCanvas.width = viewportWidth;
  compositeCanvas.height = viewportHeight;
  const context = compositeCanvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context unavailable.");
  }

  const cropLeft = Math.max(0, Math.floor(window.scrollX));
  const cropTop = Math.max(0, Math.floor(window.scrollY));

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, viewportWidth, viewportHeight);
  context.drawImage(
    documentCanvas,
    cropLeft,
    cropTop,
    viewportWidth,
    viewportHeight,
    0,
    0,
    viewportWidth,
    viewportHeight,
  );
  context.drawImage(sketchCanvas, 0, 0);

  return {
    status: "ready",
    fileName: "sketch.png",
    dataUrl: compositeCanvas.toDataURL("image/png"),
    width: viewportWidth,
    height: viewportHeight,
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

function commentBubbleStyle(): string {
  return [
    "position:fixed",
    "display:flex",
    `width:${commentNoteWidth}px`,
    `min-height:${commentNoteMinHeight}px`,
    "padding:0",
    "border-radius:14px",
    "border:1px solid rgba(138,99,26,0.18)",
    "background:linear-gradient(180deg, #fff3a8 0%, #f4df73 100%)",
    "box-shadow:0 18px 38px rgba(99,70,18,0.22), 0 2px 0 rgba(255,255,255,0.35) inset",
    "pointer-events:auto",
    "overflow:hidden",
    "transform-origin:50% 100%",
  ].join(";");
}

function commentTextareaStyle(): string {
  return [
    "width:100%",
    "height:100%",
    "padding:18px 18px 16px",
    "border:0",
    "background:transparent",
    "color:#5a4212",
    "font:500 16px/1.45 \"Marker Felt\", \"Comic Sans MS\", \"Segoe Print\", cursive",
    "letter-spacing:0.01em",
    "resize:none",
    "outline:none",
    "box-sizing:border-box",
    "overflow:hidden",
  ].join(";");
}
