import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export { getVariantRuntimeState, installVariantOverlay, setVariantShortcuts } from "./runtime-api";
import { getVariantCanvasComponentSlot } from "./runtime-dom";
import { getVariantRuntimeController } from "./runtime-singleton";
import type { ProxyDefinition } from "./runtime-react-types";

export {
  createVariantRuntimeController,
  defaultShortcuts,
  getRepresentativeMountedInstance,
  type MountedVariantInstance,
  type VariantAgentAvailability,
  type VariantAgentLogEntry,
  type VariantAgentState,
  type VariantAgentStatus,
  type VariantAgentStreamingMode,
  type VariantCanvasCamera,
  type VariantCanvasCaptureState,
  type VariantCanvasMode,
  type VariantCanvasState,
  type VariantSurface,
  type RuntimeComponentRecord,
  type RuntimeState,
  type Shortcut,
  type VariantDefinition,
  type VariantRuntimeController,
  type VariantRuntimeSnapshot,
  type VariantRuntimeStorage,
  type VariantShortcutConfig,
} from "./runtime-core";
import { getRepresentativeMountedInstance } from "./runtime-core";
export type { ProxyDefinition } from "./runtime-react-types";

let nextVariantInstanceId = 1;

export function createVariantProxy<Props extends object>({
  sourceId,
  displayName,
  selected,
  variants,
}: ProxyDefinition<Props>): ComponentType<Props> {
  const controller = getVariantRuntimeController();
  const variantNames = Object.keys(variants);
  const initialSelected = variantNames.includes(selected) ? selected : "source";

  controller.define({
    sourceId,
    displayName,
    selected: initialSelected,
    variantNames,
  });

  function VariantProxy(props: Props): ReactNode {
    const snapshot = useSyncExternalStore(
      controller.subscribe,
      () => controller.getSnapshot(),
      () => controller.getSnapshot(),
    );
    const currentVariant = snapshot.effectiveSelections[sourceId] ?? initialSelected;
    const instanceIdRef = useRef<string | undefined>(undefined);
    const boundaryRef = useRef<HTMLSpanElement | null>(null);

    if (!instanceIdRef.current) {
      instanceIdRef.current = `variant-instance-${nextVariantInstanceId++}`;
    }
    const instanceId = instanceIdRef.current;

    useEffect(() => controller.mount(sourceId), []);
    useEffect(() => {
      controller.actions.registerMountedInstance({
        instanceId,
        sourceId,
        displayName,
      });

      return () => {
        controller.actions.unregisterMountedInstance(instanceId);
      };
    }, []);

    useLayoutEffect(() => {
      const element = boundaryRef.current;
      if (!element) {
        return;
      }

      let frameId = 0;
      const updateLayout = (): void => {
        const measurement = measureRenderableBoundary(element);
        controller.actions.updateMountedInstance(instanceId, {
          width: measurement?.width ?? null,
          height: measurement?.height ?? null,
          isVisible: Boolean(measurement && measurement.width > 0 && measurement.height > 0),
        });
      };

      const scheduleUpdate = (): void => {
        cancelAnimationFrame(frameId);
        frameId = window.requestAnimationFrame(updateLayout);
      };

      scheduleUpdate();
      window.addEventListener("resize", scheduleUpdate);
      return () => {
        cancelAnimationFrame(frameId);
        window.removeEventListener("resize", scheduleUpdate);
      };
    });

    const Component = useMemo(
      () => variants[currentVariant] ?? variants[initialSelected] ?? variants.source,
      [currentVariant],
    );

    const representativeInstance = getRepresentativeMountedInstance(snapshot, sourceId);
    const shouldRenderCanvasPreviews =
      snapshot.canvasOpen
      && snapshot.canvas.mode === "components"
      && representativeInstance?.instanceId === instanceId;

    const canvasPreviewPortals = shouldRenderCanvasPreviews
      ? variantNames.map((variantName) => {
          const slot = getVariantCanvasComponentSlot(sourceId, variantName);
          if (!slot) {
            return null;
          }

          const PreviewComponent = variants[variantName] ?? variants[initialSelected] ?? variants.source;
          return createPortal(
            (
              <div
                data-variiant-canvas-preview="true"
                data-variiant-canvas-source-id={sourceId}
                data-variiant-canvas-variant={variantName}
                style={canvasPreviewStyle()}
              >
                <PreviewComponent {...props} />
              </div>
            ),
            slot,
            `${instanceId}:${variantName}`,
          );
        })
      : null;

    return (
      <>
        <span ref={boundaryRef} data-variiant-source-id={sourceId} style={{ display: "contents" }}>
          <Component {...props} />
        </span>
        {canvasPreviewPortals}
      </>
    );
  }

  VariantProxy.displayName = `${displayName.replace(/\s+/g, "")}VariantProxy`;
  return VariantProxy;
}

function measureRenderableBoundary(
  boundary: HTMLElement,
): { width: number; height: number } | null {
  const boundaryRect = boundary.getBoundingClientRect();
  if (boundaryRect.width >= 1 && boundaryRect.height >= 1) {
    return {
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
    width: Math.max(1, Math.round(right - left)),
    height: Math.max(1, Math.round(bottom - top)),
  };
}

function canvasPreviewStyle(): React.CSSProperties {
  return {
    pointerEvents: "none",
    width: "100%",
    minHeight: "100%",
  };
}
