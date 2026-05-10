# variiant-ui/react-vite

`@variiant-ui/react-vite` lets a React app keep multiple implementations of the same component and switch between them live in development, while shipping only the selected implementation in production. Vite remains the primary adapter; Webpack 5 support is available from the same package.

## Core model

- app imports stay unchanged
- variant files live under `.variiant/variants/`
- the bundler adapter rewrites matching imports to generated proxy modules
- development can switch between source and exploratory variants
- production includes only the chosen implementation

## Runtime direction

The current package already includes a transient in-browser runtime and local agent bridge.

The product direction is moving toward clearer workflows:

- `Ideate`: prompt on the live page through a floating composer, with inline sketch and comment attachments
- `Present`: switch between mounted components and variants from the same toolbar and surface generated results
- `Review`: clearer presentation of generated alternatives in the present surface and review stack
- `Tweak`: deterministic low-cost edits such as copy changes and later bounded utility tweaks

## Install

```bash
npm install @variiant-ui/react-vite
npm exec variiant init
```

## Vite Setup

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { variantPlugin } from "@variiant-ui/react-vite";

export default defineConfig({
  plugins: [variantPlugin(), react()],
});
```

## Webpack Setup

```js
import {
  variantWebpackDevMiddleware,
  variantWebpackPlugin,
} from "@variiant-ui/react-vite";

export default {
  plugins: [variantWebpackPlugin()],
  devServer: {
    setupMiddlewares: (middlewares) => {
      middlewares.unshift({
        name: "variiant",
        middleware: variantWebpackDevMiddleware(),
      });
      return middlewares;
    },
  },
};
```

Webpack proxy modules are generated under `.variiant/cache/webpack/`.

## Local proving workflow

When this package is linked from a local checkout, the development bootstrap prefers the package source runtime when `src/runtime.tsx` is available.

That keeps the proving loop tighter:

- runtime UI changes hot-reload without rebuilding the package
- plugin-side changes still require a package rebuild and consumer-app restart

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

The current bridge stores each run under `.variiant/sessions/<session-id>/`. Those sessions now materialize richer ideation context such as comments and sketch attachments, with comments carrying bounded DOM/tag text context and sketches saved as viewport screenshots composited with the drawn markup.

## Notes

- The target review direction is component-focused rather than duplicated page-mode comparison.
- The current tweak mode supports copy-only deterministic rewrites for generated variants, with broader utility tweaks still planned.
