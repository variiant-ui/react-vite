type Direction = 1 | -1;

export type Shortcut = string | string[];

export type VariantShortcutConfig = {
  toggleOverlay: Shortcut;
  nextComponent: Shortcut;
  previousComponent: Shortcut;
  nextVariant: Shortcut;
  previousVariant: Shortcut;
  closeOverlay: Shortcut;
};

export const defaultShortcuts: VariantShortcutConfig = {
  toggleOverlay: ["meta+shift+.", "ctrl+shift+."],
  nextComponent: ["meta+alt+arrowdown", "ctrl+alt+arrowdown"],
  previousComponent: ["meta+alt+arrowup", "ctrl+alt+arrowup"],
  nextVariant: ["meta+shift+arrowright", "ctrl+shift+arrowright"],
  previousVariant: ["meta+shift+arrowleft", "ctrl+shift+arrowleft"],
  closeOverlay: "escape",
};

export type VariantDefinition = {
  sourceId: string;
  displayName: string;
  selected: string;
  variantNames: string[];
};

export type RuntimeComponentRecord = VariantDefinition & {
  mountedCount: number;
};

export type RuntimeState = {
  overlayOpen: boolean;
  activeSourceId: string | null;
  components: RuntimeComponentRecord[];
};

export type VariantRuntimeSnapshot = RuntimeState & {
  selections: Record<string, string>;
  shortcutConfig: VariantShortcutConfig;
};

export type VariantRuntimeStorage = {
  readSelections: () => Record<string, string>;
  writeSelections: (selections: Record<string, string>) => void;
  readShortcutOverrides: () => Partial<VariantShortcutConfig>;
  writeShortcutOverrides: (shortcutConfig: VariantShortcutConfig) => void;
};

export type VariantRuntimeController = {
  define: (definition: VariantDefinition) => void;
  mount: (sourceId: string) => () => void;
  getSelectedVariant: (sourceId: string, fallback: string) => string;
  getSnapshot: () => VariantRuntimeSnapshot;
  subscribe: (listener: () => void) => () => void;
  actions: {
    toggleOverlay: () => void;
    closeOverlay: () => void;
    nextComponent: () => void;
    previousComponent: () => void;
    nextVariant: () => void;
    previousVariant: () => void;
    selectComponent: (sourceId: string | null) => void;
    selectVariant: (sourceId: string, variantName: string) => void;
    configureShortcuts: (overrides?: Partial<VariantShortcutConfig>) => void;
  };
};

type ControllerState = RuntimeState & {
  selections: Record<string, string>;
  shortcutConfig: VariantShortcutConfig;
};

function rotate<T>(items: T[], currentIndex: number, direction: Direction): T | null {
  if (items.length === 0) {
    return null;
  }

  const nextIndex = (currentIndex + direction + items.length) % items.length;
  return items[nextIndex] ?? null;
}

function getMountedComponents(state: ControllerState): RuntimeComponentRecord[] {
  return state.components.filter((component) => component.mountedCount > 0);
}

function getActiveMountedComponent(state: ControllerState): RuntimeComponentRecord | null {
  const mounted = getMountedComponents(state);
  return mounted.find((component) => component.sourceId === state.activeSourceId) ?? mounted[0] ?? null;
}

export function createVariantRuntimeController(options: {
  storage?: VariantRuntimeStorage;
} = {}): VariantRuntimeController {
  const storage = options.storage;
  const listeners = new Set<() => void>();
  const definitions = new Map<string, VariantDefinition>();
  const mountedCounts = new Map<string, number>();
  const state: ControllerState = {
    overlayOpen: false,
    activeSourceId: null,
    components: [],
    selections: storage?.readSelections() ?? {},
    shortcutConfig: {
      ...defaultShortcuts,
      ...(storage?.readShortcutOverrides() ?? {}),
    },
  };

  const emit = (): void => {
    state.components = Array.from(definitions.values())
      .map((definition) => ({
        ...definition,
        selected: state.selections[definition.sourceId] ?? definition.selected,
        mountedCount: mountedCounts.get(definition.sourceId) ?? 0,
      }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));

    const mounted = getMountedComponents(state);
    if (!mounted.some((component) => component.sourceId === state.activeSourceId)) {
      state.activeSourceId = mounted[0]?.sourceId ?? null;
    }

    for (const listener of listeners) {
      listener();
    }
  };

  const persistSelections = (): void => {
    storage?.writeSelections(state.selections);
  };

  const persistShortcuts = (): void => {
    storage?.writeShortcutOverrides(state.shortcutConfig);
  };

  const moveActiveComponent = (direction: Direction): void => {
    const mounted = getMountedComponents(state);
    if (mounted.length === 0) {
      return;
    }

    const currentIndex = mounted.findIndex((component) => component.sourceId === state.activeSourceId);
    const current = currentIndex >= 0 ? currentIndex : 0;
    const next = rotate(mounted, current, direction);
    if (!next) {
      return;
    }

    state.activeSourceId = next.sourceId;
    emit();
  };

  const moveVariant = (direction: Direction): void => {
    const active = getActiveMountedComponent(state);
    if (!active) {
      return;
    }

    const currentIndex = active.variantNames.findIndex(
      (variantName) => variantName === (state.selections[active.sourceId] ?? active.selected),
    );
    const current = currentIndex >= 0 ? currentIndex : 0;
    const next = rotate(active.variantNames, current, direction);
    if (!next) {
      return;
    }

    state.selections[active.sourceId] = next;
    persistSelections();
    emit();
  };

  return {
    define(definition) {
      const existing = definitions.get(definition.sourceId);
      definitions.set(definition.sourceId, {
        ...definition,
        displayName: definition.displayName || existing?.displayName || definition.sourceId,
        variantNames: Array.from(
          new Set([...(existing?.variantNames ?? []), ...definition.variantNames]),
        ),
      });

      if (!(definition.sourceId in state.selections)) {
        state.selections[definition.sourceId] = definition.selected;
        persistSelections();
      }

      emit();
    },
    mount(sourceId) {
      mountedCounts.set(sourceId, (mountedCounts.get(sourceId) ?? 0) + 1);
      emit();
      return () => {
        mountedCounts.set(sourceId, Math.max((mountedCounts.get(sourceId) ?? 1) - 1, 0));
        emit();
      };
    },
    getSelectedVariant(sourceId, fallback) {
      return state.selections[sourceId] ?? fallback;
    },
    getSnapshot() {
      return {
        overlayOpen: state.overlayOpen,
        activeSourceId: state.activeSourceId,
        components: state.components,
        selections: state.selections,
        shortcutConfig: state.shortcutConfig,
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    actions: {
      toggleOverlay() {
        state.overlayOpen = !state.overlayOpen;
        emit();
      },
      closeOverlay() {
        if (!state.overlayOpen) {
          return;
        }

        state.overlayOpen = false;
        emit();
      },
      nextComponent() {
        moveActiveComponent(1);
      },
      previousComponent() {
        moveActiveComponent(-1);
      },
      nextVariant() {
        moveVariant(1);
      },
      previousVariant() {
        moveVariant(-1);
      },
      selectComponent(sourceId) {
        state.activeSourceId = sourceId;
        emit();
      },
      selectVariant(sourceId, variantName) {
        const component = state.components.find((candidate) => candidate.sourceId === sourceId);
        if (!component || !component.variantNames.includes(variantName)) {
          return;
        }

        state.selections[sourceId] = variantName;
        persistSelections();
        emit();
      },
      configureShortcuts(overrides) {
        if (!overrides) {
          return;
        }

        state.shortcutConfig = {
          ...state.shortcutConfig,
          ...overrides,
        };
        persistShortcuts();
        emit();
      },
    },
  };
}
