#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureVariantWorkspaceGitignore } from "./workspace";

export type AgentPreset = "codex" | "claude" | "copilot" | "custom";

type InitOptions = {
  cwd: string;
  force: boolean;
  streaming: "auto" | "text" | "none";
  agent: AgentPreset | null;
  command: string | null;
};

const configFileName = "variiant.config.json";

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "init") {
    const options = parseInitOptions(rest);
    await runInit(options);
    return;
  }

  throw new Error(`Unknown command "${command}".`);
}

function parseInitOptions(args: string[]): InitOptions {
  const options: InitOptions = {
    cwd: process.cwd(),
    force: false,
    streaming: "text",
    agent: null,
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
      if (next !== "codex" && next !== "claude" && next !== "copilot" && next !== "custom") {
        throw new Error('--agent must be "codex", "claude", "copilot", or "custom".');
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

async function runInit(options: InitOptions): Promise<void> {
  const resolvedOptions = await resolveInitOptions(options);
  const configPath = writeInitConfig(resolvedOptions);
  process.stdout.write(`Wrote ${configPath}\n`);
}

function printUsage(): void {
  process.stdout.write(
    [
      "variiant CLI",
      "",
      "Usage:",
      "  variiant init [--force] [--cwd <dir>] [--streaming auto|text|none] [--agent codex|claude|copilot|custom] [--command <shell command>]",
      "",
      "Commands:",
      "  init   Create or overwrite variiant.config.json with a local agent bridge config",
      "",
    ].join("\n"),
  );
}

export async function runCli(argv: string[]): Promise<void> {
  await main(argv);
}

export function createDefaultConfig(
  streaming: InitOptions["streaming"] = "text",
  agent: AgentPreset = "codex",
  command: string | null = null,
): Record<string, unknown> {
  const preset = resolveAgentPreset(agent, command);
  return {
    agent: {
      command: preset.command,
      streaming,
      ...(preset.imageCliFlag
        ? {
            image: {
              cliFlag: preset.imageCliFlag,
            },
          }
        : {}),
    },
  };
}

export function writeInitConfig(options: InitOptions): string {
  const resolvedAgent = options.agent ?? (options.command ? "custom" : "codex");
  const configPath = path.join(options.cwd, configFileName);
  if (fs.existsSync(configPath) && !options.force) {
    throw new Error(`${configFileName} already exists. Re-run with --force to overwrite it.`);
  }

  fs.writeFileSync(
    configPath,
    `${JSON.stringify(createDefaultConfig(options.streaming, resolvedAgent, options.command), null, 2)}\n`,
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

function resolveAgentPreset(
  agent: AgentPreset,
  command: string | null,
): {
  command: string | string[];
  imageCliFlag: string | null;
} {
  if (agent === "custom") {
    if (!command || command.trim().length === 0) {
      throw new Error('Custom agent setup requires --command "<shell command>".');
    }

    return {
      command,
      imageCliFlag: null,
    };
  }

  if (agent === "codex") {
    return {
      command: [
        "codex",
        "exec",
        "--json",
        "--sandbox",
        "workspace-write",
        "--skip-git-repo-check",
      ],
      imageCliFlag: "--image",
    };
  }

  if (agent === "claude") {
    return {
      command: [
        "claude",
        "-p",
        "--dangerously-skip-permissions",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
      ],
      imageCliFlag: null,
    };
  }

  return {
    command: [
      "copilot",
      "-p",
      "--allow-all",
    ],
    imageCliFlag: null,
  };
}

async function resolveInitOptions(options: InitOptions): Promise<InitOptions> {
  if (options.command && !options.agent) {
    return {
      ...options,
      agent: "custom",
    };
  }

  if (options.agent) {
    return options;
  }

  const detectedAgents = detectAvailableAgentPresets();
  if (!process.stdin.isTTY || !process.stdout.isTTY || detectedAgents.length === 0) {
    return {
      ...options,
      agent: "codex",
    };
  }

  const agent = await promptForAgentSelection(detectedAgents);
  if (agent !== "custom") {
    return {
      ...options,
      agent,
    };
  }

  const command = await promptForCustomCommand();
  return {
    ...options,
    agent,
    command,
  };
}

export function detectAvailableAgentPresets(): AgentPreset[] {
  return (["codex", "claude", "copilot"] as const).filter((preset) => isCommandAvailable(preset));
}

function isCommandAvailable(command: "codex" | "claude" | "copilot"): boolean {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
  });
  return !result.error;
}

async function promptForAgentSelection(detectedAgents: AgentPreset[]): Promise<AgentPreset> {
  const options = [...detectedAgents, "custom" as const];
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    process.stdout.write("Detected local agent CLIs:\n");
    for (let index = 0; index < options.length; index += 1) {
      const preset = options[index]!;
      process.stdout.write(`  ${index + 1}. ${describeAgentPreset(preset)}\n`);
    }

    const answer = await rl.question(`Choose an agent CLI [1]: `);
    const trimmed = answer.trim();
    if (trimmed.length === 0) {
      return options[0]!;
    }

    const selectedIndex = Number.parseInt(trimmed, 10);
    if (Number.isNaN(selectedIndex) || selectedIndex < 1 || selectedIndex > options.length) {
      throw new Error(`Invalid selection "${trimmed}".`);
    }

    return options[selectedIndex - 1]!;
  } finally {
    rl.close();
  }
}

async function promptForCustomCommand(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question("Enter the agent command to run: ");
    if (answer.trim().length === 0) {
      throw new Error("Custom agent setup requires a non-empty command.");
    }

    return answer;
  } finally {
    rl.close();
  }
}

function describeAgentPreset(agent: AgentPreset): string {
  switch (agent) {
    case "codex":
      return "Codex (`codex exec`, screenshot flag: --image)";
    case "claude":
      return "Claude Code (`claude -p`)";
    case "copilot":
      return "GitHub Copilot (`copilot -p`)";
    case "custom":
      return "Custom command";
  }
}

if (isDirectCliEntry(process.argv[1], import.meta.url)) {
  void main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
