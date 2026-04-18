type Direction = 1 | -1;

export type Shortcut = string | string[];

export type VariantShortcutConfig = {
  toggleOverlay: Shortcut;
  toggleCanvas: Shortcut;
  nextComponent: Shortcut;
  previousComponent: Shortcut;
  nextVariant: Shortcut;
  previousVariant: Shortcut;
  closeOverlay: Shortcut;
};

export const defaultShortcuts: VariantShortcutConfig = {
  toggleOverlay: ["meta+shift+.", "ctrl+shift+."],
  toggleCanvas: ["meta+shift+,", "ctrl+shift+,"],
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

export type VariantSurface = "closed" | "overlay" | "canvas";

export type VariantCanvasMode = "components";
export type VariantDockMode = "ideate" | "review" | "tweak";
export type VariantToolMode = "none" | "inspect" | "comment" | "sketch" | "tweak";

export type VariantCanvasCamera = {
  x: number;
  y: number;
  zoom: number;
};

export type MountedVariantInstance = {
  instanceId: string;
  sourceId: string;
  displayName: string;
  width: number | null;
  preferredWidth: number | null;
  height: number | null;
  mountedAt: number;
  isVisible: boolean;
};

export type VariantCanvasState = {
  mode: VariantCanvasMode;
  camera: VariantCanvasCamera;
  targetSourceId: string | null;
};

export type VariantReviewResult = {
  sourceId: string;
  changedFiles: string[];
  variantNames: string[];
};

export type VariantAgentStreamingMode = "auto" | "text" | "none";

export type VariantAgentAvailability = {
  enabled: boolean;
  commandLabel: string | null;
  message: string | null;
  streaming: VariantAgentStreamingMode | null;
  supportsImages: boolean;
};

export type VariantAgentLogEntry = {
  id: number;
  stream: "stdout" | "stderr" | "system";
  text: string;
};

export type VariantAgentStatus = "idle" | "running" | "success" | "error";

export type VariantAgentState = {
  availability: VariantAgentAvailability;
  prompt: string;
  attachActiveComponentScreenshot: boolean;
  status: VariantAgentStatus;
  logs: VariantAgentLogEntry[];
  sessionId: string | null;
  exitCode: number | null;
  changedFiles: string[];
  error: string | null;
};

export type RuntimeState = {
  surface: VariantSurface;
  overlayOpen: boolean;
  canvasOpen: boolean;
  dockMode: VariantDockMode;
  toolMode: VariantToolMode;
  activeSourceId: string | null;
  components: RuntimeComponentRecord[];
  mountedInstances: MountedVariantInstance[];
  canvas: VariantCanvasState;
  agent: VariantAgentState;
  reviewResults: VariantReviewResult[];
};

export type VariantRuntimeSnapshot = RuntimeState & {
  selections: Record<string, string>;
  temporarySelections: Record<string, string> | null;
  effectiveSelections: Record<string, string>;
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
    openOverlay: () => void;
    toggleOverlay: () => void;
    closeOverlay: () => void;
    openCanvas: () => void;
    toggleCanvas: () => void;
    closeCanvas: () => void;
    closeSurface: () => void;
    setDockMode: (mode: VariantDockMode) => void;
    setToolMode: (mode: VariantToolMode) => void;
    setCanvasMode: (mode: VariantCanvasMode) => void;
    setCanvasTarget: (sourceId: string | null) => void;
    setCanvasCamera: (camera: VariantCanvasCamera) => void;
    panCanvas: (deltaX: number, deltaY: number) => void;
    resetCanvasCamera: () => void;
    nextComponent: () => void;
    previousComponent: () => void;
    nextVariant: () => void;
    previousVariant: () => void;
    selectComponent: (sourceId: string | null) => void;
    selectVariant: (sourceId: string, variantName: string) => void;
    setTemporarySelections: (selections: Record<string, string> | null) => void;
    registerMountedInstance: (instance: {
      instanceId: string;
      sourceId: string;
      displayName: string;
    }) => void;
    updateMountedInstance: (
      instanceId: string,
      patch: Partial<Pick<MountedVariantInstance, "width" | "preferredWidth" | "height" | "isVisible">>,
    ) => void;
    unregisterMountedInstance: (instanceId: string) => void;
    configureShortcuts: (overrides?: Partial<VariantShortcutConfig>) => void;
    setAgentAvailability: (
      availability: Partial<VariantAgentAvailability> & { enabled: boolean },
    ) => void;
    setAgentPrompt: (prompt: string) => void;
    setAgentAttachActiveComponentScreenshot: (enabled: boolean) => void;
    startAgentRun: () => void;
    appendAgentLog: (stream: VariantAgentLogEntry["stream"], text: string) => void;
    replaceLatestAgentLog: (stream: VariantAgentLogEntry["stream"], text: string) => void;
    finishAgentRun: (result?: {
      sessionId?: string | null;
      exitCode?: number | null;
      changedFiles?: string[];
      error?: string | null;
    }) => void;
    clearAgentRun: () => void;
  };
};

type ControllerState = RuntimeState & {
  selections: Record<string, string>;
  temporarySelections: Record<string, string> | null;
  shortcutConfig: VariantShortcutConfig;
};

const defaultAgentAvailability: VariantAgentAvailability = {
  enabled: false,
  commandLabel: null,
  message: "Configure variiant.config.json to enable the local agent bridge.",
  streaming: null,
  supportsImages: false,
};

function parseVariantReviewSourceId(changedFile: string): {
  sourceId: string;
  variantName: string;
} | null {
  const normalized = changedFile.replaceAll("\\", "/");
  const marker = ".variiant/variants/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const relativePath = normalized.slice(markerIndex + marker.length);
  const segments = relativePath.split("/").filter(Boolean);
  const sourceSegmentIndex = segments.findIndex((segment) =>
    [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs", ".cts", ".cjs"].some((extension) => segment.endsWith(extension))
  );
  if (sourceSegmentIndex === -1) {
    return null;
  }

  const sourceRelativePath = segments.slice(0, sourceSegmentIndex + 1).join("/");
  const exportName = segments[sourceSegmentIndex + 1];
  const variantFileName = segments[sourceSegmentIndex + 2];
  if (!exportName || !variantFileName) {
    return null;
  }

  const extensionIndex = variantFileName.lastIndexOf(".");
  if (extensionIndex <= 0) {
    return null;
  }

  const variantName = variantFileName.slice(0, extensionIndex);
  if (!variantName) {
    return null;
  }

  return {
    sourceId: exportName === "default" ? sourceRelativePath : `${sourceRelativePath}#${exportName}`,
    variantName,
  };
}

function inferReviewResults(changedFiles: string[]): VariantReviewResult[] {
  const grouped = new Map<string, VariantReviewResult>();

  for (const changedFile of changedFiles) {
    const parsed = parseVariantReviewSourceId(changedFile);
    if (!parsed) {
      continue;
    }

    const existing = grouped.get(parsed.sourceId);
    if (existing) {
      if (!existing.changedFiles.includes(changedFile)) {
        existing.changedFiles.push(changedFile);
      }
      if (!existing.variantNames.includes(parsed.variantName)) {
        existing.variantNames.push(parsed.variantName);
      }
      continue;
    }

    grouped.set(parsed.sourceId, {
      sourceId: parsed.sourceId,
      changedFiles: [changedFile],
      variantNames: [parsed.variantName],
    });
  }

  return Array.from(grouped.values()).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

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

function getEffectiveSelections(state: ControllerState): Record<string, string> {
  return {
    ...state.selections,
    ...(state.temporarySelections ?? {}),
  };
}

export function getRepresentativeMountedInstance(
  snapshot: Pick<VariantRuntimeSnapshot, "mountedInstances">,
  sourceId: string,
): MountedVariantInstance | null {
  const candidates = snapshot.mountedInstances.filter((instance) => instance.sourceId === sourceId);
  if (candidates.length === 0) {
    return null;
  }

  return candidates.find((instance) => instance.isVisible) ?? candidates[0] ?? null;
}

function shallowEqualRecord(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

function mountedInstanceEquals(
  left: MountedVariantInstance,
  right: MountedVariantInstance,
): boolean {
  return (
    left.instanceId === right.instanceId
    && left.sourceId === right.sourceId
    && left.displayName === right.displayName
    && left.width === right.width
    && left.preferredWidth === right.preferredWidth
    && left.height === right.height
    && left.mountedAt === right.mountedAt
    && left.isVisible === right.isVisible
  );
}

export function createVariantRuntimeController(options: {
  storage?: VariantRuntimeStorage;
} = {}): VariantRuntimeController {
  const storage = options.storage;
  const listeners = new Set<() => void>();
  const definitions = new Map<string, VariantDefinition>();
  const mountedCounts = new Map<string, number>();
  const mountedInstances = new Map<string, MountedVariantInstance>();
  const state: ControllerState = {
    surface: "closed",
    overlayOpen: false,
    canvasOpen: false,
    dockMode: "ideate",
    toolMode: "none",
    activeSourceId: null,
    components: [],
    mountedInstances: [],
    canvas: {
      mode: "components",
      camera: {
        x: 0,
        y: 0,
        zoom: 1,
      },
      targetSourceId: null,
    },
    agent: {
      availability: defaultAgentAvailability,
      prompt: "",
      attachActiveComponentScreenshot: false,
      status: "idle",
      logs: [],
      sessionId: null,
      exitCode: null,
      changedFiles: [],
      error: null,
    },
    reviewResults: [],
    selections: storage?.readSelections() ?? {},
    temporarySelections: null,
    shortcutConfig: {
      ...defaultShortcuts,
      ...(storage?.readShortcutOverrides() ?? {}),
    },
  };
  let snapshotCache!: VariantRuntimeSnapshot;

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

    state.mountedInstances = Array.from(mountedInstances.values())
      .filter((instance) => instance.sourceId in state.selections || definitions.has(instance.sourceId))
      .sort((left, right) => left.mountedAt - right.mountedAt);

    state.overlayOpen = state.surface === "overlay";
    state.canvasOpen = state.surface === "canvas";

    if (!mounted.some((component) => component.sourceId === state.canvas.targetSourceId)) {
      state.canvas.targetSourceId = state.activeSourceId ?? mounted[0]?.sourceId ?? null;
    }

    const effectiveSelections = getEffectiveSelections(state);
    snapshotCache = {
      surface: state.surface,
      overlayOpen: state.overlayOpen,
      canvasOpen: state.canvasOpen,
      dockMode: state.dockMode,
      toolMode: state.toolMode,
      activeSourceId: state.activeSourceId,
      components: state.components,
      mountedInstances: state.mountedInstances,
      canvas: state.canvas,
      agent: state.agent,
      reviewResults: state.reviewResults,
      selections: state.selections,
      temporarySelections: state.temporarySelections,
      effectiveSelections,
      shortcutConfig: state.shortcutConfig,
    };

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

    const effectiveSelections = getEffectiveSelections(state);
    const currentIndex = active.variantNames.findIndex(
      (variantName) => variantName === (effectiveSelections[active.sourceId] ?? active.selected),
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

  emit();

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
      return state.temporarySelections?.[sourceId] ?? state.selections[sourceId] ?? fallback;
    },
    getSnapshot() {
      return snapshotCache;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    actions: {
      openOverlay() {
        state.surface = "overlay";
        emit();
      },
      toggleOverlay() {
        state.surface = state.surface === "overlay" ? "closed" : "overlay";
        emit();
      },
      closeOverlay() {
        if (state.surface !== "overlay") {
          return;
        }

        state.surface = "closed";
        emit();
      },
      openCanvas() {
        state.surface = "canvas";
        state.dockMode = "review";
        emit();
      },
      toggleCanvas() {
        state.surface = state.surface === "canvas" ? "closed" : "canvas";
        if (state.surface === "canvas") {
          state.dockMode = "review";
        }
        emit();
      },
      closeCanvas() {
        if (state.surface !== "canvas") {
          return;
        }

        state.surface = "closed";
        emit();
      },
      closeSurface() {
        if (state.surface === "closed") {
          return;
        }

        state.surface = "closed";
        if (state.toolMode === "sketch") {
          state.toolMode = "none";
        }
        emit();
      },
      setDockMode(mode) {
        if (state.dockMode === mode) {
          return;
        }

        state.dockMode = mode;
        if (mode !== "tweak" && state.toolMode === "tweak") {
          state.toolMode = "none";
        }
        emit();
      },
      setToolMode(mode) {
        if (state.toolMode === mode) {
          return;
        }

        state.toolMode = mode;
        if (mode === "tweak") {
          state.dockMode = "tweak";
        } else if (state.dockMode === "tweak") {
          state.dockMode = "ideate";
        }
        emit();
      },
      setCanvasMode(mode) {
        if (state.canvas.mode === mode) {
          return;
        }

        state.canvas = {
          ...state.canvas,
          mode,
        };
        emit();
      },
      setCanvasTarget(sourceId) {
        state.canvas = {
          ...state.canvas,
          targetSourceId: sourceId,
        };
        state.activeSourceId = sourceId;
        emit();
      },
      setCanvasCamera(camera) {
        state.canvas = {
          ...state.canvas,
          camera,
        };
        emit();
      },
      panCanvas(deltaX, deltaY) {
        state.canvas = {
          ...state.canvas,
          camera: {
            ...state.canvas.camera,
            x: state.canvas.camera.x + deltaX,
            y: state.canvas.camera.y + deltaY,
          },
        };
        emit();
      },
      resetCanvasCamera() {
        state.canvas = {
          ...state.canvas,
          camera: {
            x: 0,
            y: 0,
            zoom: 1,
          },
        };
        emit();
      },
      nextComponent() {
        moveActiveComponent(1);
        state.canvas = {
          ...state.canvas,
          targetSourceId: state.activeSourceId,
        };
        emit();
      },
      previousComponent() {
        moveActiveComponent(-1);
        state.canvas = {
          ...state.canvas,
          targetSourceId: state.activeSourceId,
        };
        emit();
      },
      nextVariant() {
        moveVariant(1);
      },
      previousVariant() {
        moveVariant(-1);
      },
      selectComponent(sourceId) {
        state.activeSourceId = sourceId;
        state.canvas = {
          ...state.canvas,
          targetSourceId: sourceId,
        };
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
      setTemporarySelections(selections) {
        if (state.temporarySelections === selections) {
          return;
        }

        if (
          state.temporarySelections
          && selections
          && shallowEqualRecord(state.temporarySelections, selections)
        ) {
          return;
        }

        state.temporarySelections = selections;
        emit();
      },
      registerMountedInstance(instance) {
        const existing = mountedInstances.get(instance.instanceId);
        const nextInstance = {
          instanceId: instance.instanceId,
          sourceId: instance.sourceId,
          displayName: instance.displayName,
          width: existing?.width ?? null,
          preferredWidth: existing?.preferredWidth ?? null,
          height: existing?.height ?? null,
          isVisible: existing?.isVisible ?? false,
          mountedAt: existing?.mountedAt ?? Date.now(),
        };

        if (existing && mountedInstanceEquals(existing, nextInstance)) {
          return;
        }

        mountedInstances.set(instance.instanceId, nextInstance);
        emit();
      },
      updateMountedInstance(instanceId, patch) {
        const existing = mountedInstances.get(instanceId);
        if (!existing) {
          return;
        }

        const nextInstance = {
          ...existing,
          ...patch,
        };

        if (mountedInstanceEquals(existing, nextInstance)) {
          return;
        }

        mountedInstances.set(instanceId, nextInstance);
        emit();
      },
      unregisterMountedInstance(instanceId) {
        if (!mountedInstances.has(instanceId)) {
          return;
        }

        mountedInstances.delete(instanceId);
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
      setAgentAvailability(availability) {
        state.agent.availability = {
          ...state.agent.availability,
          ...availability,
        };
        emit();
      },
      setAgentPrompt(prompt) {
        state.agent.prompt = prompt;
        emit();
      },
      setAgentAttachActiveComponentScreenshot(enabled) {
        state.agent.attachActiveComponentScreenshot = enabled;
        emit();
      },
      startAgentRun() {
        state.dockMode = "ideate";
        state.agent.status = "running";
        state.agent.logs = [];
        state.agent.sessionId = null;
        state.agent.exitCode = null;
        state.agent.changedFiles = [];
        state.agent.error = null;
        emit();
      },
      appendAgentLog(stream, text) {
        if (!text) {
          return;
        }

        state.agent.logs = [
          ...state.agent.logs,
          {
            id: state.agent.logs.length + 1,
            stream,
            text,
          },
        ];
        emit();
      },
      replaceLatestAgentLog(stream, text) {
        if (!text) {
          return;
        }

        if (state.agent.logs.length === 0) {
          state.agent.logs = [
            {
              id: 1,
              stream,
              text,
            },
          ];
          emit();
          return;
        }

        const nextLogs = [...state.agent.logs];
        const lastEntry = nextLogs.at(-1);
        if (!lastEntry) {
          return;
        }

        nextLogs[nextLogs.length - 1] = {
          ...lastEntry,
          stream,
          text,
        };
        state.agent.logs = nextLogs;
        emit();
      },
      finishAgentRun(result = {}) {
        const exitCode = result.exitCode ?? 0;
        const reviewResults = inferReviewResults(result.changedFiles ?? []);
        state.agent.status = result.error || exitCode !== 0 ? "error" : "success";
        state.agent.sessionId = result.sessionId ?? state.agent.sessionId;
        state.agent.exitCode = result.exitCode ?? null;
        state.agent.changedFiles = result.changedFiles ?? [];
        state.agent.error = result.error ?? null;
        if (reviewResults.length > 0) {
          state.reviewResults = reviewResults;
          state.dockMode = "review";
          if (reviewResults.some((entry) => entry.sourceId === state.activeSourceId)) {
            state.canvas = {
              ...state.canvas,
              targetSourceId: state.activeSourceId,
            };
          } else {
            state.canvas = {
              ...state.canvas,
              targetSourceId: reviewResults[0]?.sourceId ?? state.canvas.targetSourceId,
            };
          }
        }
        emit();
      },
      clearAgentRun() {
        state.agent.status = "idle";
        state.agent.logs = [];
        state.agent.sessionId = null;
        state.agent.exitCode = null;
        state.agent.changedFiles = [];
        state.agent.error = null;
        state.dockMode = state.reviewResults.length > 0 ? "review" : "ideate";
        emit();
      },
    },
  };
}
