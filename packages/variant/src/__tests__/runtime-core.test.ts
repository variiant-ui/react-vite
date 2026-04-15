import {
  createVariantRuntimeController,
  defaultShortcuts,
  getRepresentativeMountedInstance,
} from "../runtime-core";

describe("variant runtime controller", () => {
  it("manages component and variant state without React or DOM", () => {
    const persistedSelections: Record<string, string>[] = [];
    const persistedShortcuts: object[] = [];

    const controller = createVariantRuntimeController({
      storage: {
        readSelections: () => ({}),
        writeSelections: (selections) => {
          persistedSelections.push({ ...selections });
        },
        readShortcutOverrides: () => ({}),
        writeShortcutOverrides: (shortcutConfig) => {
          persistedShortcuts.push(shortcutConfig);
        },
      },
    });

    controller.define({
      sourceId: "src/components/OrdersTable.tsx",
      displayName: "Orders Table",
      selected: "source",
      variantNames: ["source", "compact"],
    });
    controller.define({
      sourceId: "src/components/DashboardCard.tsx",
      displayName: "Dashboard Card",
      selected: "source",
      variantNames: ["source", "editorial"],
    });

    const unmountOrders = controller.mount("src/components/OrdersTable.tsx");
    const unmountDashboard = controller.mount("src/components/DashboardCard.tsx");

    expect(controller.getSnapshot().activeSourceId).toBe("src/components/OrdersTable.tsx");

    controller.actions.nextComponent();
    expect(controller.getSnapshot().activeSourceId).toBe("src/components/DashboardCard.tsx");

    controller.actions.previousComponent();
    controller.actions.nextVariant();
    expect(controller.getSelectedVariant("src/components/OrdersTable.tsx", "source")).toBe("compact");

    controller.actions.configureShortcuts({
      nextComponent: "meta+alt+j",
    });
    expect(controller.getSnapshot().shortcutConfig.nextComponent).toBe("meta+alt+j");
    expect(controller.getSnapshot().shortcutConfig.toggleCanvas).toEqual(defaultShortcuts.toggleCanvas);

    controller.actions.setAgentAvailability({
      enabled: true,
      commandLabel: "codex exec --json",
      message: null,
      streaming: "text",
      supportsImages: true,
    });
    controller.actions.setAgentPrompt("Create a denser table variant.");
    controller.actions.setAgentAttachActiveComponentScreenshot(true);
    controller.actions.startAgentRun();
    controller.actions.appendAgentLog("stdout", "Planning changes");
    controller.actions.finishAgentRun({
      sessionId: "session-123",
      exitCode: 0,
      changedFiles: [".variiant/variants/src/components/OrdersTable.tsx/default/compact.tsx"],
    });

    expect(controller.getSnapshot().agent.availability.enabled).toBe(true);
    expect(controller.getSnapshot().agent.availability.supportsImages).toBe(true);
    expect(controller.getSnapshot().agent.prompt).toBe("Create a denser table variant.");
    expect(controller.getSnapshot().agent.attachActiveComponentScreenshot).toBe(true);
    expect(controller.getSnapshot().agent.status).toBe("success");
    expect(controller.getSnapshot().agent.logs.at(-1)?.text).toBe("Planning changes");
    expect(controller.getSnapshot().agent.changedFiles).toEqual([
      ".variiant/variants/src/components/OrdersTable.tsx/default/compact.tsx",
    ]);

    expect(persistedSelections.at(-1)).toEqual({
      "src/components/DashboardCard.tsx": "source",
      "src/components/OrdersTable.tsx": "compact",
    });
    expect(persistedShortcuts.at(-1)).toMatchObject({
      ...defaultShortcuts,
      nextComponent: "meta+alt+j",
    });

    unmountOrders();
    unmountDashboard();
  });

  it("tracks overlay and canvas surfaces independently", () => {
    const controller = createVariantRuntimeController();

    controller.define({
      sourceId: "src/pages/home/dashboard.tsx",
      displayName: "Home Dashboard",
      selected: "source",
      variantNames: ["source", "editorial"],
    });

    controller.mount("src/pages/home/dashboard.tsx");

    expect(controller.getSnapshot().surface).toBe("closed");
    expect(controller.getSnapshot().overlayOpen).toBe(false);
    expect(controller.getSnapshot().canvasOpen).toBe(false);

    controller.actions.toggleOverlay();
    expect(controller.getSnapshot().surface).toBe("overlay");
    expect(controller.getSnapshot().overlayOpen).toBe(true);

    controller.actions.toggleCanvas();
    expect(controller.getSnapshot().surface).toBe("canvas");
    expect(controller.getSnapshot().canvasOpen).toBe(true);
    expect(controller.getSnapshot().overlayOpen).toBe(false);

    controller.actions.closeSurface();
    expect(controller.getSnapshot().surface).toBe("closed");
    expect(controller.getSnapshot().canvasOpen).toBe(false);
  });

  it("keeps temporary selections separate from persisted live selections", () => {
    const persistedSelections: Record<string, string>[] = [];
    const controller = createVariantRuntimeController({
      storage: {
        readSelections: () => ({}),
        writeSelections: (selections) => {
          persistedSelections.push({ ...selections });
        },
        readShortcutOverrides: () => ({}),
        writeShortcutOverrides: () => {},
      },
    });

    controller.define({
      sourceId: "src/components/MatrixCard.tsx",
      displayName: "Matrix Card",
      selected: "source",
      variantNames: ["source", "calm", "dense"],
    });
    controller.mount("src/components/MatrixCard.tsx");

    controller.actions.selectVariant("src/components/MatrixCard.tsx", "calm");
    expect(controller.getSnapshot().selections["src/components/MatrixCard.tsx"]).toBe("calm");

    controller.actions.setTemporarySelections({
      "src/components/MatrixCard.tsx": "dense",
    });
    expect(controller.getSelectedVariant("src/components/MatrixCard.tsx", "source")).toBe("dense");
    expect(controller.getSnapshot().effectiveSelections["src/components/MatrixCard.tsx"]).toBe("dense");
    expect(controller.getSnapshot().selections["src/components/MatrixCard.tsx"]).toBe("calm");

    controller.actions.setTemporarySelections(null);
    expect(controller.getSelectedVariant("src/components/MatrixCard.tsx", "source")).toBe("calm");
    expect(persistedSelections.at(-1)).toEqual({
      "src/components/MatrixCard.tsx": "calm",
    });
  });

  it("picks the first visible mounted instance as the representative instance", () => {
    const controller = createVariantRuntimeController();

    controller.define({
      sourceId: "src/components/OrdersTable.tsx",
      displayName: "Orders Table",
      selected: "source",
      variantNames: ["source", "compact"],
    });
    controller.mount("src/components/OrdersTable.tsx");

    controller.actions.registerMountedInstance({
      instanceId: "instance-a",
      sourceId: "src/components/OrdersTable.tsx",
      displayName: "Orders Table",
    });
    controller.actions.updateMountedInstance("instance-a", {
      width: 320,
      height: 160,
      isVisible: false,
    });

    controller.actions.registerMountedInstance({
      instanceId: "instance-b",
      sourceId: "src/components/OrdersTable.tsx",
      displayName: "Orders Table",
    });
    controller.actions.updateMountedInstance("instance-b", {
      width: 360,
      height: 180,
      isVisible: true,
    });

    const representative = getRepresentativeMountedInstance(
      controller.getSnapshot(),
      "src/components/OrdersTable.tsx",
    );
    expect(representative?.instanceId).toBe("instance-b");
    expect(representative?.width).toBe(360);
  });

  it("does not emit updates for unchanged mounted-instance measurements", () => {
    const controller = createVariantRuntimeController();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.define({
      sourceId: "src/components/OrdersTable.tsx",
      displayName: "Orders Table",
      selected: "source",
      variantNames: ["source", "compact"],
    });
    controller.mount("src/components/OrdersTable.tsx");
    controller.actions.registerMountedInstance({
      instanceId: "instance-a",
      sourceId: "src/components/OrdersTable.tsx",
      displayName: "Orders Table",
    });

    listener.mockClear();

    controller.actions.updateMountedInstance("instance-a", {
      width: 320,
      height: 160,
      isVisible: true,
    });
    expect(listener).toHaveBeenCalledTimes(1);

    listener.mockClear();

    controller.actions.updateMountedInstance("instance-a", {
      width: 320,
      height: 160,
      isVisible: true,
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
