import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { variantWebpackPlugin } from "../plugin-webpack";

type BeforeResolveCallback = (
  resolveData: {
    request?: string;
    context?: string;
    contextInfo?: {
      issuer?: string;
    };
  },
  done: (error?: Error | null, result?: unknown) => void,
) => void;

function createFakeCompiler(projectRoot: string, mode: "development" | "production" = "development") {
  let beforeResolveCallback: BeforeResolveCallback | null = null;
  const compiler = {
    context: projectRoot,
    options: {
      context: projectRoot,
      mode,
      entry: "./src/App.tsx" as unknown,
      resolve: {},
    },
    resolverFactory: {
      get: () => ({
        resolve: (
          _contextInfo: Record<string, unknown>,
          context: string,
          request: string,
          _resolveContext: Record<string, unknown>,
          callback: (error: Error | null, result?: string | false) => void,
        ) => {
          const resolved = resolveFixtureImport(context, request);
          callback(resolved ? null : new Error(`Cannot resolve ${request}`), resolved ?? false);
        },
      }),
    },
    hooks: {
      beforeRun: {
        tapPromise: vi.fn(async (_name: string, callback: () => Promise<void>) => {
          await callback();
        }),
      },
      watchRun: {
        tapPromise: vi.fn(async (_name: string, callback: () => Promise<void>) => {
          await callback();
        }),
      },
      thisCompilation: {
        tap: vi.fn(),
      },
      normalModuleFactory: {
        tap: vi.fn((_name: string, callback: (factory: unknown) => void) => {
          callback({
            hooks: {
              beforeResolve: {
                tapAsync: vi.fn((_hookName: string, hookCallback: BeforeResolveCallback) => {
                  beforeResolveCallback = hookCallback;
                }),
              },
            },
          });
        }),
      },
    },
  };

  return {
    compiler,
    getBeforeResolveCallback: () => {
      expect(beforeResolveCallback).not.toBeNull();
      return beforeResolveCallback!;
    },
  };
}

function resolveFixtureImport(context: string, request: string): string | null {
  const candidates = request.startsWith(".")
    ? [path.resolve(context, request)]
    : [request];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }

    for (const extension of [".tsx", ".ts", ".jsx", ".js"]) {
      const withExtension = `${candidate}${extension}`;
      if (fs.existsSync(withExtension) && fs.statSync(withExtension).isFile()) {
        return withExtension;
      }
    }
  }

  return null;
}

describe("variantWebpackPlugin", () => {
  it("generates physical dev proxy modules and redirects variant-enabled imports", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variiant-webpack-"));
    const sourceDir = path.join(projectRoot, "src", "components");
    const variantDir = path.join(
      projectRoot,
      ".variiant",
      "variants",
      "src",
      "components",
      "OrdersTable.tsx",
      "default",
    );
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(variantDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "OrdersTable.tsx"), "export default function OrdersTable(){ return null; }");
    fs.writeFileSync(path.join(variantDir, "compact.tsx"), "export default function Compact(){ return null; }");

    const { compiler, getBeforeResolveCallback } = createFakeCompiler(projectRoot);
    variantWebpackPlugin({ projectRoot }).apply(compiler as never);

    expect(compiler.options.entry).toEqual([
      path.join(projectRoot, ".variiant", "cache", "webpack", "dev-bootstrap.mjs"),
      "./src/App.tsx",
    ]);
    expect(fs.readFileSync(path.join(projectRoot, ".variiant", ".gitignore"), "utf8")).toBe("sessions/\ncache/\n");

    const resolveData = {
      context: path.join(projectRoot, "src"),
      request: "./components/OrdersTable",
      contextInfo: {
        issuer: path.join(projectRoot, "src", "App.tsx"),
      },
    };
    await new Promise<void>((resolve, reject) => {
      getBeforeResolveCallback()(resolveData, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    expect(resolveData.request).toContain(path.join(".variiant", "cache", "webpack", "proxies"));
    expect(fs.readFileSync(resolveData.request, "utf8")).toContain("createVariantProxy");
    expect(fs.readFileSync(resolveData.request, "utf8")).toContain("compact");
  });

  it("falls back variant-relative imports to the source module directory", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variiant-webpack-fallback-"));
    const sourceDir = path.join(projectRoot, "src", "components");
    const variantDir = path.join(
      projectRoot,
      ".variiant",
      "variants",
      "src",
      "components",
      "Panel.tsx",
      "default",
    );
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(variantDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "Panel.tsx"), "export default function Panel(){ return null; }");
    fs.writeFileSync(path.join(sourceDir, "shared.ts"), "export const label = 'Shared';");
    const variantPath = path.join(variantDir, "dense.tsx");
    fs.writeFileSync(variantPath, "import { label } from './shared'; export default function Dense(){ return label; }");

    const { compiler, getBeforeResolveCallback } = createFakeCompiler(projectRoot);
    variantWebpackPlugin({ projectRoot }).apply(compiler as never);

    const resolveData = {
      context: variantDir,
      request: "./shared",
      contextInfo: {
        issuer: variantPath,
      },
    };
    await new Promise<void>((resolve, reject) => {
      getBeforeResolveCallback()(resolveData, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    expect(resolveData.request).toBe(path.join(sourceDir, "shared"));
  });

  it("does not inject the overlay bootstrap into production entries", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variiant-webpack-production-"));
    const sourceDir = path.join(projectRoot, "src", "components");
    const variantDir = path.join(
      projectRoot,
      ".variiant",
      "variants",
      "src",
      "components",
      "Card.tsx",
      "default",
    );
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(variantDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "Card.tsx"), "export default function Card(){ return null; }");
    fs.writeFileSync(path.join(variantDir, "simple.tsx"), "export default function Simple(){ return null; }");

    const { compiler } = createFakeCompiler(projectRoot, "production");
    variantWebpackPlugin({ projectRoot }).apply(compiler as never);

    expect(compiler.options.entry).toBe("./src/App.tsx");
    expect(fs.existsSync(path.join(projectRoot, ".variiant", "cache", "webpack", "dev-bootstrap.mjs"))).toBe(false);
  });

  it("wraps function entries with the overlay bootstrap in development", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variiant-webpack-entry-"));
    const { compiler } = createFakeCompiler(projectRoot);
    compiler.options.entry = async () => "./src/App.tsx";

    variantWebpackPlugin({ projectRoot }).apply(compiler as never);

    expect(typeof compiler.options.entry).toBe("function");
    await expect((compiler.options.entry as () => Promise<unknown>)()).resolves.toEqual([
      path.join(projectRoot, ".variiant", "cache", "webpack", "dev-bootstrap.mjs"),
      "./src/App.tsx",
    ]);
  });
});
