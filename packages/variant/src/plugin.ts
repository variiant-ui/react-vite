import fs from "node:fs";
import path from "node:path";

import type { Plugin } from "vite";

export type VariantManifest = {
  source: string;
  exportName?: string;
  selected?: string;
  displayName?: string;
  variants: string[] | Record<string, string>;
};

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

const sourceExtensions = [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs", ".cts", ".cjs"];

export function variantPlugin(options: VariantPluginOptions = {}): Plugin {
  let projectRoot = "";
  let registry = new Map<string, VariantRegistryEntry>();

  const refreshRegistry = (): void => {
    projectRoot = options.projectRoot ? path.resolve(options.projectRoot) : process.cwd();
    registry = loadRegistry(projectRoot, options.variantsDir ?? ".variants");
  };

  return {
    name: "variiant-react-vite",
    enforce: "pre",
    configResolved(config) {
      projectRoot = options.projectRoot ? path.resolve(options.projectRoot) : config.root;
      registry = loadRegistry(projectRoot, options.variantsDir ?? ".variants");
    },
    configureServer(server) {
      server.watcher.add(path.join(projectRoot, options.variantsDir ?? ".variants"));
      const reload = (): void => {
        refreshRegistry();
        server.ws.send({ type: "full-reload" });
      };

      server.watcher.on("add", reload);
      server.watcher.on("change", reload);
      server.watcher.on("unlink", reload);
    },
    async resolveId(source, importer, resolveOptions) {
      if (!importer || source.startsWith("\0")) {
        return null;
      }

      const normalizedImporter = normalizePath(importer);
      if (
        normalizedImporter.startsWith("\0variant-proxy:") ||
        normalizedImporter.includes("/.variants/")
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

function loadRegistry(projectRoot: string, variantsDirName: string): Map<string, VariantRegistryEntry> {
  const variantsRoot = path.join(projectRoot, variantsDirName);
  const results = new Map<string, VariantRegistryEntry>();

  if (!fs.existsSync(variantsRoot)) {
    return results;
  }

  loadConventionalVariants(projectRoot, variantsRoot, results);
  loadManifestVariants(projectRoot, variantsRoot, results);

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

function loadManifestVariants(
  projectRoot: string,
  variantsRoot: string,
  results: Map<string, VariantRegistryEntry>,
): void {
  const configPaths = walkForVariantConfigs(variantsRoot);

  for (const configPath of configPaths) {
    const configDir = path.dirname(configPath);
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as VariantManifest;

    if (!parsed.source || typeof parsed.source !== "string") {
      throw new Error(`Variant config ${configPath} must declare a string "source".`);
    }

    if (!parsed.variants || (!Array.isArray(parsed.variants) && typeof parsed.variants !== "object")) {
      throw new Error(`Variant config ${configPath} must declare "variants".`);
    }

    const sourceRelativePath = normalizePath(parsed.source);
    const sourceAbsolutePath = normalizePath(path.resolve(projectRoot, sourceRelativePath));
    const exportName = parsed.exportName ?? "default";
    const variantImportPaths = resolveVariantImportPaths(configDir, parsed.variants);
    const selected = parsed.selected ?? "source";

    if (selected !== "source" && !(selected in variantImportPaths)) {
      throw new Error(
        `Variant config ${configPath} selects "${selected}" but no matching variant file was found.`,
      );
    }

    const entry = ensureRegistryEntry(results, projectRoot, sourceAbsolutePath, sourceRelativePath);
    const target = ensureTargetEntry(entry, {
      exportName,
      selected,
      displayName: parsed.displayName ?? deriveDisplayName(sourceRelativePath, exportName),
    });

    if (Object.keys(target.variantImportPaths).length > 0) {
      throw new Error(
        `Duplicate variant target for ${sourceRelativePath}#${exportName}. Remove either the manifest or the conventional variant folder.`,
      );
    }

    target.selected = selected;
    target.displayName = parsed.displayName ?? target.displayName;
    target.variantImportPaths = variantImportPaths;
  }
}

function walkForVariantConfigs(rootDir: string): string[] {
  const results: string[] = [];

  const walk = (currentDir: string): void => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name === "variant.json") {
        results.push(entryPath);
      }
    }
  };

  walk(rootDir);
  return results.sort();
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
        entry.name !== "variant.json" &&
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

function resolveVariantImportPaths(
  configDir: string,
  variants: VariantManifest["variants"],
): Record<string, string> {
  if (Array.isArray(variants)) {
    return Object.fromEntries(
      variants.map((variantName) => [
        variantName,
        toImportPath(resolveFile(configDir, variantName)),
      ]),
    );
  }

  return Object.fromEntries(
    Object.entries(variants).map(([variantName, relativePath]) => [
      variantName,
      toImportPath(resolveCustomPath(configDir, relativePath)),
    ]),
  );
}

function resolveFile(configDir: string, variantName: string): string {
  for (const extension of sourceExtensions) {
    const candidate = path.join(configDir, `${variantName}${extension}`);
    if (fs.existsSync(candidate)) {
      return normalizePath(candidate);
    }
  }

  throw new Error(
    `Could not find variant file for "${variantName}" in ${configDir}. Expected one of ${sourceExtensions.join(", ")}.`,
  );
}

function resolveCustomPath(configDir: string, relativePath: string): string {
  const absolute = normalizePath(path.resolve(configDir, relativePath));
  if (fs.existsSync(absolute)) {
    return absolute;
  }

  throw new Error(`Variant file ${relativePath} does not exist in ${configDir}.`);
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
