import type { VariantRuntimeController, VariantRuntimeSnapshot } from "../runtime-core";
import {
  clearVariantToolSketch,
  renderVariantToolLayer,
} from "./tools";
import { renderCanvas } from "./canvas";
import { renderOverlay, variantOverlayZIndex } from "./overlay";
import { loadAgentBridgeConfig } from "./agent";

const installedOverlayControllers = new WeakSet<VariantRuntimeController>();
const overlayStyleTagId = "variiant-overlay-styles";
const variantOverlayPopoverSelector = '[data-variant-overlay-popover="true"]';

type PopoverCapableElement = HTMLDivElement & {
  hidePopover: () => void;
  showPopover: () => void;
};

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
