import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import type { Plugin } from "vite";
import { buildAgentPrompt } from "./agent-prompt";
import type { VariantAgentStreamingMode } from "./runtime-core";
import { analyzeVariantCopyTweaks, applyVariantCopyTweak } from "./tweak-text";
import {
  defaultVariantsDir,
  ensureVariantWorkspaceGitignore,
  getWatchedVariantDirs,
  resolveVariantsDir,
  variantSessionsDir,
  variantWorkspaceDirName,
} from "./workspace";

export type VariantTargetEntry = {
  exportName: string;
  selected: string;
  displayName: string;
  variantImportPaths: Record<string, string>;
};

export type VariantRegistryEntry = {
  key: string;
  sourceAbsolutePath: string;
  sourceRelativePath: string;
  sourceImportPath: string;
  hasDefaultExport: boolean;
  targets: Record<string, VariantTargetEntry>;
};

export type VariantPluginOptions = {
  projectRoot?: string;
  variantsDir?: string;
  agentRefresh?: "hmr" | "full-reload";
};

export type VariantAgentConfig = {
  command: string | string[];
  cwd?: string;
  streaming?: VariantAgentStreamingMode;
  refresh?: "hmr" | "full-reload";
  logFile?: boolean;
  image?: {
    cliFlag?: string;
  };
};

export type VariantAppConfig = {
  agent?: VariantAgentConfig;
};

const sourceExtensions = [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs", ".cts", ".cjs"];
const importResolutionExtensions = [
  ...sourceExtensions,
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".module.css",
  ".module.scss",
  ".module.sass",
  ".module.less",
  ".json",
];
const variantConfigFileName = "variiant.config.json";
const variantConfigRoute = "/__variiant/config";
const variantAgentRunRoute = "/__variiant/agent/run";
const variantTweakCatalogRoute = "/__variiant/tweak/catalog";
const variantTweakApplyRoute = "/__variiant/tweak/apply";
const workspaceSnapshotIgnore = new Set([".git", "coverage", "dist", "node_modules"]);
const developmentOverlayBootstrapVirtualId = "virtual:variiant/dev-bootstrap";
const resolvedDevelopmentOverlayBootstrapVirtualId = `\0${developmentOverlayBootstrapVirtualId}`;
const developmentOverlayBootstrapBrowserPath =
  `/@id/__x00__${developmentOverlayBootstrapVirtualId}`;
const developmentOverlayBootstrapModule = [
  `import { installVariantOverlay } from ${JSON.stringify("@variiant-ui/react-vite/runtime")};`,
  "installVariantOverlay();",
].join("\n");

export function variantPlugin(options: VariantPluginOptions = {}): Plugin {
  let projectRoot = "";
  let registry = new Map<string, VariantRegistryEntry>();
  let watchedVariantRoots: string[] = [];
  let activeAgentRuns = 0;
  const agentSessionToken = crypto.randomUUID();

  const refreshRegistry = (): void => {
    projectRoot = options.projectRoot ? path.resolve(options.projectRoot) : process.cwd();
    watchedVariantRoots = getWatchedVariantDirs(options.variantsDir)
      .map((variantDir) => path.join(projectRoot, variantDir));
    registry = loadRegistry(projectRoot, resolveVariantsDir(projectRoot, options.variantsDir));
  };

  return {
    name: "variiant-react-vite",
    enforce: "pre",
    configResolved(config) {
      projectRoot = options.projectRoot ? path.resolve(options.projectRoot) : config.root;
      watchedVariantRoots = getWatchedVariantDirs(options.variantsDir)
        .map((variantDir) => path.join(projectRoot, variantDir));
      registry = loadRegistry(projectRoot, resolveVariantsDir(projectRoot, options.variantsDir));
    },
    configureServer(server) {
      const variantsRoots = getWatchedVariantDirs(options.variantsDir)
        .map((variantDir) => path.join(projectRoot, variantDir));
      const configPath = path.join(projectRoot, variantConfigFileName);
      for (const variantsRoot of variantsRoots) {
        server.watcher.add(variantsRoot);
      }
      server.watcher.add(configPath);

      const agentConfig = resolveVariantAgentConfig(projectRoot);
      if (agentConfig.enabled) {
        ensureAgentConventionFile(projectRoot, agentConfig.command);
      }

      const reload = (): void => {
        refreshRegistry();
        server.ws.send({ type: "full-reload" });
      };
      const refreshVariantProxyModules = async (
        previousRegistry: Map<string, VariantRegistryEntry>,
      ): Promise<void> => {
        const sourceAbsolutePaths = new Set<string>([
          ...previousRegistry.keys(),
          ...registry.keys(),
        ]);

        const reloads: Promise<void>[] = [];
        for (const sourceAbsolutePath of sourceAbsolutePaths) {
          const module = server.moduleGraph.getModuleById(getVariantProxyModuleId(sourceAbsolutePath));
          if (!module) {
            continue;
          }

          reloads.push(server.reloadModule(module));
        }

        await Promise.all(reloads);
      };
      const applyAgentVariantRefresh = async (
        changedFiles: string[],
        refreshMode: "hmr" | "full-reload",
      ): Promise<void> => {
        const touchesVariantState = changedFiles.some((changedFile) =>
          shouldReloadVariantState(
            projectRoot,
            variantsRoots,
            configPath,
            path.join(projectRoot, changedFile),
          )
        );
        if (!touchesVariantState) {
          return;
        }

        const previousRegistry = new Map(registry);
        refreshRegistry();
        if (refreshMode === "full-reload") {
          server.ws.send({ type: "full-reload" });
          return;
        }

        await refreshVariantProxyModules(previousRegistry);
      };
      const maybeReload = (changedPath: string): void => {
        if (!shouldReloadVariantState(projectRoot, variantsRoots, configPath, changedPath)) {
          return;
        }

        if (activeAgentRuns > 0) {
          return;
        }

        const normalizedChangedPath = normalizePath(path.resolve(changedPath));
        const normalizedConfigPath = normalizePath(path.resolve(configPath));

        // Config file changes require a full reload to pick up new registry state.
        // Variant source file edits can be handled with targeted HMR.
        if (normalizedChangedPath === normalizedConfigPath) {
          reload();
          return;
        }

        const previousRegistry = new Map(registry);
        refreshRegistry();
        void refreshVariantProxyModules(previousRegistry);
      };

      server.watcher.on("add", maybeReload);
      server.watcher.on("change", maybeReload);
      server.watcher.on("unlink", maybeReload);

      server.middlewares.use((req, res, next) => {
        const pathname = req.url ? new URL(req.url, "http://localhost").pathname : "";
        if (pathname === variantConfigRoute && req.method === "GET") {
          handleVariantConfigRequest(req, res, projectRoot, agentSessionToken);
          return;
        }

        if (pathname === variantAgentRunRoute && req.method === "POST") {
          activeAgentRuns += 1;
          void handleVariantAgentRunRequest(
            req,
            res,
            projectRoot,
            agentSessionToken,
            options.variantsDir,
            options.agentRefresh,
            applyAgentVariantRefresh,
          ).finally(() => {
            activeAgentRuns = Math.max(0, activeAgentRuns - 1);
          });
          return;
        }

        if (pathname === variantTweakCatalogRoute && req.method === "POST") {
          void handleVariantTweakCatalogRequest(
            req,
            res,
            projectRoot,
            agentSessionToken,
            options.variantsDir,
          );
          return;
        }

        if (pathname === variantTweakApplyRoute && req.method === "POST") {
          void handleVariantTweakApplyRequest(
            req,
            res,
            projectRoot,
            agentSessionToken,
            options.variantsDir,
            async (changedFiles) => {
              await applyAgentVariantRefresh(changedFiles, "hmr");
            },
          );
          return;
        }

        next();
      });
    },
    transformIndexHtml(_html, ctx) {
      if (!ctx.server) {
        return undefined;
      }

      return {
        html: _html,
        tags: [
          {
            tag: "script",
            attrs: {
              type: "module",
              "data-variiant-dev-bootstrap": "true",
              src: developmentOverlayBootstrapBrowserPath,
            },
            injectTo: "body",
          },
        ],
      };
    },
    async resolveId(source, importer, resolveOptions) {
      if (source === developmentOverlayBootstrapVirtualId) {
        return resolvedDevelopmentOverlayBootstrapVirtualId;
      }

      if (!importer || source.startsWith("\0")) {
        return null;
      }

      const normalizedImporter = normalizePath(importer);
      if (normalizedImporter.startsWith("\0variant-proxy:")) {
        return null;
      }

      const variantSourceContext = resolveVariantSourceContext(
        projectRoot,
        watchedVariantRoots,
        normalizedImporter,
      );
      if (variantSourceContext) {
        if (!isRelativeImport(source)) {
          return null;
        }

        const resolved = await this.resolve(source, importer, {
          ...resolveOptions,
          skipSelf: true,
        });
        if (resolved) {
          return resolved;
        }

        const fallbackPath = path.resolve(path.dirname(variantSourceContext.sourceAbsolutePath), source);
        return this.resolve(fallbackPath, undefined, {
          ...resolveOptions,
          skipSelf: true,
        });
      }

      const resolved = await this.resolve(source, importer, {
        ...resolveOptions,
        skipSelf: true,
      });

      if (!resolved) {
        return null;
      }

      const entry = registry.get(normalizePath(resolved.id));
      if (!entry) {
        return null;
      }

      return `\0variant-proxy:${encodeURIComponent(entry.sourceAbsolutePath)}`;
    },
    load(id) {
      if (id === resolvedDevelopmentOverlayBootstrapVirtualId) {
        return developmentOverlayBootstrapModule;
      }

      if (!id.startsWith("\0variant-proxy:")) {
        return null;
      }

      const sourceAbsolutePath = decodeURIComponent(id.slice("\0variant-proxy:".length));
      const entry = registry.get(normalizePath(sourceAbsolutePath));
      if (!entry) {
        throw new Error(`Missing variant registry entry for ${sourceAbsolutePath}`);
      }

      if (this.meta.watchMode) {
        return buildDevelopmentProxyModule(entry);
      }

      return buildProductionProxyModule(entry);
    },
  };
}

export function shouldReloadVariantState(
  projectRoot: string,
  variantsRoot: string | string[],
  configPath: string,
  changedPath: string,
): boolean {
  const normalizedChangedPath = normalizePath(path.resolve(changedPath));
  const normalizedConfigPath = normalizePath(path.resolve(configPath));
  const normalizedProjectRoot = normalizePath(path.resolve(projectRoot));
  const normalizedVariantRoots = (Array.isArray(variantsRoot) ? variantsRoot : [variantsRoot])
    .map((variantPath) => normalizePath(path.resolve(variantPath)));

  if (!normalizedChangedPath.startsWith(normalizedProjectRoot)) {
    return false;
  }

  return (
    normalizedChangedPath === normalizedConfigPath
    || normalizedVariantRoots.some((variantPath) => isPathInsideRootPath(normalizedChangedPath, variantPath))
  );
}

export function loadVariantAppConfig(projectRoot: string): VariantAppConfig {
  const configPath = path.join(projectRoot, variantConfigFileName);
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${variantConfigFileName} must contain a JSON object.`);
  }

  return normalizeVariantAppConfig(parsed as Record<string, unknown>);
}

function normalizeVariantAppConfig(raw: Record<string, unknown>): VariantAppConfig {
  const nested = { ...raw } as Record<string, unknown>;
  const agentRecord = isRecord(nested.agent) ? { ...nested.agent } : {};

  const dottedCommand = nested["agent.command"];
  const dottedCwd = nested["agent.cwd"];
  const dottedStreaming = nested["agent.streaming"];
  const dottedRefresh = nested["agent.refresh"];
  const dottedLogFile = nested["agent.logFile"];
  const dottedImageCliFlag = nested["agent.image.cliFlag"];

  if (dottedCommand !== undefined && agentRecord.command === undefined) {
    agentRecord.command = dottedCommand;
  }

  if (dottedCwd !== undefined && agentRecord.cwd === undefined) {
    agentRecord.cwd = dottedCwd;
  }

  if (dottedStreaming !== undefined && agentRecord.streaming === undefined) {
    agentRecord.streaming = dottedStreaming;
  }

  if (dottedRefresh !== undefined && agentRecord.refresh === undefined) {
    agentRecord.refresh = dottedRefresh;
  }

  if (dottedLogFile !== undefined && agentRecord.logFile === undefined) {
    agentRecord.logFile = dottedLogFile;
  }

  if (dottedImageCliFlag !== undefined) {
    const imageRecord = isRecord(agentRecord.image) ? { ...agentRecord.image } : {};
    if (imageRecord.cliFlag === undefined) {
      imageRecord.cliFlag = dottedImageCliFlag;
    }
    agentRecord.image = imageRecord;
  }

  return Object.keys(agentRecord).length > 0
    ? { agent: agentRecord as VariantAgentConfig }
    : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

type ResolvedVariantAgentConfig =
    | {
      enabled: true;
      command: string | string[];
      commandLabel: string;
      cwd: string;
      streaming: VariantAgentStreamingMode;
    refresh: "hmr" | "full-reload" | undefined;
    logFile: boolean;
      imageCliFlag: string | null;
    }
  | {
      enabled: false;
      commandLabel: string | null;
      message: string;
      streaming: VariantAgentStreamingMode | null;
      imageCliFlag: string | null;
    };

function resolveVariantAgentConfig(projectRoot: string): ResolvedVariantAgentConfig {
  let config: VariantAppConfig;
  try {
    config = loadVariantAppConfig(projectRoot);
  } catch (error) {
    return {
      enabled: false,
      commandLabel: null,
      message: error instanceof Error ? error.message : "Failed to read variiant.config.json.",
      streaming: null,
      imageCliFlag: null,
    };
  }

  if (!config.agent?.command) {
    return {
      enabled: false,
      commandLabel: null,
      message: "Add agent.command to variiant.config.json to enable the local agent bridge.",
      streaming: null,
      imageCliFlag: null,
    };
  }

  if (Array.isArray(config.agent.command) && config.agent.command.length === 0) {
    return {
      enabled: false,
      commandLabel: null,
      message: "agent.command must not be an empty array.",
      streaming: null,
      imageCliFlag: null,
    };
  }

  if (typeof config.agent.command === "string" && config.agent.command.trim().length === 0) {
    return {
      enabled: false,
      commandLabel: null,
      message: "agent.command must not be empty.",
      streaming: null,
      imageCliFlag: null,
    };
  }

  if (config.agent.logFile !== undefined && typeof config.agent.logFile !== "boolean") {
    return {
      enabled: false,
      commandLabel: null,
      message: "agent.logFile must be a boolean when provided.",
      streaming: null,
      imageCliFlag: null,
    };
  }

  const cwd = path.resolve(projectRoot, config.agent.cwd ?? ".");
  if (!isPathInsideRoot(projectRoot, cwd)) {
    return {
      enabled: false,
      commandLabel: null,
      message: "agent.cwd must stay within the project root.",
      streaming: null,
      imageCliFlag: null,
    };
  }

  let imageCliFlag: string | null = null;
  if (config.agent.image?.cliFlag !== undefined) {
    if (typeof config.agent.image.cliFlag !== "string") {
      return {
        enabled: false,
        commandLabel: null,
        message: "agent.image.cliFlag must be a string when provided.",
        streaming: null,
        imageCliFlag: null,
      };
    }

    const trimmedCliFlag = config.agent.image.cliFlag.trim();
    if (!trimmedCliFlag) {
      return {
        enabled: false,
        commandLabel: null,
        message: "agent.image.cliFlag must not be empty.",
        streaming: null,
        imageCliFlag: null,
      };
    }

    imageCliFlag = trimmedCliFlag;
  }

  const normalizedCommand = normalizeAgentCommand(
    config.agent.command,
    config.agent.streaming ?? "auto",
    imageCliFlag,
  );

  return {
    enabled: true,
    command: config.agent.command,
    commandLabel: Array.isArray(normalizedCommand)
      ? normalizedCommand.join(" ")
      : normalizedCommand,
    cwd,
    streaming: config.agent.streaming ?? "auto",
    refresh: config.agent.refresh,
    logFile: config.agent.logFile ?? false,
    imageCliFlag,
  };
}

function isPathInsideRoot(projectRoot: string, candidate: string): boolean {
  const relative = path.relative(projectRoot, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isPathInsideRootPath(candidatePath: string, rootPath: string): boolean {
  const normalizedCandidatePath = normalizePath(path.resolve(candidatePath));
  const normalizedRootPath = normalizePath(path.resolve(rootPath));
  return normalizedCandidatePath === normalizedRootPath
    || normalizedCandidatePath.startsWith(`${normalizedRootPath}/`);
}

function isRelativeImport(source: string): boolean {
  return source.startsWith("./") || source.startsWith("../");
}

function normalizeRelativeImportPath(value: string): string {
  const normalized = normalizePath(value);
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function resolveVariantSourceContext(
  projectRoot: string,
  variantsRoots: string[],
  importer: string,
): { sourceAbsolutePath: string } | null {
  for (const variantsRoot of variantsRoots) {
    if (!isPathInsideRootPath(importer, variantsRoot)) {
      continue;
    }

    const relativePath = normalizePath(path.relative(variantsRoot, importer));
    const match = parseConventionalVariantPath(relativePath);
    if (!match) {
      return null;
    }

    return {
      sourceAbsolutePath: normalizePath(path.resolve(projectRoot, match.sourceRelativePath)),
    };
  }

  return null;
}

function resolveImportTargetCandidate(candidatePath: string): string | null {
  if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
    return candidatePath;
  }

  for (const extension of importResolutionExtensions) {
    const withExtension = `${candidatePath}${extension}`;
    if (fs.existsSync(withExtension) && fs.statSync(withExtension).isFile()) {
      return candidatePath;
    }
  }

  for (const extension of importResolutionExtensions) {
    const asIndex = path.join(candidatePath, `index${extension}`);
    if (fs.existsSync(asIndex) && fs.statSync(asIndex).isFile()) {
      return candidatePath;
    }
  }

  return null;
}

function normalizeVariantImportSpecifier(
  importerAbsolutePath: string,
  importSpecifier: string,
  variantsRoot: string,
): string {
  if (!isRelativeImport(importSpecifier)) {
    return importSpecifier;
  }

  const importerDir = path.dirname(importerAbsolutePath);
  const directCandidate = path.resolve(importerDir, importSpecifier);
  if (resolveImportTargetCandidate(directCandidate)) {
    return importSpecifier;
  }

  if (isPathInsideRootPath(directCandidate, variantsRoot)) {
    return importSpecifier;
  }

  const variantsRootParent = path.dirname(variantsRoot);
  if (!isPathInsideRootPath(directCandidate, variantsRootParent)) {
    return importSpecifier;
  }

  const relativeToVariantsParent = path.relative(variantsRootParent, directCandidate);
  if (
    relativeToVariantsParent === ""
    || relativeToVariantsParent.startsWith("..")
    || path.isAbsolute(relativeToVariantsParent)
  ) {
    return importSpecifier;
  }

  const correctedCandidate = path.join(variantsRoot, relativeToVariantsParent);
  const resolvedTarget = resolveImportTargetCandidate(correctedCandidate);
  if (!resolvedTarget) {
    return importSpecifier;
  }

  return normalizeRelativeImportPath(path.relative(importerDir, resolvedTarget));
}

function normalizeVariantFileContents(
  fileContents: string,
  importerAbsolutePath: string,
  variantsRoot: string,
): string {
  const rewriteSpecifier = (value: string): string =>
    normalizeVariantImportSpecifier(importerAbsolutePath, value, variantsRoot);

  return fileContents
    .replace(
      /(\bfrom\s*["'])([^"']+)(["'])/g,
      (_match, prefix: string, specifier: string, suffix: string) =>
        `${prefix}${rewriteSpecifier(specifier)}${suffix}`,
    )
    .replace(
      /(\bimport\s*\(\s*["'])([^"']+)(["']\s*\))/g,
      (_match, prefix: string, specifier: string, suffix: string) =>
        `${prefix}${rewriteSpecifier(specifier)}${suffix}`,
    );
}

function injectMissingDefaultExport(contents: string, exportName: string): string {
  if (/\bexport\s+default\b/.test(contents) || /\bas\s+default\b/.test(contents)) {
    return contents;
  }

  const escapedName = exportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hasMatchingExport =
    new RegExp(`\\bexport[^;{=]*\\b${escapedName}\\b`).test(contents) ||
    new RegExp(`\\bexport\\s*\\{[^}]*\\b${escapedName}\\b[^}]*\\}`).test(contents);

  if (!hasMatchingExport) {
    return contents;
  }

  return `${contents.trimEnd()}\n\nexport default ${exportName};\n`;
}

export function normalizeChangedVariantImports(
  projectRoot: string,
  changedFiles: string[],
  variantsDir?: string,
): string[] {
  const variantsRoots = getWatchedVariantDirs(variantsDir)
    .map((variantDir) => normalizePath(path.join(projectRoot, variantDir)))
    .filter((variantRoot) => fs.existsSync(variantRoot));
  const normalizedFiles: string[] = [];

  for (const changedFile of changedFiles) {
    if (!sourceExtensions.some((extension) => changedFile.endsWith(extension))) {
      continue;
    }

    const absolutePath = normalizePath(path.join(projectRoot, changedFile));
    const variantsRoot = variantsRoots.find((candidateRoot) => isPathInsideRootPath(absolutePath, candidateRoot));
    if (!variantsRoot || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      continue;
    }

    const currentContents = fs.readFileSync(absolutePath, "utf8");
    let normalizedContents = normalizeVariantFileContents(currentContents, absolutePath, variantsRoot);

    const relativePath = normalizePath(path.relative(variantsRoot, absolutePath));
    const match = parseConventionalVariantPath(relativePath);
    if (match && match.exportName !== "default") {
      normalizedContents = injectMissingDefaultExport(normalizedContents, match.exportName);
    }

    if (normalizedContents === currentContents) {
      continue;
    }

    fs.writeFileSync(absolutePath, normalizedContents);
    normalizedFiles.push(changedFile);
  }

  return normalizedFiles.sort();
}

function writeJsonResponse(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function handleVariantConfigRequest(
  _req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
  sessionToken: string,
): void {
  const agent = resolveVariantAgentConfig(projectRoot);
  writeJsonResponse(res, 200, {
    token: sessionToken,
    agent: agent.enabled
      ? {
          enabled: true,
          commandLabel: agent.commandLabel,
          message: null,
          streaming: agent.streaming,
          supportsImages: Boolean(agent.imageCliFlag),
        }
      : {
          enabled: false,
          commandLabel: agent.commandLabel,
          message: agent.message,
          streaming: agent.streaming,
          supportsImages: false,
        },
  });
}

async function handleVariantAgentRunRequest(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
  sessionToken: string,
  variantsDir?: string,
  agentRefreshOverride?: "hmr" | "full-reload",
  onComplete?: (changedFiles: string[], refreshMode: "hmr" | "full-reload") => Promise<void>,
): Promise<void> {
  if (req.headers["x-variiant-token"] !== sessionToken) {
    writeJsonResponse(res, 403, {
      error: "Missing or invalid variiant session token.",
    });
    return;
  }

  const agent = resolveVariantAgentConfig(projectRoot);
  if (!agent.enabled) {
    writeJsonResponse(res, 400, {
      error: agent.message,
    });
    return;
  }

  const requestBody = await readRequestBody(req);
  let requestPayload: Record<string, unknown> = {};
  if (requestBody) {
    try {
      requestPayload = JSON.parse(requestBody) as Record<string, unknown>;
    } catch {
      writeJsonResponse(res, 400, {
        error: "Invalid JSON request body.",
      });
      return;
    }
  }
  const session = createVariantAgentSession(projectRoot, requestPayload);
  const beforeSnapshot = captureWorkspaceSnapshot(projectRoot);
  const eventLogStream = agent.logFile
    ? fs.createWriteStream(path.join(session.sessionDir, "agent-events.ndjson"), {
      encoding: "utf8",
    })
    : null;

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");

  const sendEvent = (event: Record<string, unknown>): void => {
    res.write(`${JSON.stringify(event)}\n`);
    if (eventLogStream) {
      eventLogStream.write(`${JSON.stringify(event)}\n`);
    }
  };

  sendEvent({
    type: "session",
    sessionId: session.sessionId,
    sessionPath: normalizePath(path.relative(projectRoot, session.sessionDir)),
    eventLogPath: eventLogStream
      ? normalizePath(path.join(variantSessionsDir, session.sessionId, "agent-events.ndjson"))
      : null,
  });

  const command = normalizeAgentCommand(
    agent.command,
    agent.streaming,
    agent.imageCliFlag,
    session.imagePaths,
  );
  const child = Array.isArray(command)
    ? spawn(command[0]!, command.slice(1), {
        cwd: agent.cwd,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      })
    : spawn(command, {
        cwd: agent.cwd,
        env: process.env,
        shell: true,
        stdio: ["pipe", "pipe", "pipe"],
      });

  child.stdin.end(session.promptText);

  streamProcessOutput(child.stdout, "stdout", sendEvent);
  streamProcessOutput(child.stderr, "stderr", sendEvent);

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  }).catch((error) => {
    sendEvent({
      type: "system",
      text: error instanceof Error ? error.message : "Failed to start the configured agent command.",
    });
    return null;
  });

  const initialAfterSnapshot = captureWorkspaceSnapshot(projectRoot);
  const initialChangedFiles = detectChangedFiles(beforeSnapshot, initialAfterSnapshot);
  const normalizedVariantFiles = normalizeChangedVariantImports(
    projectRoot,
    initialChangedFiles,
    variantsDir,
  );
  if (normalizedVariantFiles.length > 0) {
    sendEvent({
      type: "system",
      text: `Normalized variiant imports in ${normalizedVariantFiles.join(", ")}.`,
    });
  }
  const changedFiles = normalizedVariantFiles.length > 0
    ? detectChangedFiles(beforeSnapshot, captureWorkspaceSnapshot(projectRoot))
    : initialChangedFiles;

  for (const issue of validateChangedVariantFiles(projectRoot, changedFiles, variantsDir)) {
    sendEvent({ type: "system", text: `Variant issue — ${issue.file}: ${issue.message}` });
  }

  const refreshMode = agentRefreshOverride ?? agent.refresh ?? "hmr";
  sendEvent({
    type: "done",
    sessionId: session.sessionId,
    exitCode,
    changedFiles,
    error: exitCode === null ? "The configured agent command failed to start." : null,
  });
  eventLogStream?.end();
  res.end();
  await onComplete?.(changedFiles, refreshMode);
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function handleVariantTweakCatalogRequest(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
  sessionToken: string,
  configuredVariantsDir?: string,
): Promise<void> {
  if (req.headers["x-variiant-token"] !== sessionToken) {
    writeJsonResponse(res, 403, {
      error: "Missing or invalid variiant session token.",
    });
    return;
  }

  const requestPayload = await parseJsonRequestBody(req, res);
  if (!requestPayload) {
    return;
  }

  try {
    const target = resolveVariantTweakTarget(projectRoot, configuredVariantsDir, requestPayload);
    const source = fs.readFileSync(target.absolutePath, "utf8");
    writeJsonResponse(res, 200, {
      targetFile: target.relativePath,
      entries: analyzeVariantCopyTweaks(source).map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        label: entry.label,
        currentValue: entry.currentValue,
      })),
    });
  } catch (error) {
    writeJsonResponse(res, 400, {
      error: error instanceof Error ? error.message : "Failed to analyze tweak targets.",
    });
  }
}

async function handleVariantTweakApplyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
  sessionToken: string,
  configuredVariantsDir: string | undefined,
  onComplete?: (changedFiles: string[]) => Promise<void>,
): Promise<void> {
  if (req.headers["x-variiant-token"] !== sessionToken) {
    writeJsonResponse(res, 403, {
      error: "Missing or invalid variiant session token.",
    });
    return;
  }

  const requestPayload = await parseJsonRequestBody(req, res);
  if (!requestPayload) {
    return;
  }

  const entryId = typeof requestPayload.entryId === "string" ? requestPayload.entryId : null;
  const nextValue = typeof requestPayload.nextValue === "string" ? requestPayload.nextValue : null;
  if (!entryId || nextValue === null) {
    writeJsonResponse(res, 400, {
      error: "The tweak apply request must include entryId and nextValue.",
    });
    return;
  }

  try {
    const target = resolveVariantTweakTarget(projectRoot, configuredVariantsDir, requestPayload);
    const source = fs.readFileSync(target.absolutePath, "utf8");
    const result = applyVariantCopyTweak(source, {
      id: entryId,
      nextValue,
    });

    fs.writeFileSync(target.absolutePath, result.code);
    const changedFiles = [target.relativePath];
    await onComplete?.(changedFiles);

    writeJsonResponse(res, 200, {
      targetFile: target.relativePath,
      changedFiles,
      entries: analyzeVariantCopyTweaks(result.code).map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        label: entry.label,
        currentValue: entry.currentValue,
      })),
    });
  } catch (error) {
    writeJsonResponse(res, 400, {
      error: error instanceof Error ? error.message : "Failed to apply the deterministic tweak.",
    });
  }
}

async function parseJsonRequestBody(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Record<string, unknown> | null> {
  const requestBody = await readRequestBody(req);
  if (!requestBody) {
    return {};
  }

  try {
    return JSON.parse(requestBody) as Record<string, unknown>;
  } catch {
    writeJsonResponse(res, 400, {
      error: "Invalid JSON request body.",
    });
    return null;
  }
}

function resolveVariantTweakTarget(
  projectRoot: string,
  configuredVariantsDir: string | undefined,
  requestPayload: Record<string, unknown>,
): {
  absolutePath: string;
  relativePath: string;
  sourceId: string;
  variantName: string;
} {
  const sourceId = typeof requestPayload.sourceId === "string" ? requestPayload.sourceId : null;
  const variantName = typeof requestPayload.variantName === "string" ? requestPayload.variantName : null;
  if (!sourceId || !variantName) {
    throw new Error("The tweak request must include sourceId and variantName.");
  }

  if (variantName === "source") {
    throw new Error("Deterministic tweaks require an active variant file, not the source implementation.");
  }

  const variantsDir = resolveVariantsDir(projectRoot, configuredVariantsDir);
  const { sourceRelativePath, exportName } = parseVariantSourceId(sourceId);
  const variantDirectory = path.join(projectRoot, variantsDir, sourceRelativePath, exportName);
  const absolutePath = sourceExtensions
    .map((extension) => path.join(variantDirectory, `${variantName}${extension}`))
    .find((candidate) => fs.existsSync(candidate));
  if (!absolutePath) {
    throw new Error(`The active variant file does not exist: ${normalizePath(path.relative(projectRoot, path.join(variantDirectory, `${variantName}.tsx`)))}`);
  }

  return {
    absolutePath,
    relativePath: normalizePath(path.relative(projectRoot, absolutePath)),
    sourceId,
    variantName,
  };
}

function parseVariantSourceId(sourceId: string): {
  sourceRelativePath: string;
  exportName: string;
} {
  const hashIndex = sourceId.indexOf("#");
  if (hashIndex === -1) {
    return {
      sourceRelativePath: sourceId,
      exportName: "default",
    };
  }

  return {
    sourceRelativePath: sourceId.slice(0, hashIndex),
    exportName: sourceId.slice(hashIndex + 1) || "default",
  };
}

type VariantAgentSession = {
  sessionId: string;
  sessionDir: string;
  promptText: string;
  imagePaths: string[];
};

type VariantAgentSessionAttachment = {
  kind: string;
  sourceId: string | null;
  displayName: string | null;
  variantName: string | null;
  mimeType: string;
  fileName: string;
  width: number | null;
  height: number | null;
  scale: number | null;
  path: string;
};

function createVariantAgentSession(
  projectRoot: string,
  requestPayload: Record<string, unknown>,
): VariantAgentSession {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sessionId = `${timestamp}-${crypto.randomUUID()}`;
  ensureVariantWorkspaceGitignore(projectRoot);
  const sessionDir = path.join(projectRoot, variantSessionsDir, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const sessionRelativePath = `${variantSessionsDir}/${sessionId}`;
  const materializedRequest = materializeAgentRequestPayload(
    projectRoot,
    sessionDir,
    sessionRelativePath,
    requestPayload,
  );
  const promptText = buildAgentPrompt(projectRoot, sessionId, materializedRequest.payload);
  fs.writeFileSync(
    path.join(sessionDir, "request.json"),
    JSON.stringify(materializedRequest.payload, null, 2),
  );
  fs.writeFileSync(path.join(sessionDir, "prompt.md"), promptText);

  return {
    sessionId,
    sessionDir,
    promptText,
    imagePaths: materializedRequest.imagePaths,
  };
}

function materializeAgentRequestPayload(
  projectRoot: string,
  sessionDir: string,
  sessionRelativePath: string,
  requestPayload: Record<string, unknown>,
): {
  payload: Record<string, unknown>;
  imagePaths: string[];
} {
  const rawAttachments = Array.isArray(requestPayload.attachments)
    ? requestPayload.attachments
    : [];
  const attachments: VariantAgentSessionAttachment[] = [];
  const imagePaths: string[] = [];

  for (let index = 0; index < rawAttachments.length; index += 1) {
    const attachment = rawAttachments[index];
    if (!isRecord(attachment)) {
      continue;
    }

    const dataUrl = typeof attachment.dataUrl === "string" ? attachment.dataUrl : null;
    if (!dataUrl) {
      continue;
    }

    const decodedImage = decodeImageDataUrl(dataUrl);
    if (!decodedImage) {
      continue;
    }

    const fileName = sanitizeAttachmentFileName(
      typeof attachment.fileName === "string" ? attachment.fileName : `attachment-${index + 1}.${decodedImage.extension}`,
      decodedImage.extension,
    );
    const absolutePath = path.join(sessionDir, fileName);
    fs.writeFileSync(absolutePath, decodedImage.buffer);
    imagePaths.push(absolutePath);
    attachments.push({
      kind: typeof attachment.kind === "string" ? attachment.kind : "attachment",
      sourceId: typeof attachment.sourceId === "string" ? attachment.sourceId : null,
      displayName: typeof attachment.displayName === "string" ? attachment.displayName : null,
      variantName: typeof attachment.variantName === "string" ? attachment.variantName : null,
      mimeType: decodedImage.mimeType,
      fileName,
      width: typeof attachment.width === "number" ? attachment.width : null,
      height: typeof attachment.height === "number" ? attachment.height : null,
      scale: typeof attachment.scale === "number" ? attachment.scale : null,
      path: normalizePath(path.join(sessionRelativePath, fileName)),
    });
  }

  return {
    payload: {
      ...requestPayload,
      attachments,
    },
    imagePaths,
  };
}

function decodeImageDataUrl(
  dataUrl: string,
): {
  buffer: Buffer;
  mimeType: string;
  extension: string;
} | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const mimeType = match[1];
  const base64 = match[2];
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.replace("image/", "");
  return {
    buffer: Buffer.from(base64, "base64"),
    mimeType,
    extension,
  };
}

function sanitizeAttachmentFileName(fileName: string, fallbackExtension: string): string {
  const parsed = path.parse(fileName);
  const baseName = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "attachment";
  const extension = parsed.ext ? parsed.ext.replace(/^\./, "") : fallbackExtension;
  return `${baseName}.${extension}`;
}

function normalizeAgentCommand(
  command: string | string[],
  streaming: VariantAgentStreamingMode,
  imageCliFlag: string | null = null,
  imagePaths: string[] = [],
): string | string[] {
  if (Array.isArray(command)) {
    if (command[0] === "claude") {
      return appendImageArguments(
        normalizeClaudeCommandArray(command, streaming),
        imageCliFlag,
        imagePaths,
      );
    }

    if (command[0] !== "codex") {
      return appendImageArguments(command, imageCliFlag, imagePaths);
    }

    const args = [...command.slice(1)];
    if (args[0] !== "exec") {
      args.unshift("exec");
    }

    if (streaming !== "none" && !args.includes("--json")) {
      args.push("--json");
    }

    if (
      !args.includes("--sandbox")
      && !args.includes("--full-auto")
      && !args.includes("--dangerously-bypass-approvals-and-sandbox")
    ) {
      args.push("--sandbox", "workspace-write");
    }

    if (!args.includes("--skip-git-repo-check")) {
      args.push("--skip-git-repo-check");
    }

    return appendImageArguments([command[0], ...args], imageCliFlag, imagePaths);
  }

  if (!command.startsWith("codex")) {
    if (command.startsWith("claude")) {
      return appendImageArguments(
        normalizeClaudeCommandString(command, streaming),
        imageCliFlag,
        imagePaths,
      );
    }

    return appendImageArguments(command, imageCliFlag, imagePaths);
  }

  let normalized = command;
  if (!/\bcodex\s+exec\b/.test(normalized)) {
    normalized = normalized.replace(/^codex\b/, "codex exec");
  }

  if (streaming !== "none" && !/\s--json\b/.test(normalized)) {
    normalized = `${normalized} --json`;
  }

  if (
    !/\s--sandbox\b/.test(normalized)
    && !/\s--full-auto\b/.test(normalized)
    && !/\s--dangerously-bypass-approvals-and-sandbox\b/.test(normalized)
  ) {
    normalized = `${normalized} --sandbox workspace-write`;
  }

  if (!/\s--skip-git-repo-check\b/.test(normalized)) {
    normalized = `${normalized} --skip-git-repo-check`;
  }

  return appendImageArguments(normalized, imageCliFlag, imagePaths);
}

function normalizeClaudeCommandArray(
  command: string[],
  streaming: VariantAgentStreamingMode,
): string[] {
  if (streaming === "none") {
    return command;
  }

  const args = [...command];
  if (!args.includes("--output-format")) {
    args.push("--output-format", "stream-json");
  }

  if (!args.includes("--verbose")) {
    args.push("--verbose");
  }

  if (!args.includes("--include-partial-messages")) {
    args.push("--include-partial-messages");
  }

  return args;
}

function normalizeClaudeCommandString(
  command: string,
  streaming: VariantAgentStreamingMode,
): string {
  if (streaming === "none") {
    return command;
  }

  let normalized = command;
  if (!/\s--output-format\b/.test(normalized)) {
    normalized = `${normalized} --output-format stream-json`;
  }

  if (!/\s--verbose\b/.test(normalized)) {
    normalized = `${normalized} --verbose`;
  }

  if (!/\s--include-partial-messages\b/.test(normalized)) {
    normalized = `${normalized} --include-partial-messages`;
  }

  return normalized;
}

function appendImageArguments(
  command: string | string[],
  imageCliFlag: string | null,
  imagePaths: string[],
): string | string[] {
  if (!imageCliFlag || imagePaths.length === 0) {
    return command;
  }

  if (Array.isArray(command)) {
    return [
      ...command,
      ...imagePaths.flatMap((imagePath) => [imageCliFlag, imagePath]),
    ];
  }

  return `${command}${imagePaths.map((imagePath) => ` ${shellEscape(imageCliFlag)} ${shellEscape(imagePath)}`).join("")}`;
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function streamProcessOutput(
  stream: NodeJS.ReadableStream | null,
  streamName: "stdout" | "stderr",
  sendEvent: (event: Record<string, unknown>) => void,
): void {
  if (!stream) {
    return;
  }

  let buffered = "";
  stream.on("data", (chunk: string | Buffer) => {
    buffered += chunk.toString();
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }

      sendEvent({
        type: streamName,
        text: line,
      });
    }
  });

  stream.on("end", () => {
    if (buffered.trim().length === 0) {
      return;
    }

    sendEvent({
      type: streamName,
      text: buffered,
    });
  });
}

function getVariantProxyModuleId(sourceAbsolutePath: string): string {
  return `\0variant-proxy:${encodeURIComponent(normalizePath(sourceAbsolutePath))}`;
}

type WorkspaceSnapshot = Map<string, string>;

function captureWorkspaceSnapshot(projectRoot: string): WorkspaceSnapshot {
  const snapshot = new Map<string, string>();
  const ignoredPaths = new Set([normalizePath(path.join(projectRoot, variantSessionsDir))]);

  const walk = (currentDir: string): void => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (workspaceSnapshotIgnore.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);
      if (ignoredPaths.has(normalizePath(absolutePath))) {
        continue;
      }

      const relativePath = normalizePath(path.relative(projectRoot, absolutePath));
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const stats = fs.statSync(absolutePath);
      snapshot.set(relativePath, `${stats.size}:${stats.mtimeMs}`);
    }
  };

  walk(projectRoot);
  return snapshot;
}

function detectChangedFiles(before: WorkspaceSnapshot, after: WorkspaceSnapshot): string[] {
  const changed = new Set<string>();

  for (const [filePath, fingerprint] of after.entries()) {
    if (before.get(filePath) !== fingerprint) {
      changed.add(filePath);
    }
  }

  for (const filePath of before.keys()) {
    if (!after.has(filePath)) {
      changed.add(filePath);
    }
  }

  return Array.from(changed).sort();
}

function loadRegistry(projectRoot: string, variantsDirName: string): Map<string, VariantRegistryEntry> {
  const variantsRoot = path.join(projectRoot, variantsDirName);
  const results = new Map<string, VariantRegistryEntry>();

  if (!fs.existsSync(variantsRoot)) {
    return results;
  }

  loadConventionalVariants(projectRoot, variantsRoot, results);

  return results;
}

function loadConventionalVariants(
  projectRoot: string,
  variantsRoot: string,
  results: Map<string, VariantRegistryEntry>,
): void {
  const variantFiles = walkForVariantFiles(variantsRoot);

  for (const variantFilePath of variantFiles) {
    const relativePath = normalizePath(path.relative(variantsRoot, variantFilePath));
    const match = parseConventionalVariantPath(relativePath);
    if (!match) {
      continue;
    }

    if (!detectHasDefaultExport(variantFilePath)) {
      continue;
    }

    const sourceAbsolutePath = normalizePath(path.resolve(projectRoot, match.sourceRelativePath));
    const entry = ensureRegistryEntry(results, projectRoot, sourceAbsolutePath, match.sourceRelativePath);
    const target = ensureTargetEntry(entry, {
      exportName: match.exportName,
      selected: "source",
      displayName: deriveDisplayName(match.sourceRelativePath, match.exportName),
    });

    if (match.variantName in target.variantImportPaths) {
      throw new Error(
        `Duplicate conventional variant "${match.variantName}" for ${match.sourceRelativePath}#${match.exportName}.`,
      );
    }

    target.variantImportPaths[match.variantName] = toImportPath(variantFilePath);
  }
}

function walkForVariantFiles(rootDir: string): string[] {
  const results: string[] = [];

  const walk = (currentDir: string): void => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (
        entry.isFile() &&
        sourceExtensions.some((extension) => entry.name.endsWith(extension))
      ) {
        results.push(normalizePath(entryPath));
      }
    }
  };

  walk(rootDir);
  return results.sort();
}

function parseConventionalVariantPath(relativePath: string): {
  sourceRelativePath: string;
  exportName: string;
  variantName: string;
} | null {
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.length < 3) {
    return null;
  }

  const sourceSegmentIndex = findSourceSegmentIndex(segments);
  if (sourceSegmentIndex === -1 || sourceSegmentIndex !== segments.length - 3) {
    return null;
  }

  const exportName = segments[sourceSegmentIndex + 1];
  const variantFileName = segments[sourceSegmentIndex + 2];
  const extension = sourceExtensions.find((candidate) => variantFileName.endsWith(candidate));
  if (!extension) {
    return null;
  }

  const variantName = variantFileName.slice(0, -extension.length);
  if (!exportName || !variantName) {
    return null;
  }

  return {
    sourceRelativePath: segments.slice(0, sourceSegmentIndex + 1).join("/"),
    exportName,
    variantName,
  };
}

function findSourceSegmentIndex(segments: string[]): number {
  for (let index = segments.length - 3; index >= 0; index -= 1) {
    if (sourceExtensions.some((extension) => segments[index]?.endsWith(extension))) {
      return index;
    }
  }

  return -1;
}

function ensureRegistryEntry(
  results: Map<string, VariantRegistryEntry>,
  projectRoot: string,
  sourceAbsolutePath: string,
  sourceRelativePath: string,
): VariantRegistryEntry {
  const existing = results.get(sourceAbsolutePath);
  if (existing) {
    return existing;
  }

  const created: VariantRegistryEntry = {
    key: sourceRelativePath,
    sourceAbsolutePath,
    sourceRelativePath,
    sourceImportPath: toImportPath(sourceAbsolutePath),
    hasDefaultExport: detectHasDefaultExport(sourceAbsolutePath),
    targets: {},
  };

  created.key = normalizePath(path.relative(projectRoot, sourceAbsolutePath));
  results.set(sourceAbsolutePath, created);
  return created;
}

function ensureTargetEntry(
  entry: VariantRegistryEntry,
  target: Pick<VariantTargetEntry, "exportName" | "selected" | "displayName">,
): VariantTargetEntry {
  const existing = entry.targets[target.exportName];
  if (existing) {
    return existing;
  }

  const created: VariantTargetEntry = {
    exportName: target.exportName,
    selected: target.selected,
    displayName: target.displayName,
    variantImportPaths: {},
  };

  entry.targets[target.exportName] = created;
  return created;
}

function buildDevelopmentProxyModule(entry: VariantRegistryEntry): string {
  const importLines = [
    `export * from ${JSON.stringify(entry.sourceImportPath)};`,
    `import * as SourceModule from ${JSON.stringify(entry.sourceImportPath)};`,
    `import { createVariantProxy, installVariantOverlay } from "@variiant-ui/react-vite/runtime";`,
  ];
  const outputLines: string[] = ["installVariantOverlay();"];

  for (const target of sortTargets(entry.targets)) {
    if (target.exportName === "default" && !entry.hasDefaultExport) {
      throw new Error(
        `Variant target ${entry.sourceRelativePath}#default requires the source module to have a default export.`,
      );
    }

    const targetIdentifier = toIdentifier(target.exportName === "default" ? "default" : target.exportName);
    const variantsIdentifier = `${targetIdentifier}Variants`;
    const proxyIdentifier = `${targetIdentifier}VariantProxy`;
    const variantLines = [`  source: ${getSourceAccessExpression(target.exportName)},`];

    for (const [variantName, importPath] of Object.entries(target.variantImportPaths)) {
      const identifier = toIdentifier(`${target.exportName}-${variantName}`);
      importLines.push(`import ${identifier} from ${JSON.stringify(importPath)};`);
      variantLines.push(`  ${JSON.stringify(variantName)}: ${identifier},`);
    }

    outputLines.push(`const ${variantsIdentifier} = {`);
    outputLines.push(variantLines.join("\n"));
    outputLines.push("};");
    outputLines.push("");
    outputLines.push(`const ${proxyIdentifier} = createVariantProxy({`);
    outputLines.push(`  sourceId: ${JSON.stringify(buildSourceId(entry.sourceRelativePath, target.exportName))},`);
    outputLines.push(`  displayName: ${JSON.stringify(target.displayName)},`);
    outputLines.push(`  selected: ${JSON.stringify(target.selected)},`);
    outputLines.push(`  variants: ${variantsIdentifier},`);
    outputLines.push("});");
    outputLines.push("");
    outputLines.push(buildVariantExport(target.exportName, proxyIdentifier));
    outputLines.push("");
  }

  if (entry.hasDefaultExport && !("default" in entry.targets)) {
    outputLines.push("export default SourceModule.default;");
  }

  return `${importLines.join("\n")}\n\n${outputLines.join("\n")}\n`;
}

function buildProductionProxyModule(entry: VariantRegistryEntry): string {
  const lines = [`export * from ${JSON.stringify(entry.sourceImportPath)};`];

  const defaultTarget = entry.targets.default;
  if (defaultTarget?.selected && defaultTarget.selected !== "source") {
    const selectedImport = defaultTarget.variantImportPaths[defaultTarget.selected];
    lines.push(`export { default } from ${JSON.stringify(selectedImport)};`);
  } else if (entry.hasDefaultExport) {
    lines.push(`export { default } from ${JSON.stringify(entry.sourceImportPath)};`);
  }

  for (const target of sortTargets(entry.targets)) {
    if (target.exportName === "default" || target.selected === "source") {
      continue;
    }

    const selectedImport = target.variantImportPaths[target.selected];
    lines.push(`export { default as ${target.exportName} } from ${JSON.stringify(selectedImport)};`);
  }

  return `${lines.join("\n")}\n`;
}

function sortTargets(targets: Record<string, VariantTargetEntry>): VariantTargetEntry[] {
  return Object.values(targets).sort((left, right) => {
    if (left.exportName === "default") {
      return -1;
    }

    if (right.exportName === "default") {
      return 1;
    }

    return left.exportName.localeCompare(right.exportName);
  });
}

function getSourceAccessExpression(exportName: string): string {
  return exportName === "default"
    ? "SourceModule.default"
    : `SourceModule[${JSON.stringify(exportName)}]`;
}

function deriveDisplayName(sourceRelativePath: string, exportName: string): string {
  if (exportName !== "default") {
    return exportName;
  }

  const extension = sourceExtensions.find((candidate) => sourceRelativePath.endsWith(candidate)) ?? "";
  const fileName = path.posix.basename(sourceRelativePath, extension);
  const displayName = fileName === "index"
    ? path.posix.basename(path.posix.dirname(sourceRelativePath))
    : fileName;

  return humanize(displayName);
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function detectHasDefaultExport(sourceAbsolutePath: string): boolean {
  if (!fs.existsSync(sourceAbsolutePath)) {
    return false;
  }

  const source = fs.readFileSync(sourceAbsolutePath, "utf8");
  return /\bexport\s+default\b/.test(source) || /\bas\s+default\b/.test(source);
}

function toIdentifier(name: string): string {
  const safeName = name
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, nextCharacter: string) => nextCharacter.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "");
  return `${safeName.charAt(0).toUpperCase() + safeName.slice(1)}Variant`;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

function toImportPath(value: string): string {
  return normalizePath(value);
}

function buildSourceId(sourceRelativePath: string, exportName: string): string {
  return exportName === "default"
    ? sourceRelativePath
    : `${sourceRelativePath}#${exportName}`;
}

function buildVariantExport(exportName: string, proxyIdentifier: string): string {
  return exportName === "default"
    ? `export default ${proxyIdentifier};`
    : `export { ${proxyIdentifier} as ${exportName} };`;
}

// ---------------------------------------------------------------------------
// Post-run validation
// ---------------------------------------------------------------------------

type VariantFileIssue = {
  file: string;
  message: string;
};

export function validateChangedVariantFiles(
  projectRoot: string,
  changedFiles: string[],
  variantsDir?: string,
): VariantFileIssue[] {
  const variantsRoot = normalizePath(
    path.join(projectRoot, resolveVariantsDir(projectRoot, variantsDir)),
  );
  const issues: VariantFileIssue[] = [];

  for (const changedFile of changedFiles) {
    if (!sourceExtensions.some((ext) => changedFile.endsWith(ext))) {
      continue;
    }

    const absolutePath = normalizePath(path.join(projectRoot, changedFile));
    if (!isPathInsideRootPath(absolutePath, variantsRoot)) {
      continue;
    }

    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const relativePath = normalizePath(path.relative(variantsRoot, absolutePath));
    if (!parseConventionalVariantPath(relativePath)) {
      continue;
    }

    if (!detectHasDefaultExport(absolutePath)) {
      issues.push({
        file: changedFile,
        message: "no default export — add `export default ComponentName;` as the last line",
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Agent convention file
// ---------------------------------------------------------------------------

export function ensureAgentConventionFile(
  projectRoot: string,
  command: string | string[],
): void {
  const fileName = agentConventionFileName(command);
  const filePath = path.join(projectRoot, variantWorkspaceDirName, fileName);
  if (fs.existsSync(filePath)) {
    return;
  }

  fs.mkdirSync(path.join(projectRoot, variantWorkspaceDirName), { recursive: true });
  fs.writeFileSync(filePath, agentConventionFileContent());
}

function agentConventionFileName(command: string | string[]): "CLAUDE.md" | "AGENTS.md" {
  const first = Array.isArray(command) ? (command[0] ?? "") : command;
  return first.startsWith("claude") ? "CLAUDE.md" : "AGENTS.md";
}

function agentConventionFileContent(): string {
  return [
    "# Variiant conventions",
    "",
    "This project uses variiant-ui for switchable runtime UI variants.",
    "",
    "## Variant file structure",
    "",
    "Variant files live at the mirrored path:",
    "```",
    ".variiant/variants/<source-relative-path>/<export-name>/<variant-name>.tsx",
    "```",
    "",
    "For a default export: `.variiant/variants/src/components/Button.tsx/default/pill.tsx`",
    "For a named export: `.variiant/variants/src/components/Panel.tsx/PanelHeader/compact.tsx`",
    "",
    "## Required: default export",
    "",
    "Every variant file must end with a default export:",
    "```tsx",
    "export default ComponentName;",
    "```",
    "Files that only have named exports are silently ignored — they will not appear as selectable variants.",
    "",
    "## Import paths",
    "",
    "- Do not compute long relative paths from `.variiant/variants/` back into the app source tree — they are fragile.",
    "- Use stable app-root import specifiers (e.g. `src/components/...`) that already work in the project.",
    "- Import shared logic from sibling modules inside the same variant directory.",
    "",
    "## Targets",
    "",
    "The session `request.json` contains `activeComponent` and `mountedComponents` with exact `variantDirectory` paths.",
    "Use those as targets — do not invent new top-level paths.",
  ].join("\n") + "\n";
}
