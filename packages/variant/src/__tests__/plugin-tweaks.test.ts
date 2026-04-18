import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  parseVariantSourceId,
  resolveVariantTweakTarget,
} from "../plugin-tweaks";

describe("plugin tweak target resolution", () => {
  it("parses default and named-export source ids", () => {
    expect(parseVariantSourceId("src/components/Button.tsx")).toEqual({
      sourceRelativePath: "src/components/Button.tsx",
      exportName: "default",
    });
    expect(parseVariantSourceId("src/components/Button.tsx#PrimaryButton")).toEqual({
      sourceRelativePath: "src/components/Button.tsx",
      exportName: "PrimaryButton",
    });
  });

  it("resolves an existing variant file inside the variants workspace", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variiant-tweak-target-"));
    const targetFile = path.join(
      projectRoot,
      ".variiant",
      "variants",
      "src",
      "components",
      "Hero.tsx",
      "default",
      "v2.tsx",
    );
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, "export default function Hero(){ return <div />; }");

    const result = resolveVariantTweakTarget(
      projectRoot,
      undefined,
      {
        sourceId: "src/components/Hero.tsx",
        variantName: "v2",
      },
      [".tsx"],
    );

    expect(result.relativePath).toBe(".variiant/variants/src/components/Hero.tsx/default/v2.tsx");
  });

  it("rejects traversal through variantName", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variiant-tweak-target-"));

    expect(() =>
      resolveVariantTweakTarget(
        projectRoot,
        undefined,
        {
          sourceId: "src/components/Hero.tsx",
          variantName: "../escape",
        },
        [".tsx"],
      )
    ).toThrow(/invalid variantName/i);
  });

  it("rejects source ids that resolve outside the variants workspace", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "variiant-tweak-target-"));

    expect(() =>
      resolveVariantTweakTarget(
        projectRoot,
        undefined,
        {
          sourceId: "../escape/Hero.tsx",
          variantName: "v2",
        },
        [".tsx"],
      )
    ).toThrow(/outside the variants workspace/i);
  });
});
