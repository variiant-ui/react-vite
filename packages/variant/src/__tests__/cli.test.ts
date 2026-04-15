import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createDefaultConfig, isDirectCliEntry, writeInitConfig } from "../cli";

describe("variiant cli", () => {
  it("writes a default variiant.config.json file", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variiant-cli-"));
    const configPath = writeInitConfig({
      cwd: tempRoot,
      force: false,
      streaming: "text",
      agent: "codex",
      command: null,
    });

    expect(path.basename(configPath)).toBe("variiant.config.json");
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual(createDefaultConfig("text", "codex", null));
    expect(fs.readFileSync(path.join(tempRoot, ".variiant", ".gitignore"), "utf8")).toBe("sessions/\n");
  });

  it("writes a custom agent command when requested", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variiant-cli-custom-"));
    const configPath = writeInitConfig({
      cwd: tempRoot,
      force: false,
      streaming: "none",
      agent: "custom",
      command: "claude --print",
    });

    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual(
      createDefaultConfig("none", "custom", "claude --print"),
    );
    expect(path.basename(configPath)).toBe("variiant.config.json");
  });

  it("uses a valid codex exec default command", () => {
    expect(createDefaultConfig("text", "codex", null)).toEqual({
      agent: {
        command: [
          "codex",
          "exec",
          "--json",
          "--sandbox",
          "workspace-write",
          "--skip-git-repo-check",
        ],
        streaming: "text",
        image: {
          cliFlag: "--image",
        },
      },
    });
  });

  it("appends the sessions ignore rule without clobbering an existing workspace gitignore", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variiant-cli-gitignore-"));
    const workspaceDir = path.join(tempRoot, ".variiant");
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, ".gitignore"), "artifacts/\n");

    writeInitConfig({
      cwd: tempRoot,
      force: false,
      streaming: "text",
      agent: "codex",
      command: null,
    });

    expect(fs.readFileSync(path.join(workspaceDir, ".gitignore"), "utf8")).toBe("artifacts/\nsessions/\n");
  });

  it("treats symlinked bin shims as direct cli execution", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variiant-cli-link-"));
    const actualPath = path.join(tempRoot, "cli.js");
    const symlinkPath = path.join(tempRoot, "variiant");

    fs.writeFileSync(actualPath, "");
    fs.symlinkSync(actualPath, symlinkPath);

    expect(isDirectCliEntry(symlinkPath, pathToFileURL(actualPath).href)).toBe(true);
  });
});
