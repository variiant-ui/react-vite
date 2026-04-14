import {
  createVariantRuntimeController,
  type VariantRuntimeController,
  type VariantRuntimeStorage,
} from "./runtime-core";

const storageKey = "variant:component-selections";
const shortcutStorageKey = "variant:shortcut-config";
const globalControllerKey = "__variant_runtime_controller__";

function createBrowserStorage(): VariantRuntimeStorage {
  return {
    readSelections() {
      if (typeof window === "undefined") {
        return {};
      }

      try {
        const raw = window.localStorage.getItem(storageKey);
        return raw ? (JSON.parse(raw) as Record<string, string>) : {};
      } catch {
        return {};
      }
    },
    writeSelections(selections) {
      if (typeof window === "undefined") {
        return;
      }

      window.localStorage.setItem(storageKey, JSON.stringify(selections));
    },
    readShortcutOverrides() {
      if (typeof window === "undefined") {
        return {};
      }

      try {
        const raw = window.localStorage.getItem(shortcutStorageKey);
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    },
    writeShortcutOverrides(shortcutConfig) {
      if (typeof window === "undefined") {
        return;
      }

      window.localStorage.setItem(shortcutStorageKey, JSON.stringify(shortcutConfig));
    },
  };
}

export function getVariantRuntimeController(): VariantRuntimeController {
  const target = globalThis as typeof globalThis & {
    [globalControllerKey]?: VariantRuntimeController;
  };

  if (!target[globalControllerKey]) {
    target[globalControllerKey] = createVariantRuntimeController({
      storage: createBrowserStorage(),
    });
  }

  return target[globalControllerKey]!;
}
