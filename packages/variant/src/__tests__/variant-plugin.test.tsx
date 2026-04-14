import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import React from "react";

import {
  createVariantProxy,
  getVariantRuntimeState,
  installVariantOverlay,
} from "../runtime";
import { variantPlugin } from "../plugin";

describe("variant runtime proxy", () => {
  it("renders the selected variant from the runtime store", () => {
    const OrdersTable = createVariantProxy({
      sourceId: "src/components/OrdersTable.tsx",
      displayName: "Orders Table",
      selected: "source",
      variants: {
        source: function SourceVariant() {
          return <div>Source table</div>;
        },
        cta: function CtaVariant() {
          return <div>Go to orders workspace</div>;
        },
      },
    });

    render(<OrdersTable />);
    expect(screen.getByText("Source table")).toBeInTheDocument();
  });

  it("supports global component cycling with overlay open or closed", () => {
    const DashboardCard = createVariantProxy({
      sourceId: "src/components/DashboardCard.tsx",
      displayName: "Dashboard Card",
      selected: "source",
      variants: {
        source: function DashboardCardSource() {
          return <div>Dashboard card source</div>;
        },
        compact: function DashboardCardCompact() {
          return <div>Dashboard card compact</div>;
        },
      },
    });

    const DataGrid = createVariantProxy({
      sourceId: "src/components/DataGrid.tsx",
      displayName: "Data Grid",
      selected: "source",
      variants: {
        source: function DataGridSource() {
          return <div>Data grid source</div>;
        },
        editorial: function DataGridEditorial() {
          return <div>Data grid editorial</div>;
        },
      },
    });

    const OrdersTable = createVariantProxy({
      sourceId: "src/components/OrdersTableRuntime.tsx",
      displayName: "Orders Table Runtime",
      selected: "source",
      variants: {
        source: function OrdersTableSource() {
          return <div>Orders table runtime</div>;
        },
      },
    });

    render(
      <>
        <DashboardCard />
        <DataGrid />
        <OrdersTable />
      </>,
    );

    installVariantOverlay();

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        metaKey: true,
        altKey: true,
        bubbles: true,
      }),
    );
    expect(getVariantRuntimeState().activeSourceId).toBe("src/components/DataGrid.tsx");

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        metaKey: true,
        altKey: true,
        bubbles: true,
      }),
    );
    expect(getVariantRuntimeState().activeSourceId).toBe("src/components/OrdersTableRuntime.tsx");

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: ".",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    const picker = document.querySelector(
      '[data-variant-active-source="true"]',
    ) as HTMLSelectElement | null;
    expect(picker).not.toBeNull();

    picker!.value = "src/components/OrdersTableRuntime.tsx";
    picker!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(getVariantRuntimeState().activeSourceId).toBe("src/components/OrdersTableRuntime.tsx");

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        metaKey: true,
        altKey: true,
        bubbles: true,
      }),
    );
    expect(getVariantRuntimeState().activeSourceId).toBe("src/components/DataGrid.tsx");

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        metaKey: true,
        altKey: true,
        bubbles: true,
      }),
    );
    expect(getVariantRuntimeState().activeSourceId).toBe("src/components/OrdersTableRuntime.tsx");
  });
});

describe("variant plugin", () => {
  it("builds a proxy module for a component with a top-level .variants config", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variant-plugin-"));
    const sourcePath = path.join(tempRoot, "src", "components");
    const variantsPath = path.join(tempRoot, ".variants", "OrdersTable");
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(variantsPath, { recursive: true });
    fs.writeFileSync(path.join(sourcePath, "OrdersTable.tsx"), "export default function OrdersTable(){ return null; }");
    fs.writeFileSync(path.join(variantsPath, "compact.tsx"), "export default function Compact(){ return null; }");
    fs.writeFileSync(
      path.join(variantsPath, "variant.json"),
      JSON.stringify(
        {
          source: "src/components/OrdersTable.tsx",
          selected: "compact",
          variants: ["compact"],
        },
        null,
        2,
      ),
    );

    process.chdir(tempRoot);
    const plugin = variantPlugin({ projectRoot: tempRoot });
    plugin.configResolved?.({
      root: tempRoot,
    } as never);

    const resolved = await plugin.resolveId?.call(
      {
        resolve: async () => ({ id: path.join(tempRoot, "src", "components", "OrdersTable.tsx") }),
      } as never,
      "./components/OrdersTable",
      path.join(tempRoot, "src", "App.tsx"),
      {},
    );

    expect(String(resolved)).toContain("variant-proxy:");

    const loaded = await plugin.load?.call(
      {
        meta: { watchMode: true },
      } as never,
      String(resolved),
    );

    expect(String(loaded)).toContain('import * as SourceModule from');
    expect(String(loaded)).toContain('import DefaultCompactVariant from');
    expect(String(loaded)).toContain('createVariantProxy');
    expect(String(loaded)).toContain('installVariantOverlay()');
  });

  it("builds a proxy module for a named export target", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variant-plugin-named-"));
    const sourcePath = path.join(tempRoot, "src", "features");
    const variantsPath = path.join(
      tempRoot,
      ".variants",
      "src",
      "features",
      "dashboard.tsx",
      "Dashboard",
    );
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(variantsPath, { recursive: true });
    fs.writeFileSync(
      path.join(sourcePath, "dashboard.tsx"),
      "export function Dashboard(){ return null; }",
    );
    fs.writeFileSync(
      path.join(variantsPath, "sparkline.tsx"),
      "export default function Sparkline(){ return null; }",
    );

    process.chdir(tempRoot);
    const plugin = variantPlugin({ projectRoot: tempRoot });
    plugin.configResolved?.({
      root: tempRoot,
    } as never);

    const resolved = await plugin.resolveId?.call(
      {
        resolve: async () => ({ id: path.join(tempRoot, "src", "features", "dashboard.tsx") }),
      } as never,
      "./features/dashboard",
      path.join(tempRoot, "src", "App.tsx"),
      {},
    );

    const loaded = await plugin.load?.call(
      {
        meta: { watchMode: true },
      } as never,
      String(resolved),
    );

    expect(String(loaded)).toContain('import * as SourceModule from');
    expect(String(loaded)).toContain('SourceModule["Dashboard"]');
    expect(String(loaded)).toContain('sourceId: "src/features/dashboard.tsx#Dashboard"');
    expect(String(loaded)).toContain('export { DashboardVariantVariantProxy as Dashboard };');

    const productionLoaded = await plugin.load?.call(
      {
        meta: { watchMode: false },
      } as never,
      String(resolved),
    );

    expect(String(productionLoaded)).toContain('export * from');
    expect(String(productionLoaded)).toContain('export * from');
  });

  it("builds a proxy module for a conventional default export target", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variant-plugin-default-"));
    const sourcePath = path.join(tempRoot, "src", "features", "dashboard");
    const variantsPath = path.join(
      tempRoot,
      ".variants",
      "src",
      "features",
      "dashboard",
      "index.tsx",
      "default",
    );
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(variantsPath, { recursive: true });
    fs.writeFileSync(
      path.join(sourcePath, "index.tsx"),
      "export default function Dashboard(){ return null; }\nexport const helper = 1;",
    );
    fs.writeFileSync(
      path.join(variantsPath, "sparkline.tsx"),
      "export default function Sparkline(){ return null; }",
    );

    process.chdir(tempRoot);
    const plugin = variantPlugin({ projectRoot: tempRoot });
    plugin.configResolved?.({
      root: tempRoot,
    } as never);

    const resolved = await plugin.resolveId?.call(
      {
        resolve: async () => ({ id: path.join(tempRoot, "src", "features", "dashboard", "index.tsx") }),
      } as never,
      "./features/dashboard",
      path.join(tempRoot, "src", "App.tsx"),
      {},
    );

    const loaded = await plugin.load?.call(
      {
        meta: { watchMode: true },
      } as never,
      String(resolved),
    );

    expect(String(loaded)).toContain('export * from');
    expect(String(loaded)).toContain('import * as SourceModule from');
    expect(String(loaded)).toContain('sourceId: "src/features/dashboard/index.tsx"');
    expect(String(loaded)).toContain('export default DefaultVariantVariantProxy;');
  });
});
