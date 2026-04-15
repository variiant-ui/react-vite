#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureVariantWorkspaceGitignore } from "./workspace";

type InitOptions = {
  cwd: string;
  force: boolean;
  streaming: "auto" | "text" | "none";
  agent: "codex" | "custom";
  command: string | null;
};

const configFileName = "variiant.config.json";

function main(argv: string[]): void {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "init") {
    const options = parseInitOptions(rest);
    runInit(options);
    return;
  }

  throw new Error(`Unknown command "${command}".`);
}

function parseInitOptions(args: string[]): InitOptions {
  const options: InitOptions = {
    cwd: process.cwd(),
    force: false,
    streaming: "text",
    agent: "codex",
    command: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--force") {
      options.force = true;
      continue;
    }

    if (token === "--cwd") {
      const next = args[index + 1];
      if (!next) {
        throw new Error("--cwd requires a value.");
      }

      options.cwd = path.resolve(next);
      index += 1;
      continue;
    }

    if (token === "--streaming") {
      const next = args[index + 1];
      if (next !== "auto" && next !== "text" && next !== "none") {
        throw new Error('--streaming must be one of "auto", "text", or "none".');
      }

      options.streaming = next;
      index += 1;
      continue;
    }

    if (token === "--agent") {
      const next = args[index + 1];
      if (next !== "codex" && next !== "custom") {
        throw new Error('--agent must be "codex" or "custom".');
      }

      options.agent = next;
      index += 1;
      continue;
    }

    if (token === "--command") {
      const next = args[index + 1];
      if (!next) {
        throw new Error("--command requires a value.");
      }

      options.command = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown init option "${token}".`);
  }

  return options;
}

function runInit(options: InitOptions): void {
  const configPath = writeInitConfig(options);
  process.stdout.write(`Wrote ${configPath}\n`);
}

function printUsage(): void {
  process.stdout.write(
    [
      "variiant CLI",
      "",
      "Usage:",
      "  variiant init [--force] [--cwd <dir>] [--streaming auto|text|none] [--agent codex|custom] [--command <shell command>]",
      "",
      "Commands:",
      "  init   Create or overwrite variiant.config.json with a local agent bridge config",
      "",
    ].join("\n"),
  );
}

export function runCli(argv: string[]): void {
  main(argv);
}

export function createDefaultConfig(
  streaming: InitOptions["streaming"] = "text",
  agent: InitOptions["agent"] = "codex",
  command: string | null = null,
): Record<string, unknown> {
  const resolvedCommand = resolveAgentCommand(agent, command);
  return {
    agent: {
      command: resolvedCommand,
      streaming,
      ...(agent === "codex"
        ? {
            image: {
              cliFlag: "--image",
            },
          }
        : {}),
    },
  };
}

export function writeInitConfig(options: InitOptions): string {
  const configPath = path.join(options.cwd, configFileName);
  if (fs.existsSync(configPath) && !options.force) {
    throw new Error(`${configFileName} already exists. Re-run with --force to overwrite it.`);
  }

  fs.writeFileSync(
    configPath,
    `${JSON.stringify(createDefaultConfig(options.streaming, options.agent, options.command), null, 2)}\n`,
  );
  ensureVariantWorkspaceGitignore(options.cwd);
  return configPath;
}

export function isDirectCliEntry(argvPath: string | undefined, moduleUrl: string): boolean {
  if (!argvPath) {
    return false;
  }

  try {
    const invokedPath = fs.realpathSync(path.resolve(argvPath));
    const modulePath = fs.realpathSync(fileURLToPath(moduleUrl));
    return invokedPath === modulePath;
  } catch {
    return moduleUrl === pathToFileURL(argvPath).href;
  }
}

function resolveAgentCommand(agent: InitOptions["agent"], command: string | null): string | string[] {
  if (agent === "custom") {
    if (!command || command.trim().length === 0) {
      throw new Error('Custom agent setup requires --command "<shell command>".');
    }

    return command;
  }

  return [
    "codex",
    "exec",
    "--json",
    "--sandbox",
    "workspace-write",
    "--skip-git-repo-check",
  ];
}

if (isDirectCliEntry(process.argv[1], import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
