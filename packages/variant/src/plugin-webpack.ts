import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  buildDevelopmentProxyModule,
  buildProductionProxyModule,
  getVariantProxyModuleId,
  isPathInsideRootPath,
  isRelativeImport,
  loadRegistry,
  normalizePath,
  resolveImportTargetCandidate,
  resolveVariantSourceContext,
  type VariantRegistryEntry,
} from "./bundler-core";
import {
  createVariantDevMiddleware,
  type VariantDevMiddleware,
  type VariantDevMiddlewareOptions,
  type VariantPluginOptions,
} from "./plugin";
import {
  ensureVariantWorkspaceGitignore,
  getWatchedVariantDirs,
  resolveVariantsDir,
  variantWorkspaceDirName,
} from "./workspace";

type WebpackResolver = {
  resolve: (
    contextInfo: Record<string, unknown>,
    context: string,
    request: string,
    resolveContext: Record<string, unknown>,
    callback: (error: Error | null, result?: string | false) => void,
  ) => void;
};

type WebpackNormalModuleFactory = {
  hooks: {
    beforeResolve: {
      tapAsync: (
        name: string,
        callback: (
          resolveData: WebpackResolveData | undefined,
          done: (error?: Error | null, result?: false) => void,
        ) => void,
      ) => void;
    };
  };
};

type WebpackResolveData = {
  request?: string;
  context?: string;
  contextInfo?: {
    issuer?: string;
  };
};

type WebpackCompilation = {
  contextDependencies?: Set<string> | { add: (value: string) => void };
  fileDependencies?: Set<string> | { add: (value: string) => void };
};

type WebpackCompiler = {
  context?: string;
  options: {
    context?: string;
    mode?: string;
    entry?: unknown;
    resolve?: unknown;
  };
  resolverFactory: {
    get: (type: "normal", options?: unknown) => WebpackResolver;
  };
  hooks: {
    beforeRun?: WebpackAsyncCompilerHook;
    watchRun?: WebpackAsyncCompilerHook;
    thisCompilation?: {
      tap: (name: string, callback: (compilation: WebpackCompilation) => void) => void;
    };
    normalModuleFactory: {
      tap: (name: string, callback: (factory: WebpackNormalModuleFactory) => void) => void;
    };
  };
};

type WebpackAsyncCompilerHook = {
  tapPromise?: (name: string, callback: () => Promise<void>) => void;
  tapAsync?: (name: string, callback: (compiler: WebpackCompiler, done: (error?: Error | null) => void) => void) => void;
};

type VariantWebpackPluginInstance = {
  apply: (compiler: WebpackCompiler) => void;
};

const pluginName = "VariiantWebpackPlugin";
const webpackCacheDir = `${variantWorkspaceDirName}/cache/webpack`;
const packagedRuntimeImportPath = "@variiant-ui/react-vite/runtime";

export function variantWebpackPlugin(options: VariantPluginOptions = {}): VariantWebpackPluginInstance {
  let projectRoot = "";
  let watchedVariantRoots: string[] = [];
  let registry = new Map<string, VariantRegistryEntry>();
  let proxyBySourceAbsolutePath = new Map<string, string>();
  let bootstrapPath = "";
  let development = true;

  const refreshRegistry = (): void => {
    ensureVariantWorkspaceGitignore(projectRoot);
    watchedVariantRoots = getWatchedVariantDirs(options.variantsDir)
      .map((variantDir) => path.join(projectRoot, variantDir));
    registry = loadRegistry(projectRoot, resolveVariantsDir(projectRoot, options.variantsDir));
    proxyBySourceAbsolutePath = writeWebpackProxyModules(projectRoot, registry, development);
    bootstrapPath = development ? writeWebpackBootstrapModule(projectRoot) : "";
  };

  return {
    apply(compiler) {
      projectRoot = path.resolve(options.projectRoot ?? compiler.options.context ?? compiler.context ?? process.cwd());
      development = compiler.options.mode !== "production";
      refreshRegistry();

      if (development) {
        compiler.options.entry = prependWebpackEntry(compiler.options.entry, bootstrapPath);
      }

      tapCompilerRun(compiler.hooks.beforeRun, refreshRegistry);
      tapCompilerRun(compiler.hooks.watchRun, refreshRegistry);
      compiler.hooks.thisCompilation?.tap(pluginName, (compilation) => {
        for (const variantRoot of watchedVariantRoots) {
          compilation.contextDependencies?.add(variantRoot);
        }
        const configPath = path.join(projectRoot, "variiant.config.json");
        compilation.fileDependencies?.add(configPath);
        for (const proxyPath of proxyBySourceAbsolutePath.values()) {
          compilation.fileDependencies?.add(proxyPath);
        }
      });

      compiler.hooks.normalModuleFactory.tap(pluginName, (factory) => {
        const resolver = compiler.resolverFactory.get("normal", compiler.options.resolve);
        factory.hooks.beforeResolve.tapAsync(pluginName, (resolveData, done) => {
          if (!resolveData?.request || !resolveData.context) {
            done();
            return;
          }

          const issuer = normalizeWebpackIssuer(resolveData);
          if (issuer && isPathInsideRootPath(issuer, path.join(projectRoot, webpackCacheDir))) {
            done();
            return;
          }

          const fallback = maybeResolveVariantRelativeImport(
            projectRoot,
            watchedVariantRoots,
            issuer,
            resolveData.request,
          );
          if (fallback) {
            resolveData.request = fallback;
            resolveData.context = path.dirname(fallback);
            done();
            return;
          }

          resolver.resolve(
            {},
            resolveData.context,
            resolveData.request,
            {},
            (error, resolvedPath) => {
              if (error || !resolvedPath) {
                done();
                return;
              }

              const entry = registry.get(normalizePath(resolvedPath));
              if (!entry) {
                done();
                return;
              }

              const proxyPath = proxyBySourceAbsolutePath.get(entry.sourceAbsolutePath);
              if (!proxyPath) {
                done();
                return;
              }

              resolveData.request = proxyPath;
              resolveData.context = path.dirname(proxyPath);
              done();
            },
          );
        });
      });
    },
  };
}

export function variantWebpackDevMiddleware(
  options: VariantDevMiddlewareOptions = {},
): VariantDevMiddleware {
  return createVariantDevMiddleware(options);
}

function tapCompilerRun(hook: WebpackAsyncCompilerHook | undefined, callback: () => void): void {
  if (hook?.tapPromise) {
    hook.tapPromise(pluginName, async () => {
      callback();
    });
    return;
  }

  hook?.tapAsync?.(pluginName, (_compiler, done) => {
    callback();
    done();
  });
}

function writeWebpackProxyModules(
  projectRoot: string,
  registry: Map<string, VariantRegistryEntry>,
  development: boolean,
): Map<string, string> {
  const outputDir = path.join(projectRoot, webpackCacheDir, "proxies");
  fs.mkdirSync(outputDir, { recursive: true });

  const result = new Map<string, string>();
  for (const entry of registry.values()) {
    const proxyPath = path.join(outputDir, `${stableProxyFileName(entry.sourceAbsolutePath)}.mjs`);
    const contents = development
      ? buildDevelopmentProxyModule(entry, packagedRuntimeImportPath)
      : buildProductionProxyModule(entry);
    fs.writeFileSync(proxyPath, contents);
    result.set(entry.sourceAbsolutePath, proxyPath);
  }

  return result;
}

function writeWebpackBootstrapModule(projectRoot: string): string {
  const outputDir = path.join(projectRoot, webpackCacheDir);
  fs.mkdirSync(outputDir, { recursive: true });
  const bootstrapPath = path.join(outputDir, "dev-bootstrap.mjs");
  fs.writeFileSync(
    bootstrapPath,
    [
      `import { installVariantOverlay } from ${JSON.stringify(packagedRuntimeImportPath)};`,
      "installVariantOverlay();",
    ].join("\n"),
  );
  return bootstrapPath;
}

function stableProxyFileName(sourceAbsolutePath: string): string {
  const hash = crypto.createHash("sha256")
    .update(normalizePath(sourceAbsolutePath))
    .digest("hex")
    .slice(0, 16);
  return `variant-proxy-${hash}`;
}

function prependWebpackEntry(entry: unknown, bootstrapPath: string): unknown {
  if (!entry) {
    return [bootstrapPath];
  }

  if (typeof entry === "string") {
    return [bootstrapPath, entry];
  }

  if (Array.isArray(entry)) {
    return [bootstrapPath, ...entry];
  }

  if (typeof entry === "function") {
    return async (...args: unknown[]) => prependWebpackEntry(await entry(...args), bootstrapPath);
  }

  if (typeof entry === "object") {
    const nextEntries: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(entry)) {
      nextEntries[name] = prependWebpackEntryValue(value, bootstrapPath);
    }
    return nextEntries;
  }

  return entry;
}

function prependWebpackEntryValue(value: unknown, bootstrapPath: string): unknown {
  if (typeof value === "string" || Array.isArray(value)) {
    return prependWebpackEntry(value, bootstrapPath);
  }

  if (value && typeof value === "object" && "import" in value) {
    const entry = value as { import?: string | string[] };
    return {
      ...entry,
      import: Array.isArray(entry.import)
        ? [bootstrapPath, ...entry.import]
        : [bootstrapPath, ...(entry.import ? [entry.import] : [])],
    };
  }

  return value;
}

function normalizeWebpackIssuer(resolveData: WebpackResolveData): string | null {
  const issuer = resolveData.contextInfo?.issuer;
  if (issuer) {
    return normalizePath(issuer);
  }

  return null;
}

function maybeResolveVariantRelativeImport(
  projectRoot: string,
  watchedVariantRoots: string[],
  issuer: string | null,
  request: string,
): string | null {
  if (!issuer || !isRelativeImport(request)) {
    return null;
  }

  const variantSourceContext = resolveVariantSourceContext(projectRoot, watchedVariantRoots, issuer);
  if (!variantSourceContext) {
    return null;
  }

  const directCandidate = path.resolve(path.dirname(issuer), request);
  if (resolveImportTargetCandidate(directCandidate)) {
    return null;
  }

  const fallbackCandidate = path.resolve(path.dirname(variantSourceContext.sourceAbsolutePath), request);
  return resolveImportTargetCandidate(fallbackCandidate);
}

export function getWebpackVariantProxyModuleId(sourceAbsolutePath: string): string {
  return getVariantProxyModuleId(sourceAbsolutePath);
}
