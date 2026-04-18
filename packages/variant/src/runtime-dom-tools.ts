import type {
  VariantComment,
  VariantCommentAnchor,
  VariantCommentViewportPoint,
  VariantRuntimeController,
  VariantRuntimeSnapshot,
  VariantSketchAttachment,
} from "./runtime-core";
import {
  escapeAttributeValue,
  formatCanvasGroupLabel,
  getRenderableComponentRect,
} from "./runtime-dom-shared";

type VariantHoverTarget = {
  sourceId: string;
  instanceId: string | null;
  displayName: string;
  anchor: VariantCommentAnchor;
  viewportPoint: VariantCommentViewportPoint;
  visibilityKey: string | null;
};

type VariantCommentBubbleDom = {
  root: HTMLDivElement;
  indexBadge: HTMLDivElement;
  label: HTMLDivElement;
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

  for (const [index, comment] of snapshot.comments.entries()) {
    const placement = getCommentPlacement(comment);
    const bubble = getOrCreateCommentBubble(state, comment.id, controller);
    bubble.indexBadge.textContent = String(index + 1);
    bubble.label.textContent = placement?.label ?? "";

    if (placement) {
      bubble.root.style.display = "flex";
      bubble.root.style.left = `${placement.left}px`;
      bubble.root.style.top = `${placement.top}px`;
    } else {
      bubble.root.style.display = "none";
    }

    if (document.activeElement !== bubble.textarea && bubble.textarea.value !== comment.text) {
      bubble.textarea.value = comment.text;
    }
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

  const header = document.createElement("div");
  header.style.cssText = commentBubbleHeaderStyle();

  const indexBadge = document.createElement("div");
  indexBadge.style.cssText = commentIndexStyle();

  const label = document.createElement("div");
  label.style.cssText = commentLabelStyle();

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.textContent = "Remove";
  removeButton.dataset.variantCommentRemove = commentId;
  removeButton.style.cssText = commentRemoveButtonStyle();
  removeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    controller.actions.removeComment(commentId);
    if (state.focusedCommentId === commentId) {
      state.focusedCommentId = null;
    }
  });

  header.appendChild(indexBadge);
  header.appendChild(label);
  header.appendChild(removeButton);

  const textarea = document.createElement("textarea");
  textarea.dataset.variantCommentInput = commentId;
  textarea.placeholder = "Add contextual direction for this area...";
  textarea.style.cssText = commentTextareaStyle();
  textarea.addEventListener("input", (event) => {
    const target = event.currentTarget as HTMLTextAreaElement;
    controller.actions.updateComment(commentId, target.value);
    state.focusedCommentId = commentId;
  });

  root.appendChild(header);
  root.appendChild(textarea);
  state.commentsLayer.appendChild(root);

  const bubble: VariantCommentBubbleDom = {
    root,
    indexBadge,
    label,
    textarea,
  };
  state.commentBubbles.set(commentId, bubble);
  return bubble;
}

function getCommentPlacement(comment: VariantComment): {
  left: number;
  top: number;
  label: string;
} | null {
  const boundary = resolveCommentBoundary(comment);
  if (!boundary) {
    return null;
  }

  const rect = getRenderableComponentRect(boundary);
  if (!rect || rect.width < 1 || rect.height < 1) {
    return null;
  }

  return {
    left: Math.min(window.innerWidth - 324, rect.left + rect.width + 12),
    top: Math.max(12, rect.top),
    label: boundary.dataset.variiantDisplayName ?? formatCanvasGroupLabel(comment.sourceId),
  };
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

  const attachment: VariantSketchAttachment = {
    status: "ready",
    fileName: "sketch.png",
    dataUrl: state.sketchCanvas.toDataURL("image/png"),
    width: state.sketchCanvas.width,
    height: state.sketchCanvas.height,
  };
  controller.actions.setSketchAttachment(attachment);
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

function commentBubbleStyle(): string {
  return [
    "position:fixed",
    "display:flex",
    "flex-direction:column",
    "gap:8px",
    "width:312px",
    "padding:12px",
    "border-radius:16px",
    "border:1px solid rgba(248,113,113,0.32)",
    "background:rgba(15,23,42,0.92)",
    "box-shadow:0 18px 48px rgba(15,23,42,0.28)",
    "pointer-events:auto",
    "color:#f8fafc",
    "backdrop-filter:blur(18px)",
  ].join(";");
}

function commentBubbleHeaderStyle(): string {
  return [
    "display:flex",
    "align-items:center",
    "gap:8px",
  ].join(";");
}

function commentIndexStyle(): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "min-width:24px",
    "height:24px",
    "padding:0 8px",
    "border-radius:999px",
    "background:rgba(239,68,68,0.18)",
    "color:#fecaca",
    "font:600 11px/1.2 Inter, sans-serif",
    "letter-spacing:0.08em",
    "text-transform:uppercase",
  ].join(";");
}

function commentLabelStyle(): string {
  return [
    "flex:1",
    "min-width:0",
    "font:600 12px/1.4 Inter, sans-serif",
    "color:#e2e8f0",
    "white-space:nowrap",
    "overflow:hidden",
    "text-overflow:ellipsis",
  ].join(";");
}

function commentRemoveButtonStyle(): string {
  return [
    "border:0",
    "background:transparent",
    "color:#fca5a5",
    "font:600 11px/1.2 Inter, sans-serif",
    "cursor:pointer",
    "padding:0",
  ].join(";");
}

function commentTextareaStyle(): string {
  return [
    "width:100%",
    "min-height:108px",
    "padding:12px 14px",
    "border-radius:12px",
    "border:1px solid rgba(148,163,184,0.24)",
    "background:rgba(15,23,42,0.48)",
    "color:#f8fafc",
    "font:500 13px/1.5 Inter, sans-serif",
    "resize:vertical",
    "outline:none",
    "box-sizing:border-box",
  ].join(";");
}
