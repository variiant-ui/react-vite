# variiant-ui/react-vite

When you use AI to iterate on a component, every new version tends to overwrite the last one. You lose comparison, you lose reviewability, and you end up with one surviving answer instead of a real exploration trail. `@variiant-ui/react-vite` fixes that.

It lets you accumulate multiple implementations of the same component and switch between them live inside your running app, on top of real data and real state. Your source imports stay unchanged, your exploratory files stay outside the main source tree, and production still ships only the chosen implementation.

## What it does today

The package currently gives you:

- live runtime switching between source and variant implementations
- a transient in-browser runtime surface for prompting and selection
- a fullscreen comparison canvas
- a local agent bridge that creates or edits variant files under `.variiant/variants/`

## Product direction

The product direction is moving toward three clearer workflows:

- `Ideate`: prompt on the live page with richer context
- `Review`: understand and compare generated results more clearly
- `Tweak`: make bounded follow-up edits without another full prompt

That direction does not change the integration story. It changes how the runtime feels in the browser.

## How it works

variiant-ui intercepts component imports at the Vite level and replaces them with a thin proxy when a matching variant directory exists.

Your source components are never modified. Variants live in a separate `.variiant/variants/` folder that mirrors your source tree but sits outside your main code path. If you delete the entire folder, your app is identical to what it was before you installed the package.

Production builds are still pruned to one implementation per boundary: the selected variant, or the original source when no variant is selected.

```text
your-app/
  src/
    components/
      OrdersTable.tsx
  .variiant/
    variants/
      src/
        components/
          OrdersTable.tsx/
            default/
              compact.tsx
              cta.tsx
```

Your import stays exactly as it was:

```tsx
import OrdersTable from "@/components/OrdersTable";
```

## Install

From the consuming app root:

```bash
npm install @variiant-ui/react-vite
npm exec variiant init
```

`variiant init` detects supported local agent CLIs and writes `variiant.config.json`. It also creates `.variiant/.gitignore` so session files stay out of your repo.

## Vite setup

Add the plugin to your `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { variantPlugin } from "@variiant-ui/react-vite";

export default defineConfig({
  plugins: [variantPlugin(), react()],
});
```

That is the whole app integration surface.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + Shift + .` | Open / close the runtime surface |
| `Cmd/Ctrl + Shift + ,` | Open / close the comparison canvas |
| `Cmd/Ctrl + Alt + ↑ / ↓` | Move focus between mounted components |
| `Cmd/Ctrl + Shift + ← / →` | Cycle through variants |

All shortcuts work whether the runtime surface is open or closed.

## Variant file convention

Variant files live under `.variiant/variants/` and mirror your source tree. A folder named after the source file holds one sub-folder per export, and each file inside is one variant.

```text
.variiant/
  variants/
    src/
      components/
        OrdersTable.tsx/
          default/
            compact.tsx
            cta.tsx
      features/
        dashboard/
          index.tsx/
            Dashboard/
              sparkline-stacked.tsx
```

- `default/<name>.tsx` targets the default export
- `<NamedExport>/<name>.tsx` targets a named export
- each variant file must use `export default`
- helper files without `export default` are allowed, but they are not runtime variants

## Agent bridge configuration

`variiant init` writes a `variiant.config.json` at your project root. Example for Codex:

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

When this file is present, the runtime can send structured local sessions to that CLI. Session files are stored under `.variiant/sessions/<session-id>/` and currently include the request payload plus any materialized image attachments.

This session model is also the basis for the next runtime direction:

- contextual comments
- sketch attachments
- clearer review metadata
- deterministic tweak operations

## Direction notes

The current comparison canvas still exists, but the target direction is component-focused review. Duplicated page-mode comparison is no longer the planned long-term model.

Likewise, the next planned refinement path is not "more prompt text." It is richer structured context for ideation and deterministic tweaks for cheap follow-up edits such as copy changes.
