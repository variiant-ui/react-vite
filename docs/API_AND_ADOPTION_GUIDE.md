# variiant-ui React/Vite API and Adoption Guide

## Product story

`@variiant-ui/react-vite` should feel invisible to product engineers until they want it.

The adoption bar is:

- no source-level wrapper around every variantable component
- no runtime provider mounted in app code
- no exploratory files mixed into the production component tree
- clear production behavior

The implementation in this repo is designed around that bar.

## Public API

Current public API:

- `variantPlugin()` for Vite
- `.variiant/variants/` as the canonical variant workspace
- optional top-level `variiant.config.json` for the local agent bridge
- optional `agent.refresh` config or `variantPlugin({ agentRefresh })` override for post-agent reload behavior
- mirrored source-path folders for default and named export targets
- only default-exporting files inside those target folders are treated as runtime variants
- fallback resolution of unresolved variant-relative imports against the original source module directory
- one installable package for the whole browser workflow

That is the whole integration surface.

## Integration

### 1. Install the package

From the consuming app root:

```bash
npm install @variiant-ui/react-vite
npm exec variiant init
```

`npm exec variiant init` is the default post-install command because it uses the app-local package binary without requiring a custom npm script. If it detects local `codex`, `claude`, or `copilot` CLIs, it prompts the user to choose which one to configure and writes the matching default command. Codex gets the `--image` screenshot flag automatically. If a team wants a script wrapper, they can add `"variiant": "variiant"` to `package.json` and run `npm run variiant -- init`. Avoid `npx variiant init` for local proving or local file installs because it can fall through to the registry instead of the local dependency.

### 2. Add the Vite plugin

Edit the consuming app's `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { variantPlugin } from "@variiant-ui/react-vite";

export default defineConfig({
  plugins: [variantPlugin(), react()],
});
```

### 3. Keep app imports unchanged

```tsx
import OrdersTable from "@/components/OrdersTable";
```

Variant does not require app code to import a generated proxy or mount a provider.

### 4. Add a top-level variant entry

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

Create `variiant.config.json` in the app root:

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

The recommended bootstrap path is `npm exec variiant init`, which writes the nested config shape above and creates `.variiant/.gitignore` with `sessions/` ignored. Run it from the consuming app root after install. For compatibility, the loader also accepts flat keys such as `"agent.command"`, but the documented convention is the nested `agent` object only. Claude and Copilot presets write their own non-interactive command defaults; only Codex currently adds an explicit `agent.image.cliFlag`. The Claude preset also enables `stream-json`, `--verbose`, and `--include-partial-messages` so the overlay can show incremental text updates instead of waiting for final output only.

That enables prompt submission from the floating bar to a local CLI running inside the project root. While a run is active, the prompt area becomes a compact latest-message progress strip instead of a raw terminal log. `agent.refresh` defaults to `"hmr"`, which lets agent-created variant changes become swappable immediately by reloading only the affected variiant proxy modules. Set `"refresh": "full-reload"` to restore page refresh behavior, or force it from the Vite side with `variantPlugin({ agentRefresh: "full-reload" })` when app teams prefer not to commit that choice into `variiant.config.json`.

If `agent.image.cliFlag` is configured, Ask Agent also exposes an `Attach <component name> screenshot` checkbox that captures the active component at 1x, stores it in the request session, and passes the saved file to the CLI with that flag. If `agent.logFile` is `true`, the full emitted agent event stream is also written to `.variiant/sessions/<session-id>/agent-events.ndjson` for later inspection. The bridge is development-only and rejects agent working directories that escape the app root.

## How it works

In development:

- the plugin bootstraps the browser overlay and keybindings even before any variant folders exist
- the plugin scans `.variiant/variants/`
- when the app imports a component that has a matching mirrored variant folder, the plugin rewrites that import to a virtual proxy module
- the proxy exports the source component plus all discovered exploratory variants
- the browser runtime exposes those variants in the overlay, fullscreen comparison canvas, and keybindings

In production:

- the plugin still rewrites the import
- but it rewrites it to only one production implementation for that component boundary
- non-selected exploratory files are not imported into the production module graph

That keeps the app import stable while moving all Variant behavior into the toolchain.

## Compatibility model

Variant compatibility is boundary-based, not strict-type-based.

The important rule is:

- every variant must be renderable from the same component import boundary

The unimportant rule is:

- every variant does not need to use the same data or props internally

So this is allowed:

- source component consumes `items`
- variant ignores `items`
- variant renders a static CTA instead

As long as the variant can safely tolerate the parent’s props, the swap is valid.

## Production safety contract

Variant must guarantee all of the following:

- normal app imports remain the source of truth
- exploratory files live outside the main source tree
- development can expose multiple variants for a component
- production imports only the selected implementation
- non-selected variants are excluded from the production import graph
- the runtime overlay is development-only

This contract is the reason the architecture uses bundler rewriting instead of source-level wrappers as the primary model.

## Why this is adoptable

The default flow matches how teams already think:

- component stays where it already lives
- designers or exploratory builders can work in `.variiant/variants/`
- the bundler handles the magic
- engineers do not have to thread a new abstraction through the app

That is a much better day-1 value prop than asking teams to change production component code just to enable design exploration.

## Current scope

This repo currently implements:

- Vite plugin integration
- development overlay and keybindings
- fullscreen comparison canvas with `Components` and `Pages` modes
- production-safe selected-variant builds
- `.variiant/variants` conventions, with fallback to legacy `.variants`
- a single package that contains the Vite plugin, browser overlay, and React runtime adapter

Future adapters like Next.js should preserve the same mental model:

- unchanged imports
- `.variiant/variants`
- build-time import rewriting
