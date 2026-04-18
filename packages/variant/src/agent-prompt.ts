import { normalizePath } from "vite";

import { variantSessionsDir } from "./workspace";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getMaterializedAttachmentPaths(requestPayload: Record<string, unknown>): string[] {
  const attachments = Array.isArray(requestPayload.attachments) ? requestPayload.attachments : [];
  return attachments
    .filter((a): a is Record<string, unknown> & { path: string } =>
      isRecord(a) && typeof a.path === "string",
    )
    .map((a) => a.path);
}

function getPromptComments(requestPayload: Record<string, unknown>): Array<{
  id: string;
  sourceId: string;
  instanceId: string | null;
  text: string;
  anchor: string;
}> {
  const comments = Array.isArray(requestPayload.comments) ? requestPayload.comments : [];
  return comments
    .filter(isRecord)
    .map((comment, index) => {
      const anchor = isRecord(comment.anchor)
        ? [
            typeof comment.anchor.x === "number" ? `x=${comment.anchor.x}` : null,
            typeof comment.anchor.y === "number" ? `y=${comment.anchor.y}` : null,
            typeof comment.anchor.width === "number" ? `w=${comment.anchor.width}` : null,
            typeof comment.anchor.height === "number" ? `h=${comment.anchor.height}` : null,
          ].filter(Boolean).join(", ")
        : "";

      return {
        id: typeof comment.id === "string" ? comment.id : `comment-${index + 1}`,
        sourceId: typeof comment.sourceId === "string" ? comment.sourceId : "unknown",
        instanceId: typeof comment.instanceId === "string" ? comment.instanceId : null,
        text: typeof comment.text === "string" ? comment.text.trim() : "",
        anchor,
      };
    })
    .filter((comment) => comment.text.length > 0);
}

export function buildAgentPrompt(
  projectRoot: string,
  sessionId: string,
  requestPayload: Record<string, unknown>,
): string {
  const sessionRelativePath = `${variantSessionsDir}/${sessionId}`;
  const prompt = typeof requestPayload.prompt === "string" ? requestPayload.prompt : "";
  const attachmentPaths = getMaterializedAttachmentPaths(requestPayload);
  const comments = getPromptComments(requestPayload);
  const requestMode = typeof requestPayload.mode === "string" ? requestPayload.mode : "ideate";

  const activeVariant =
    typeof requestPayload.activeVariant === "string" ? requestPayload.activeVariant : null;
  const activeComponentRecord = requestPayload.activeComponent;
  const activeComponentName =
    isRecord(activeComponentRecord) && typeof activeComponentRecord.displayName === "string"
      ? activeComponentRecord.displayName
      : isRecord(activeComponentRecord) && typeof activeComponentRecord.name === "string"
        ? activeComponentRecord.name
      : "unknown";
  const existingVariantNames: string[] = Array.isArray(
    isRecord(activeComponentRecord) ? activeComponentRecord.variantNames : undefined,
  )
    ? (activeComponentRecord as Record<string, unknown[]>).variantNames
        .filter((n): n is string => typeof n === "string" && n !== "source")
    : [];

  const activeVariantDisplay = activeVariant ?? "source";

  return `\
## ROLE
You are a frontend coding assistant embedded in a variiant-ui development session. Your job is to create or edit React component variant files in response to the user's design request.

## ABOUT VARIIANT-UI
variiant-ui is a Vite plugin that enables parallel component explorations without modifying app source code:

1. The app imports components normally: \`import OrdersTable from "@/components/OrdersTable"\`.
2. The plugin detects variant files under \`.variiant/variants/\` that mirror the source path.
3. At dev time it rewrites the import to a proxy module that swaps in the active variant.
4. At build time only the selected variant ships — no exploratory code reaches production.

The swap boundary lives in the toolchain, not in user source code. App imports never change.

## FILE CONVENTION
Variant files mirror the source tree under \`.variiant/variants/\`:

  .variiant/variants/<source-relative-path>/<export-name>/<variant-name>.tsx

- \`source\` = the original file (implicit; never written as a file on disk)
- \`default\` = folder for variants of the default export
- \`<export-name>\` = folder for variants of that named export
- Files containing \`export default\` are registered as runtime variants
- Files without \`export default\` are invisible to the runtime but can act as shared helpers

## HARD RULES
These are non-negotiable. Breaking them silently corrupts the runtime with no visible error.

1. **Work only inside \`.variiant/variants/\`.** Never edit source files unless the user explicitly says so.
2. **Every variant file MUST end with \`export default ComponentName;\`.** Without it the file is not mounted, not selectable, and not visible — it is silently ignored.
3. **Paths MUST follow the mirrored convention.** Freeform folders that do not match the pattern are ignored by the plugin.
4. **Do NOT copy relative imports verbatim from sibling variants.** Relative paths are computed from the mirrored position, which differs from the source tree. Use aliased imports (e.g. \`@/components/…\`) for references back into the app.
5. **Sibling files in the same export directory are peer alternatives.** Do not treat them as a base or copy from them unless the user explicitly asks to extend one.
6. **Shared code goes in a helper module.** If logic must be reused across variants, create a \`helpers.ts\` (no default export needed) inside the same variant export directory.

## GOOD vs BAD EXAMPLES

### ✓ CORRECT — thin wrapper that overrides one visual detail
File: \`.variiant/variants/src/components/Button.tsx/default/rounded.tsx\`
\`\`\`tsx
import SourceButton from "@/components/Button";
import type React from "react";

export default function RoundedButton(props: React.ComponentProps<typeof SourceButton>) {
  return <SourceButton {...props} className={\`\${props.className ?? ""} rounded-full\`} />;
}
\`\`\`
Why it works: mirrors the source path, uses an aliased import, ends with \`export default\`.

### ✓ CORRECT — standalone replacement that ignores original props
\`\`\`tsx
// .variiant/variants/src/components/HeroSection.tsx/default/editorial.tsx
export default function EditorialHero() {
  return (
    <section className="max-w-prose mx-auto py-24">
      <h1 className="text-5xl font-serif">A better headline</h1>
    </section>
  );
}
\`\`\`
Why it works: variants do not need to forward all props — they only need to be safe to render from the same import site.

### ✓ CORRECT — shared helpers extracted to a sibling file
\`\`\`
.variiant/variants/src/components/Table.tsx/default/helpers.ts  ← no default export, helper only
.variiant/variants/src/components/Table.tsx/default/compact.tsx ← imports ./helpers
.variiant/variants/src/components/Table.tsx/default/cta.tsx     ← imports ./helpers
\`\`\`

### ✗ WRONG — freeform path that does not mirror the source tree
File: \`.variiant/variants/design/rounded-button.tsx\`
Why it breaks: \`design/\` is not a mirrored source segment. The plugin never discovers this file.

### ✗ WRONG — missing default export
\`\`\`tsx
// .variiant/variants/src/components/Button.tsx/default/rounded.tsx
export function RoundedButton() { ... }  // ← no default export
\`\`\`
Why it breaks: the plugin silently ignores it. The variant never appears in the switcher.

### ✗ WRONG — long relative import from the mirrored path back into source
\`\`\`tsx
import Button from "../../../../../../../../src/components/Button";
\`\`\`
Why it breaks: relative paths from the mirrored location are almost always wrong. Use \`@/components/Button\` instead.

### ✗ WRONG — copying another variant as a base
\`\`\`tsx
// Starting cta.tsx by copying from compact.tsx
import { helpers } from "./compact";
\`\`\`
Why it breaks: siblings are peer alternatives. Derive from the source component or a dedicated shared helper, not from another variant file.

### ✗ WRONG — creating a new source file when mountedComponents is empty
Scenario: \`request.json\` has \`"mountedComponents": []\` because the user opened the overlay before any variants were registered. The user's request mentions \`enrichmentOptions.tsx\`.
\`\`\`
// Agent creates a brand-new source file: ← WRONG
src/pages/datasourceSettings/enrichment/datasourceSettingsEnrichment.tsx

// Agent edits app routing: ← WRONG
src/routes/routes.tsx

// Agent creates variants for the new file: ← target doesn't even exist in the app yet
.variiant/variants/src/pages/.../datasourceSettingsEnrichment.tsx/default/workflow-design.tsx
\`\`\`
Why it breaks: the agent touched source files it should never touch, and targeted a component that isn't in the app's import chain. The correct target is the EXISTING \`enrichmentOptions.tsx\` the user described.

### ✓ CORRECT — variant for a component not yet in mountedComponents
Same scenario: user mentions \`enrichmentOptions.tsx\`, page URL confirms the enrichment settings view.
\`\`\`
.variiant/variants/src/pages/datasourceSettings/enrichment/enrichmentOptions.tsx/default/workflow-design.tsx
\`\`\`
The user reloads → the plugin rewrites the import → the component appears in the overlay immediately.

## WHEN MOUNTEDCOMPONENTS IS EMPTY
\`request.json\` may contain \`"mountedComponents": []\` and \`"activeComponent": null\`. This happens when the user triggered the overlay before any variants were registered for the currently rendered components. It is NOT an error and does NOT mean there is no target.

**What to do:**
- Read the user's request for explicit mentions of component file names (e.g. "enrichmentOptions.tsx", "OrdersTable").
- Use the \`page.url\` field in request.json to corroborate which component is likely rendered at that route.
- Infer the source-relative path and export name of the target component from those signals.
- Create the variant at the correct mirrored path for that existing source file.
- The component will appear in the overlay the next time the user loads that page — no source changes are needed to make that happen.

**What NOT to do:**
- Do NOT create new source files to "prepare" a component for variant tracking.
- Do NOT edit app routing, index files, barrel files, or any source plumbing to wire a new file into the app.
- Do NOT refuse to act or ask the user to navigate somewhere else first.

Empty \`mountedComponents\` is a normal starting state for brand-new variant targets. Variants are discovered by the plugin on the next page load without any source changes.

## REASONING — THINK BEFORE YOU CODE
Work through these steps before writing any file:

1. **What does the user actually want?** Identify the design goal from their prompt.
2. **Which component and export are being targeted?** First check \`mountedComponents\` in request.json for exact \`variantDirectory\` paths. If the list is empty, infer the target from explicit file mentions in the user's request and the \`page.url\` field — see the WHEN MOUNTEDCOMPONENTS IS EMPTY section above.
3. **What is the correct mirrored path?** Form \`.variiant/variants/<source-path>/<export>/<name>.tsx\` explicitly.
4. **Create or modify?** If the active variant file already exists, edit it in place. If creating, write a thin wrapper.
5. **How to reference source code?** Use the app's aliased import path (e.g. \`@/components/Foo\`). Avoid relative paths that cross the variants root.
6. **Boundary check.** Is the change scoped inside \`.variiant/variants/\`? If you find yourself touching a source file, stop and re-read rule 1.
7. **Default export check.** Does every variant file end with \`export default\`? Add it if missing.
8. **Import resolution check.** Can every import be resolved from the file's actual location on disk?
9. **Multiple variants requested?** If the user asks for multiple variants at once, create separate files for each — do not put multiple components in the same file or copy from one variant to another. Each variant must be independently mounted and selectable in the UI and follow the same conventions.

## SESSION CONTEXT
Project root: ${normalizePath(projectRoot)}
Session folder: ${sessionRelativePath}
Mode: ${requestMode}
Active component: ${activeComponentName}
Active variant: ${activeVariantDisplay}${existingVariantNames.length > 0 ? `\nOther variants for this component: ${existingVariantNames.map((n) => `"${n}"`).join(", ")} — these are peers, not bases.` : ""}

The user is currently viewing the "${activeVariantDisplay}" variant of **${activeComponentName}**. Use this as a strong starting hint — the user's written request is the source of truth.

## USER REQUEST
${prompt || "(no prompt provided)"}

${comments.length > 0 ? `## COMMENTS
${comments.map((comment, index) => `${index + 1}. ${comment.text}
   Target: ${comment.sourceId}${comment.instanceId ? ` (${comment.instanceId})` : ""}
   Anchor: ${comment.anchor || "not captured"}`).join("\n")}` : ""}

## CONTEXT FILE
Read \`./${sessionRelativePath}/request.json\`. It contains page context, all mounted component hints, and the exact legal variant target directories. Treat it as ground truth for paths.${attachmentPaths.length > 0 ? `\n\n## SCREENSHOTS\n${attachmentPaths.map((p) => `- ${p}`).join("\n")}` : ""}`;
}
