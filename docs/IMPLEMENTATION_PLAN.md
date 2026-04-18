# variiant-ui React/Vite Implementation Plan

## Goal

Implement the next product phase for `@variiant-ui/react-vite`:

- move from a generic floating-bar workflow to explicit `Ideate`, `Review`, and `Tweak` workflows
- remove page-mode comparison from the target architecture
- support richer prompt context through comments and sketches
- add deterministic post-generation tweaks, starting with copy
- preserve the existing package boundary: one package, one Vite plugin, one browser workflow

## Current implementation status

The current repo now includes:

- explicit `Ideate`, `Review`, and `Tweak` dock modes
- component-focused review results instead of page-mode comparison as the primary direction
- contextual comments and sketch attachments in runtime state and session payloads
- copy-only deterministic tweak analysis and apply routes for generated variants

The remaining work in this plan is mostly about expanding the deterministic tweak surface and tightening the overall workflow polish.

## Architectural constraints

These constraints stay fixed while the runtime evolves:

- public integration remains `variantPlugin()` plus `.variiant/variants/`
- business logic belongs in `packages/variant/src/runtime-core.ts`
- browser-only interaction belongs in `packages/variant/src/runtime-dom.ts`
- React-specific rendering concerns belong in `packages/variant/src/runtime.tsx`
- the runtime state model must not be pushed back into React components just because the UI is React-rendered
- the live app remains the primary contextual surface
- the old page-mode comparison direction is obsolete

## Product model to implement

The browser runtime should evolve into three coordinated workflows.

### 1. Ideate

The user is directing the next change.

Artifacts:

- prompt text
- active component target
- contextual comments
- optional sketch attachment
- page metadata

### 2. Review

The user is evaluating generated results.

Artifacts:

- generated-variant result summaries
- live-page preview state
- component-family comparison state

### 3. Tweak

The user is making bounded post-generation edits.

Artifacts:

- deterministic tweak manifest
- selected tweak operations
- local rewrite results

## State model changes

### `runtime-core.ts`

Add explicit state for:

- `toolMode`: `none | inspect | comment | sketch | tweak`
- `dockMode`: `ideate | review | tweak`
- `comments`
- `commentDraft`
- `commentVisibility`
- `sketch`
- `reviewSession`
- `generatedResults`
- `tweakCatalog`
- `tweakOperations`

Remove page-mode from the target state model:

- replace `VariantCanvasMode = "components" | "pages"` with a component-focused review model
- keep a comparison surface, but treat it as component-stack review, not duplicated page preview

Retain:

- mounted component tracking
- active component selection
- temporary selections
- keyboard shortcut configuration
- agent run state

### Suggested state additions

```ts
type VariantToolMode = "none" | "inspect" | "comment" | "sketch" | "tweak";
type VariantDockMode = "ideate" | "review" | "tweak";

type VariantComment = {
  id: string;
  sourceId: string;
  instanceId: string | null;
  text: string;
  anchor: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  viewportPoint: {
    x: number;
    y: number;
  };
  visibilityKey: string | null;
};

type VariantSketchAttachment = {
  status: "empty" | "ready";
  imagePath: string | null;
  width: number | null;
  height: number | null;
};

type VariantGeneratedResult = {
  sourceId: string;
  variantNames: string[];
  changedFiles: string[];
};

type VariantTweakCatalogEntry =
  | { kind: "text"; id: string; label: string; currentValue: string }
  | { kind: "tailwind-utility"; id: string; group: string; currentValue: string; allowedValues: string[] };
```

## Browser/UI plan

### `runtime-dom.ts`

Replace the current browser chrome direction with a transient bottom-centered dock.

The dock should support:

- prompt entry
- small explicit tool buttons
- attachment chips
- run status
- result summaries
- tweak controls

New DOM responsibilities:

- hover targeting and boundary highlighting
- comment placement
- comment bubble rendering
- visibility-aware comment display
- sketch canvas lifecycle
- review result presentation
- deterministic tweak action dispatch

The live page should remain interactive except while sketch mode is active.

## Local proving support

The dev bootstrap should prefer the package source runtime when the package is linked from a local checkout and `src/runtime-api.ts` is present.

That keeps the proving workflow honest:

- runtime and overlay changes propagate through the host app without a manual package rebuild
- published installs still fall back to the packaged `dist` runtime entry
- plugin-level changes still require rebuilding the package, because the consumer app is executing the built plugin

### Interaction rules

- `Escape` closes the current tool or surface first
- tool-local single-letter shortcuts are acceptable only when the dock is open and focus is not in a text field
- global shortcuts must remain safe outside editable inputs
- sketch mode captures pointer interaction and disables normal page interaction while active

## Request/session plan

### Current seam

The plugin already materializes one request per run under `.variiant/sessions/<session-id>/`.

Keep that seam and extend it.

### `plugin.ts`

Extend session payload materialization to support:

- comment attachments
- sketch attachments
- richer component target metadata
- review metadata
- deterministic tweak requests

The request payload should evolve from a plain prompt-focused record into a structured session envelope.

Suggested shape:

```json
{
  "mode": "ideate",
  "prompt": "Make this card feel more premium.",
  "page": {
    "title": "...",
    "url": "..."
  },
  "activeComponent": {
    "sourceId": "...",
    "sourceRelativePath": "...",
    "exportName": "default",
    "variantDirectory": "..."
  },
  "comments": [
    {
      "id": "comment-1",
      "sourceId": "...",
      "instanceId": "...",
      "text": "Stronger CTA here",
      "anchor": { "x": 12, "y": 48, "width": 220, "height": 56 },
      "viewportPoint": { "x": 44, "y": 70 }
    }
  ],
  "attachments": [
    {
      "kind": "sketch",
      "path": ".variiant/sessions/.../sketch.png"
    }
  ]
}
```

## Deterministic tweak plan

### Product decision

Treat tweaks as a sibling workflow to agent prompting, not as a reduced prompt.

### Execution model

Add a deterministic local rewrite pipeline beside the existing agent bridge:

- `analyze` the active variant file
- produce a bounded tweak catalog
- apply typed operations
- rewrite the file locally

The first supported tweak class should be copy only.

### Phase 1 deterministic support

Support only:

- literal JSX text nodes
- literal string prop values such as `title`, `aria-label`, or button text in the variant file

Do not support yet:

- i18n keys
- dynamic expressions
- computed text
- source-file edits

### Phase 2 deterministic support

Add static Tailwind utility tweaks for literal class strings only.

Supported categories:

- spacing
- gap
- radius
- border width
- typography size/weight

Do not support computed utilities until there is a reliable parser and rewrite strategy.

### Likely implementation split

Add a local analyzer/executor module set under `packages/variant/src/`:

- `tweak-analyzer.ts`
- `tweak-operations.ts`
- `tweak-tailwind.ts`
- `tweak-text.ts`

If that grows large later, split it into its own internal module while keeping the public package surface unchanged.

## File-by-file implementation plan

### `packages/variant/src/runtime-core.ts`

Implement:

- new dock/tool/review/tweak state
- comment/sketch/tweak actions
- removal of page-mode from target canvas state
- derived selectors for visible comments, active review results, and tweak entries

### `packages/variant/src/runtime-dom.ts`

Implement:

- bottom-centered dock rendering
- ideate/review/tweak UI sections
- DOM hit-testing for comment placement
- sketch canvas overlay
- comment visibility updates
- review result summaries and comparison entrypoints
- tweak controls and execution requests

### `packages/variant/src/runtime-api.ts`

Expose any minimal new helpers required for:

- opening specific dock modes
- reading richer runtime state if needed by proving/debug tools

Keep this surface small.

### `packages/variant/src/plugin.ts`

Implement:

- richer request payload storage
- support for deterministic tweak execution routes or commands
- session materialization for comment and sketch assets
- removal of page-mode assumptions from any review/session code

### `packages/variant/src/agent-prompt.ts`

Update the prompt template so local agents understand:

- comment attachments
- sketch attachments
- structured target metadata
- peer-variant context
- the distinction between ideation and tweak workflows when relevant

### `packages/variant/src/cli.ts`

Keep `init` as-is for local agent bootstrap.

Plan for future subcommands:

- `variiant tweak analyze`
- `variiant tweak apply`

These can remain internal at first if the browser runtime shells into them through plugin-controlled code paths.

### Tests

Add or expand tests for:

- runtime-core state transitions
- request/session serialization
- tweak analysis and rewrite correctness
- review-state derivation
- comment/sketch payload handling

## Delivery phases

### Phase 0: Documentation and architecture lock

Deliver:

- updated docs
- roadmap
- implementation plan

### Phase 1: Dock and review reset

Deliver:

- bottom-centered transient dock
- explicit dock modes
- removal of page-mode from the target runtime direction
- component-focused review surface

### Phase 2: Comment mode

Deliver:

- DOM hover highlighting
- contextual comments
- comment attachment serialization
- visibility-aware comment rendering

### Phase 3: Sketch mode

Deliver:

- overlay drawing canvas
- sketch attachment lifecycle
- prompt payload integration

### Phase 4: Review legibility

Deliver:

- run summaries
- clearer generated-result presentation
- live-page preview affordances
- component-stack comparison entrypoint

### Phase 5: Deterministic tweaks v1

Deliver:

- copy-only tweak analysis
- inline tweak UI
- deterministic file rewrites

### Phase 6: Deterministic tweaks v2

Deliver:

- static Tailwind utility tweaks
- bounded utility-group controls
- rewrite validation and fallback behavior

## Proof plan

The proving app should validate this direction in order:

1. Dock clarity on a real route
2. Comment placement and visibility behavior
3. Sketch attach/discard flow
4. Multi-variant result discoverability
5. Copy-tweak speed versus full prompt cost
6. Tailwind tweak correctness on static class strings

## Risks

### UI complexity risk

If ideate, review, and tweak are mixed in one undifferentiated surface, the runtime will become harder to learn instead of easier.

Mitigation:

- explicit modes
- minimal chrome
- clear transitions between run state and review state

### DOM anchoring risk

Comments anchored to ephemeral DOM nodes may drift.

Mitigation:

- anchor to known mounted component metadata where possible
- keep viewport coordinates as a fallback
- hide comments when the target is not visible rather than forcing stale overlays

### Sketch interaction risk

Trying to draw while preserving live page pointer interaction will feel unreliable.

Mitigation:

- sketch mode owns pointer interaction completely while active

### Deterministic tweak risk

Supporting all style systems too early will make the rewrite engine brittle.

Mitigation:

- ship copy-only first
- support only literal Tailwind utility strings next
- fall back to the agent workflow for non-deterministic changes

## Exit criteria

This implementation phase is successful when:

- the browser workflow is clearly split into ideate, review, and tweak modes
- page-mode comparison is gone from the target runtime direction
- structured context meaningfully reduces prompt verbosity
- generated results are easier to understand after a run
- copy tweaks work without using the local agent bridge
- later style tweaks can be added without reworking the session or state architecture
