import React, {
  createContext,
  useEffect,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
  type VariantComment,
  type VariantCommentAnchor,
  type VariantCommentViewportPoint,
  type VariantAgentAvailability,
  type VariantAgentLogEntry,
  type VariantAgentState,
  type VariantAgentStatus,
  type VariantAgentStreamingMode,
  type VariantCanvasCamera,
  type VariantCanvasMode,
  type VariantCanvasState,
  type VariantDockMode,
  type VariantSketchAttachment,
  type VariantSurface,
  type VariantReviewResult,
  type VariantTweakCatalogEntry,
  type VariantTweakState,
  type VariantTweakStatus,
  type RuntimeComponentRecord,
  type RuntimeState,
  type Shortcut,
  type VariantToolMode,
  type VariantDefinition,
  type VariantRuntimeController,
  type VariantRuntimeSnapshot,
  type VariantRuntimeStorage,
  type VariantShortcutConfig,
} from "./runtime-core";
import { getRepresentativeMountedInstance } from "./runtime-core";
export type { ProxyDefinition } from "./runtime-react-types";

let nextVariantInstanceId = 1;
const VariantCanvasPreviewContext = createContext(false);

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
    const isCanvasPreview = useContext(VariantCanvasPreviewContext);
    const snapshot = useSyncExternalStore(
      controller.subscribe,
      () => controller.getSnapshot(),
      () => controller.getSnapshot(),
    );
    const currentVariant = snapshot.effectiveSelections[sourceId] ?? initialSelected;
    const instanceIdRef = useRef<string | undefined>(undefined);
    const boundaryRef = useRef<HTMLSpanElement | null>(null);
    const lastMeasurementRef = useRef<{
      width: number | null;
      preferredWidth: number | null;
      height: number | null;
      isVisible: boolean;
    } | null>(null);
    const [portalRefreshVersion, setPortalRefreshVersion] = useState(0);

    if (!instanceIdRef.current) {
      instanceIdRef.current = `variant-instance-${nextVariantInstanceId++}`;
    }
    const instanceId = instanceIdRef.current;

    useEffect(() => {
      if (isCanvasPreview) {
        return undefined;
      }

      return controller.mount(sourceId);
    }, [controller, isCanvasPreview, sourceId]);
    useEffect(() => {
      if (isCanvasPreview) {
        return undefined;
      }

      controller.actions.registerMountedInstance({
        instanceId,
        sourceId,
        displayName,
      });

      return () => {
        controller.actions.unregisterMountedInstance(instanceId);
      };
    }, [controller, displayName, instanceId, isCanvasPreview, sourceId]);

    useLayoutEffect(() => {
      if (isCanvasPreview) {
        return undefined;
      }

      const element = boundaryRef.current;
      if (!element) {
        return undefined;
      }

      let frameId = 0;
      const updateLayout = (): void => {
        const measurement = measureRenderableBoundary(element);
        const nextMeasurement = {
          width: measurement?.width ?? null,
          preferredWidth: measurement?.preferredWidth ?? null,
          height: measurement?.height ?? null,
          isVisible: Boolean(measurement && measurement.width > 0 && measurement.height > 0),
        };

        const previousMeasurement = lastMeasurementRef.current;
        if (
          previousMeasurement
          && previousMeasurement.width === nextMeasurement.width
          && previousMeasurement.preferredWidth === nextMeasurement.preferredWidth
          && previousMeasurement.height === nextMeasurement.height
          && previousMeasurement.isVisible === nextMeasurement.isVisible
        ) {
          return;
        }

        lastMeasurementRef.current = nextMeasurement;
        controller.actions.updateMountedInstance(instanceId, nextMeasurement);
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
    }, [controller, instanceId, isCanvasPreview]);

    const Component = useMemo(
      () => variants[currentVariant] ?? variants[initialSelected] ?? variants.source,
      [currentVariant],
    );

    const representativeInstance = getRepresentativeMountedInstance(snapshot, sourceId);
    const shouldRenderCanvasPreviews =
      !isCanvasPreview
      && portalRefreshVersion >= 0
      && snapshot.canvasOpen
      && snapshot.canvas.mode === "components"
      && representativeInstance?.instanceId === instanceId;

    useEffect(() => {
      if (!shouldRenderCanvasPreviews) {
        return undefined;
      }

      let frameId = window.requestAnimationFrame(() => {
        setPortalRefreshVersion((value) => value + 1);
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }, [
      shouldRenderCanvasPreviews,
      snapshot.surface,
      snapshot.canvas.mode,
      snapshot.canvas.targetSourceId,
      snapshot.components.length,
      sourceId,
      variantNames.join("|"),
    ]);

    const canvasPreviewPortals = shouldRenderCanvasPreviews
      ? variantNames.map((variantName) => {
          const slot = getVariantCanvasComponentSlot(sourceId, variantName);
          if (!slot) {
            return null;
          }

          const PreviewComponent = variants[variantName] ?? variants[initialSelected] ?? variants.source;
          return createPortal(
            (
              <VariantCanvasPreviewContext.Provider value={true}>
                <div
                  data-variiant-canvas-preview="true"
                  data-variiant-canvas-source-id={sourceId}
                  data-variiant-canvas-variant={variantName}
                  style={canvasPreviewStyle()}
                >
                  <PreviewComponent {...props} />
                </div>
              </VariantCanvasPreviewContext.Provider>
            ),
            slot,
            `${instanceId}:${variantName}`,
          );
        })
      : null;

    return (
      <>
        <span
          ref={boundaryRef}
          data-variiant-source-id={sourceId}
          data-variiant-instance-id={instanceId}
          data-variiant-display-name={displayName}
          style={{ display: "contents" }}
        >
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
): { width: number; preferredWidth: number; height: number } | null {
  const boundaryRect = boundary.getBoundingClientRect();
  if (boundaryRect.width >= 1 && boundaryRect.height >= 1) {
    const width = Math.max(1, Math.round(boundaryRect.width));
    return {
      width,
      preferredWidth: inferPreferredWidth(boundary, width),
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
  const width = Math.max(1, Math.round(right - left));
  const primaryElement = descendantRects
    .map((rect, index) => ({
      index,
      area: rect.width * rect.height,
      width: rect.width,
    }))
    .sort((leftEntry, rightEntry) => rightEntry.area - leftEntry.area || rightEntry.width - leftEntry.width)[0];
  const sourceElement = primaryElement
    ? Array.from(boundary.querySelectorAll<HTMLElement>("*"))[primaryElement.index] ?? boundary
    : boundary;

  return {
    width,
    preferredWidth: inferPreferredWidth(sourceElement, width),
    height: Math.max(1, Math.round(bottom - top)),
  };
}

function inferPreferredWidth(element: HTMLElement, measuredWidth: number): number {
  const viewportWidth = Math.max(window.innerWidth || 0, measuredWidth);
  let preferredWidth = measuredWidth;
  let current: HTMLElement | null = element;

  for (let depth = 0; depth < 6 && current?.parentElement; depth += 1) {
    current = current.parentElement;
    const parentWidth = Math.round(current.getBoundingClientRect().width);
    if (parentWidth < measuredWidth || parentWidth <= 0) {
      continue;
    }

    if (measuredWidth >= parentWidth * 0.68) {
      preferredWidth = Math.max(preferredWidth, parentWidth);
    }

    if (parentWidth >= viewportWidth * 0.9) {
      preferredWidth = Math.max(preferredWidth, parentWidth);
      break;
    }
  }

  return Math.max(measuredWidth, Math.round(Math.min(preferredWidth, 1600)));
}

function canvasPreviewStyle(): React.CSSProperties {
  return {
    pointerEvents: "none",
    width: "100%",
    minHeight: "100%",
  };
}
