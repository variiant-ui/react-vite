# variiant-ui/react-vite

`@variiant-ui/react-vite` lets a React + Vite app keep multiple implementations of the same component and switch between them live in development, while shipping only the selected implementation in production.

## Core model

- app imports stay unchanged
- variant files live under `.variiant/variants/`
- the Vite plugin rewrites matching imports to generated proxy modules
- development can switch between source and exploratory variants
- production includes only the chosen implementation

## Runtime direction

The current package already includes a transient in-browser runtime and local agent bridge.

The product direction is moving toward three explicit workflows:

- `Ideate`: prompt on the live page with richer context
- `Review`: clearer presentation of generated alternatives
- `Tweak`: deterministic low-cost edits such as copy changes and later bounded utility tweaks

## Install

```bash
npm install @variiant-ui/react-vite
npm exec variiant init
```

## Vite setup

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { variantPlugin } from "@variiant-ui/react-vite";

export default defineConfig({
  plugins: [variantPlugin(), react()],
});
```

## Variant file convention

```text
.variiant/
  variants/
    src/
      components/
        OrdersTable.tsx/
          default/
            compact.tsx
            cta.tsx
```

- `default/<name>.tsx` targets the default export
- `<NamedExport>/<name>.tsx` targets a named export
- each runtime variant file must use `export default`
- helper files without `export default` are ignored by the runtime

## Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + Shift + .` | Open / close the runtime surface |
| `Cmd/Ctrl + Shift + ,` | Open / close the comparison canvas |
| `Cmd/Ctrl + Alt + ↑ / ↓` | Move focus between mounted components |
| `Cmd/Ctrl + Shift + ← / →` | Cycle through variants |

## Local agent bridge

`variiant init` writes `variiant.config.json`. Example:

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

The current bridge stores each run under `.variiant/sessions/<session-id>/`. That same session seam is intended to grow into richer ideation and tweak workflows over time.

## Notes

- The target review direction is component-focused rather than duplicated page-mode comparison.
- The target refinement direction includes deterministic tweaks for bounded changes instead of treating every small follow-up edit as another full prompt.
