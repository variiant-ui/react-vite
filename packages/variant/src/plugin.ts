import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import type { Plugin } from "vite";
import type { VariantAgentStreamingMode } from "./runtime-core";
import {
  defaultVariantsDir,
  ensureVariantWorkspaceGitignore,
  getWatchedVariantDirs,
  resolveVariantsDir,
  variantSessionsDir,
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
};

export type VariantAgentConfig = {
  command: string | string[];
  cwd?: string;
  streaming?: VariantAgentStreamingMode;
  image?: {
    cliFlag?: string;
  };
};

export type VariantAppConfig = {
  agent?: VariantAgentConfig;
};

const sourceExtensions = [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs", ".cts", ".cjs"];
const variantConfigFileName = "variiant.config.json";
const variantConfigRoute = "/__variiant/config";
const variantAgentRunRoute = "/__variiant/agent/run";
const workspaceSnapshotIgnore = new Set([".git", "coverage", "dist", "node_modules"]);

export function variantPlugin(options: VariantPluginOptions = {}): Plugin {
  let projectRoot = "";
  let registry = new Map<string, VariantRegistryEntry>();
  let watchedVariantRoots: string[] = [];
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
      const reload = (): void => {
        refreshRegistry();
        server.ws.send({ type: "full-reload" });
      };
      const maybeReload = (changedPath: string): void => {
        if (!shouldReloadVariantState(projectRoot, variantsRoots, configPath, changedPath)) {
          return;
        }

        reload();
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
          void handleVariantAgentRunRequest(req, res, projectRoot, agentSessionToken);
          return;
        }

        next();
      });
    },
    async resolveId(source, importer, resolveOptions) {
      if (!importer || source.startsWith("\0")) {
        return null;
      }

      const normalizedImporter = normalizePath(importer);
      if (
        normalizedImporter.startsWith("\0variant-proxy:") ||
        watchedVariantRoots.some((variantRoot) => isPathInsideRootPath(normalizedImporter, variantRoot))
      ) {
        return null;
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

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");

  const sendEvent = (event: Record<string, unknown>): void => {
    res.write(`${JSON.stringify(event)}\n`);
  };

  sendEvent({
    type: "session",
    sessionId: session.sessionId,
    sessionPath: normalizePath(path.relative(projectRoot, session.sessionDir)),
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

  const changedFiles = detectChangedFiles(beforeSnapshot, captureWorkspaceSnapshot(projectRoot));
  sendEvent({
    type: "done",
    sessionId: session.sessionId,
    exitCode,
    changedFiles,
    error: exitCode === null ? "The configured agent command failed to start." : null,
  });
  res.end();
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
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

function getMaterializedAttachmentPaths(requestPayload: Record<string, unknown>): string[] {
  const attachments = Array.isArray(requestPayload.attachments) ? requestPayload.attachments : [];
  return attachments
    .filter((attachment): attachment is VariantAgentSessionAttachment =>
      isRecord(attachment) && typeof attachment.path === "string",
    )
    .map((attachment) => attachment.path);
}

function buildAgentPrompt(
  projectRoot: string,
  sessionId: string,
  requestPayload: Record<string, unknown>,
): string {
  const sessionRelativePath = `${variantSessionsDir}/${sessionId}`;
  const prompt = typeof requestPayload.prompt === "string" ? requestPayload.prompt : "";
  const attachmentPaths = getMaterializedAttachmentPaths(requestPayload);
  const attachmentBlock = attachmentPaths.length > 0
    ? [
        "",
        "Image attachments:",
        ...attachmentPaths.map((attachmentPath) => `- ${attachmentPath}`),
      ]
    : [];

  return [
    "You are operating inside a local variiant-ui development session.",
    `Project root: ${normalizePath(projectRoot)}`,
    `Session folder: ${sessionRelativePath}`,
    "",
    "Context files:",
    `- ${sessionRelativePath}/request.json`,
    `- ${sessionRelativePath}/prompt.md`,
    "",
    "Behavior requirements:",
    "- Work within the project root only.",
    "- Prefer creating or updating .variiant/variants implementations when that fits the request.",
    "- Keep source import boundaries stable.",
    "- If you edit files, leave the workspace in a valid state for the dev server to reload.",
    "",
    "User request:",
    prompt || "(no prompt provided)",
    "",
    "Use the JSON request file for page context and mounted component hints.",
    ...attachmentBlock,
  ].join("\n");
}

function normalizeAgentCommand(
  command: string | string[],
  streaming: VariantAgentStreamingMode,
  imageCliFlag: string | null = null,
  imagePaths: string[] = [],
): string | string[] {
  if (Array.isArray(command)) {
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
