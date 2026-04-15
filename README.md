# variiant-ui/react-vite

`@variiant-ui/react-vite` is a React + Vite design-iteration package. It keeps exploratory component versions outside the main source tree, swaps them live in the browser during development, and ships only the selected implementation in production.

The public developer experience is intentionally one package:

- install one package into the app
- keep normal component imports
- put experiments under `.variiant/variants/`
- open the overlay only when needed with `Cmd/Ctrl + Shift + .`
- change the active mounted component and variant with keyboard shortcuts

Internally, the package is split so the business logic stays testable and decoupled from React rendering:

- `runtime-core.ts` owns the state machine and shortcut-driven actions
- `runtime-dom.ts` owns browser bindings and the overlay UI
- `runtime.tsx` owns the React proxy adapter
- `plugin.ts` owns Vite import rewriting

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

Your application imports stay unchanged:

```tsx
import OrdersTable from "@/components/OrdersTable";
```

## Variant file convention

The canonical variant workspace lives under `.variiant/variants/`. The source implementation is always the implicit `source` variant. Existing apps that still use a top-level `.variants/` folder continue to resolve for now, but new setup should use `.variiant/variants/`.

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
      features/
        dashboard/
          index.tsx/
            Dashboard/
              sparkline-stacked.tsx
```

- `default/<name>.tsx` overrides the module default export
- `<NamedExport>/<name>.tsx` overrides a named export
- the generated proxy exposes `source` plus all discovered variants to the runtime
- production imports exactly one implementation for each variantable boundary

## Default keybindings

- `Cmd/Ctrl + Shift + .` toggles the overlay
- `Cmd/Ctrl + Alt + ArrowUp/ArrowDown` changes the active mounted component
- `Cmd/Ctrl + Shift + ArrowLeft/ArrowRight` changes the active variant

The component and variant shortcuts work whether the overlay is open or closed. The overlay is intentionally transient and capped to a compact control bar rather than a persistent sidebar.

## Local agent bridge

Development mode now includes an experimental local agent bridge behind a top-level `variiant.config.json`.

Example:

```json
{
  "agent": {
    "command": ["codex", "exec", "--json", "--sandbox", "workspace-write", "--skip-git-repo-check"],
    "streaming": "text",
    "image": {
      "cliFlag": "--image"
    }
  }
}
```

`npm exec variiant init` writes that file for you and creates `.variiant/.gitignore` with `sessions/` ignored. The preferred and only documented shape is nested JSON under `agent`. The loader still accepts legacy flat keys such as `"agent.command"` for compatibility, but `variiant init` always writes the nested shape.

Use `npm exec` instead of `npx` in a local proving app. If the local package bin has not been linked into that app yet, `npx variiant` falls through to the npm registry and returns a 404.

With that file present, the floating bar can send a prompt to the local coding agent, swap the prompt area into a compact latest-message progress strip while the run is active, and let Vite reload the changed files in place. When `agent.image.cliFlag` is configured, the overlay also shows an `Attach <component name> screenshot` checkbox that captures the active component at 1x resolution, stores it in the session folder, and passes the saved file to the CLI using that flag. The command runs inside the project root and the package rejects `agent.cwd` values that escape the repo.

## Local proving

We keep the proving app outside this repo so the package is exercised like a normal consumer dependency.

- use a separate local app such as a sibling `shadcn-admin` checkout
- install `@variiant-ui/react-vite` from this repo via an npm local file dependency, using `npm install --install-links` so the host app gets a normal installed package shape rather than a symlink
- keep the source components and `.variiant/variants/` tree in the host app, not in this package repo

## Documents

- [Vision](./docs/VISION.md)
- [Implementation Plan](./docs/IMPLEMENTATION_PLAN.md)
- [Local Proving Plan](./docs/LOCAL_PROVING_PLAN.md)
- [API and Adoption Guide](./docs/API_AND_ADOPTION_GUIDE.md)
- [Agent Notes](./AGENTS.md)
