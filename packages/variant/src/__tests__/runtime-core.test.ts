import { createVariantRuntimeController, defaultShortcuts } from "../runtime-core";

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
});
