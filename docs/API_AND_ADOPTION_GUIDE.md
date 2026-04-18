# variiant-ui React/Vite API and Adoption Guide

## Product story

`@variiant-ui/react-vite` should feel almost invisible until a team wants to explore UI alternatives.

The adoption bar remains:

- unchanged component imports
- no source-level wrappers around app components
- no provider mounted in app code
- exploratory files outside the production component tree
- deterministic production selection

The runtime direction is evolving, but that adoption bar does not change.

## Public API

Current public API:

- `variantPlugin()` for Vite
- `.variiant/variants/` as the canonical variant workspace
- optional top-level `variiant.config.json` for the local agent bridge
- optional `agent.refresh` config or `variantPlugin({ agentRefresh })` override
- mirrored source-path folders for default and named export targets
- only default-exporting files inside those target folders are treated as runtime variants
- fallback resolution of unresolved variant-relative imports against the original source module directory
- one installable package for the whole browser workflow

That remains the whole integration surface.

## Current runtime surface

Today the package ships:

- a transient in-browser overlay with explicit `Ideate`, `Review`, and `Tweak` modes
- keyboard shortcuts for overlay/canvas toggling and variant navigation
- a fullscreen comparison canvas
- contextual comments and sketch attachments for ideation sessions
- copy-only deterministic tweak support for generated variants
- local agent bridge support for creating and editing variant files

## Target runtime direction

The product direction is now concretely organized around three workflows:

- `Ideate`: prompt + contextual comments + sketch attachment + component targeting
- `Review`: clearer result presentation on the live page and in a focused component comparison surface
- `Tweak`: deterministic post-generation edits such as copy changes and later bounded Tailwind/token adjustments

This direction does not change the package installation or import model. It changes the browser workflow layered on top of the same runtime and plugin architecture.

## Integration

### 1. Install the package

From the consuming app root:

```bash
npm install @variiant-ui/react-vite
npm exec variiant init
```

`npm exec variiant init` uses the app-local package binary and writes `variiant.config.json`. It also creates `.variiant/.gitignore` so session files stay out of the repo.

### 2. Add the Vite plugin

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { variantPlugin } from "@variiant-ui/react-vite";

export default defineConfig({
  plugins: [variantPlugin(), react()],
});
```

### 3. Keep imports unchanged

```tsx
import OrdersTable from "@/components/OrdersTable";
```

Variant still does not require app code to import a generated proxy or mount a provider.

### 4. Add variant files under `.variiant/variants/`

```text
.variiant/
  .gitignore
  variants/
    src/
      components/
        OrdersTable.tsx/
          default/
            compact.tsx
            cta.tsx
```

The source component remains the implicit default variant named `source`.

### 5. Optional: enable the local agent bridge

```json
{
  "agent": {
    "command": ["codex", "exec", "--json", "--sandbox", "workspace-write", "--skip-git-repo-check"],
    "streaming": "text",
    "refresh": "hmr",
    "logFile": true,
    "image": {
      "cliFlag": "--image"
    }
  }
}
```

The current bridge sends one structured request per session and stores it under `.variiant/sessions/<session-id>/`.

That session model is important because it is also the natural seam for future:

- comment attachments
- sketch attachments
- review metadata
- deterministic tweak operations

## How it works

In development:

- the plugin bootstraps the browser runtime and keybindings
- the plugin scans `.variiant/variants/`
- imports for variant-enabled source files are rewritten to virtual proxy modules
- the proxy exposes the source component plus discovered exploratory variants
- the runtime selects between them on the live page

In production:

- imports are still rewritten
- but they resolve to only one production implementation per component boundary
- non-selected exploratory files are excluded from the production graph

That keeps the app import stable while moving Variant behavior into the toolchain.

## Compatibility model

Compatibility remains boundary-based, not strict-type-based.

The important rule is:

- every variant must be safe to render from the same component import boundary

This is still allowed:

- source component consumes `items`
- variant ignores `items`
- variant renders a static CTA instead

As long as the import boundary remains safe, the swap is valid.

## Production safety contract

Variant must guarantee all of the following:

- normal app imports remain the source of truth
- exploratory files live outside the main source tree
- development can expose multiple variants for a component
- production imports only the selected implementation
- non-selected variants are excluded from the production import graph
- runtime-only surfaces remain development-only

This contract is why the architecture stays bundler-first rather than source-wrapper-first.

## Workflow direction

The runtime direction now assumes three layers of interaction:

### Ideate

The user provides intent plus context. Over time this should include:

- component targeting
- contextual comments
- sketch attachments
- screenshots and page metadata

### Review

The user inspects what changed and compares alternatives. Over time this should emphasize:

- live-page preview of generated variants
- component-focused comparison surfaces
- explicit result summaries after a run

### Tweak

The user makes cheap follow-up edits without another full prompt. Planned deterministic scopes are:

- copy changes first
- static Tailwind utility adjustments later
- token/style variable adjustments after that

## Current scope

This repo currently implements:

- Vite plugin integration
- development runtime overlay and keybindings
- fullscreen comparison canvas
- production-safe selected-variant builds
- `.variiant/variants` conventions, with fallback to legacy `.variants`
- a single package containing the Vite plugin, browser runtime, and React adapter
- local agent sessions backed by structured request files

## Planned direction

The next architectural direction is:

- transient bottom-centered dock instead of a generic floating utility surface
- explicit ideation tool modes
- removal of page-mode comparison as the target direction
- richer structured request payloads
- deterministic tweak tooling beside the agent workflow

## Why this is adoptable

The package still matches how teams already think:

- the component stays where it already lives
- exploratory work stays in `.variiant/variants/`
- the bundler handles the swap boundary
- the runtime browser workflow adds context and review, not source churn

That keeps the product easy to adopt even as the browser workflow becomes more ambitious.
