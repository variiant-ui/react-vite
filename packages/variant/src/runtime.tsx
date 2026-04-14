import React, {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";

export { getVariantRuntimeState, installVariantOverlay, setVariantShortcuts } from "./runtime-api";
import { getVariantRuntimeController } from "./runtime-singleton";
import type { ProxyDefinition } from "./runtime-react-types";

export {
  createVariantRuntimeController,
  defaultShortcuts,
  type RuntimeComponentRecord,
  type RuntimeState,
  type Shortcut,
  type VariantDefinition,
  type VariantRuntimeController,
  type VariantRuntimeSnapshot,
  type VariantRuntimeStorage,
  type VariantShortcutConfig,
} from "./runtime-core";
export type { ProxyDefinition } from "./runtime-react-types";

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
    const currentVariant = useSyncExternalStore(
      controller.subscribe,
      () => controller.getSelectedVariant(sourceId, initialSelected),
      () => initialSelected,
    );

    useEffect(() => controller.mount(sourceId), []);

    const Component = useMemo(
      () => variants[currentVariant] ?? variants[initialSelected] ?? variants.source,
      [currentVariant],
    );

    return <Component {...props} />;
  }

  VariantProxy.displayName = `${displayName.replace(/\s+/g, "")}VariantProxy`;
  return VariantProxy;
}
