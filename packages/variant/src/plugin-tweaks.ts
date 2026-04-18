import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import { analyzeVariantCopyTweaks, applyVariantCopyTweak } from "./tweak-text";
import { resolveVariantsDir } from "./workspace";

export const variantTweakCatalogRoute = "/__variiant/tweak/catalog";
export const variantTweakApplyRoute = "/__variiant/tweak/apply";

type VariantTweakRequestParser = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<Record<string, unknown> | null>;

type VariantTweakJsonWriter = (
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
) => void;

type VariantTweakRouteDependencies = {
  configuredVariantsDir?: string;
  parseJsonRequestBody: VariantTweakRequestParser;
  projectRoot: string;
  sessionToken: string;
  sourceExtensions: string[];
  writeJsonResponse: VariantTweakJsonWriter;
};

type VariantTweakCatalogDependencies = VariantTweakRouteDependencies;

type VariantTweakApplyDependencies = VariantTweakRouteDependencies & {
  onComplete?: (changedFiles: string[]) => Promise<void>;
};

export async function handleVariantTweakCatalogRequest(
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: VariantTweakCatalogDependencies,
): Promise<void> {
  const {
    configuredVariantsDir,
    parseJsonRequestBody,
    projectRoot,
    sessionToken,
    sourceExtensions,
    writeJsonResponse,
  } = dependencies;
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
    const target = resolveVariantTweakTarget(
      projectRoot,
      configuredVariantsDir,
      requestPayload,
      sourceExtensions,
    );
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

export async function handleVariantTweakApplyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: VariantTweakApplyDependencies,
): Promise<void> {
  const {
    configuredVariantsDir,
    onComplete,
    parseJsonRequestBody,
    projectRoot,
    sessionToken,
    sourceExtensions,
    writeJsonResponse,
  } = dependencies;
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
    const target = resolveVariantTweakTarget(
      projectRoot,
      configuredVariantsDir,
      requestPayload,
      sourceExtensions,
    );
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

export function resolveVariantTweakTarget(
  projectRoot: string,
  configuredVariantsDir: string | undefined,
  requestPayload: Record<string, unknown>,
  sourceExtensions: string[],
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

  assertSafeVariantName(variantName);

  const variantsDir = resolveVariantsDir(projectRoot, configuredVariantsDir);
  const variantsRoot = path.resolve(projectRoot, variantsDir);
  const { sourceRelativePath, exportName } = parseVariantSourceId(sourceId);
  const variantDirectory = path.resolve(variantsRoot, sourceRelativePath, exportName);
  assertPathInsideRoot(variantsRoot, variantDirectory, "The requested tweak target is outside the variants workspace.");

  const absolutePath = sourceExtensions
    .map((extension) => path.resolve(variantDirectory, `${variantName}${extension}`))
    .find((candidate) => {
      assertPathInsideRoot(
        variantsRoot,
        candidate,
        "The requested tweak target is outside the variants workspace.",
      );
      return fs.existsSync(candidate);
    });

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

export function parseVariantSourceId(sourceId: string): {
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

function assertSafeVariantName(variantName: string): void {
  if (!variantName.trim()) {
    throw new Error("The tweak request must include a non-empty variantName.");
  }

  if (variantName.includes("/") || variantName.includes("\\") || variantName === "." || variantName === "..") {
    throw new Error("The tweak request contains an invalid variantName.");
  }
}

function assertPathInsideRoot(root: string, candidate: string, errorMessage: string): void {
  const relativePath = path.relative(root, candidate);
  if (
    relativePath === ""
    || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  ) {
    return;
  }

  throw new Error(errorMessage);
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}
