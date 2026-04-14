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
