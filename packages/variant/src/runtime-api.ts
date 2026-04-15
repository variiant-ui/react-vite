import type { RuntimeState, VariantShortcutConfig } from "./runtime-core";
import { installVariantKeyboardBindings, installVariantOverlayUi } from "./runtime-dom";
import { getVariantRuntimeController } from "./runtime-singleton";

export function installVariantOverlay(shortcuts?: Partial<VariantShortcutConfig>): void {
  const controller = getVariantRuntimeController();
  controller.actions.configureShortcuts(shortcuts);
  installVariantKeyboardBindings(controller);
  installVariantOverlayUi(controller);
}

export function setVariantShortcuts(shortcuts: Partial<VariantShortcutConfig>): void {
  getVariantRuntimeController().actions.configureShortcuts(shortcuts);
}

export function getVariantRuntimeState(): RuntimeState {
  return getVariantRuntimeController().getSnapshot();
}
