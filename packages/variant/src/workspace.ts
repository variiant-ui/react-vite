import fs from "node:fs";
import path from "node:path";

export const variantWorkspaceDirName = ".variiant";
export const defaultVariantsDir = `${variantWorkspaceDirName}/variants`;
export const legacyVariantsDir = ".variants";
export const variantSessionsDir = `${variantWorkspaceDirName}/sessions`;

const sessionsIgnoreRule = "sessions/";

export function getWatchedVariantDirs(configuredVariantsDir?: string): string[] {
  if (configuredVariantsDir) {
    return [configuredVariantsDir];
  }

  return [defaultVariantsDir, legacyVariantsDir];
}

export function resolveVariantsDir(projectRoot: string, configuredVariantsDir?: string): string {
  if (configuredVariantsDir) {
    return configuredVariantsDir;
  }

  if (fs.existsSync(path.join(projectRoot, defaultVariantsDir))) {
    return defaultVariantsDir;
  }

  if (fs.existsSync(path.join(projectRoot, legacyVariantsDir))) {
    return legacyVariantsDir;
  }

  return defaultVariantsDir;
}

export function ensureVariantWorkspaceGitignore(projectRoot: string): string {
  const workspaceDir = path.join(projectRoot, variantWorkspaceDirName);
  const gitignorePath = path.join(workspaceDir, ".gitignore");
  fs.mkdirSync(workspaceDir, { recursive: true });

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${sessionsIgnoreRule}\n`);
    return gitignorePath;
  }

  const current = fs.readFileSync(gitignorePath, "utf8");
  const hasRule = current.split(/\r?\n/).some((line) => line.trim() === sessionsIgnoreRule);
  if (hasRule) {
    return gitignorePath;
  }

  const suffix = current.length > 0 && !current.endsWith("\n")
    ? `\n${sessionsIgnoreRule}\n`
    : `${sessionsIgnoreRule}\n`;
  fs.writeFileSync(gitignorePath, `${current}${suffix}`);
  return gitignorePath;
}
