import type { VariantRuntimeController, VariantRuntimeSnapshot } from "../runtime-core";
import { getRepresentativeMountedInstance } from "../runtime-core";
import {
  escapeHtml,
  escapeAttributeValue,
  formatCanvasGroupLabel,
} from "./shared";
import {
  canvasRootStyle,
  canvasChromeStyle,
  canvasTitleStyle,
  canvasTabsStyle,
  canvasModeButtonStyle,
  canvasModeButtonActiveStyle,
  canvasActionsStyle,
  canvasSelectStyle,
  canvasSecondaryButtonStyle,
  canvasPrimaryButtonStyle,
  canvasViewportStyle,
  canvasStageStyle,
  canvasContentStyle,
  canvasEmptyStateStyle,
  canvasGroupsRowStyle,
  canvasGroupStyle,
  canvasGroupLabelStyle,
  canvasVariantStackStyle,
  canvasVariantTileStyle,
  canvasVariantTileHeaderStyle,
  canvasVariantSlotStyle,
  canvasPagesRowStyle,
  canvasPageTileStyle,
  canvasPageFrameStyle,
  canvasPageContentStyle,
  canvasPagePreviewBodyStyle,
  canvasPagePlaceholderStyle,
} from "./canvas-styles";

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

const canvasDomStates = new WeakMap<VariantRuntimeController, VariantCanvasDomState>();

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

export function renderCanvas(
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

