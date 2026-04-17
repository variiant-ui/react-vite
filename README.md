# variiant-ui/react-vite

`@variiant-ui/react-vite` is a Vite plugin that enables parallel React component explorations without modifying app source code. The app keeps importing components normally — the plugin detects variant files under `.variiant/variants/`, rewrites the import to a proxy at dev time, and ships only the selected implementation in production. The swap boundary lives in the toolchain, not in user source code. App imports never change.

The public developer experience is intentionally one package:

- install one package into the app
- keep normal component imports
- put experiments under `.variiant/variants/`
- open the overlay only when needed with `Cmd/Ctrl + Shift + .`
- open the comparison canvas with `Cmd/Ctrl + Shift + ,`
- change the active mounted component and variant with keyboard shortcuts

Internally, the package is split so the business logic stays testable and decoupled from React rendering:

- `runtime-core.ts` owns the state machine and shortcut-driven actions
- `runtime-dom.ts` owns browser bindings and the overlay UI
- `runtime.tsx` owns the React proxy adapter
- `plugin.ts` owns Vite import rewriting

## Install

From the consuming app root:

```bash
npm install @variiant-ui/react-vite
npm exec variiant init
```

`npm exec variiant init` is the default install flow after the package is installed locally in the app. If it detects local `codex`, `claude`, or `copilot` CLIs, it prompts you to choose which one to configure and writes the matching default command. Codex gets the `--image` screenshot flag automatically. If you prefer an npm script wrapper, add `"variiant": "variiant"` to the app's `package.json` and run `npm run variiant -- init`. Avoid `npx variiant init` for local proving or local file installs because `npx` can fall through to the npm registry instead of the app-local binary.

## Vite setup

In the consuming app's `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { variantPlugin } from "@variiant-ui/react-vite";

export default defineConfig({
  plugins: [variantPlugin(), react()],
});
```

In development, the plugin bootstraps the transient overlay and keybindings even before `.variiant/variants/` exists. With no mounted variant boundaries yet, the floating bar still opens but the component list is empty until matching source components are present on the page.

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
- only files that `export default` are registered as swappable runtime variants; non-default-exported files in those folders are treated as helper modules and ignored by the proxy registry
- unresolved relative imports inside a variant file fall back to the original source module directory before failing, so copied source-relative imports keep working without client-app alias changes
- the generated proxy exposes `source` plus all discovered variants to the runtime
- production imports exactly one implementation for each variantable boundary

## Default keybindings

- `Cmd/Ctrl + Shift + .` toggles the overlay
- `Cmd/Ctrl + Shift + ,` toggles the fullscreen comparison canvas
- `Cmd/Ctrl + Alt + ArrowUp/ArrowDown` changes the active mounted component
- `Cmd/Ctrl + Shift + ArrowLeft/ArrowRight` changes the active variant

The component and variant shortcuts work whether the overlay or canvas is open. The overlay is intentionally transient and capped to a compact control bar rather than a persistent sidebar.

The fullscreen canvas has two modes:

- `Components` shows only the currently mounted variant families on the current page, grouped side by side with top-left source-file labels and vertically stacked variants
- `Pages` clones the current page DOM for the active component family so you can compare each variant in context without rasterized previews

## Local agent bridge

Development mode now includes an experimental local agent bridge behind a top-level `variiant.config.json`.

Example output when Codex is selected:

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

`npm exec variiant init` writes that file for you and creates `.variiant/.gitignore` with `sessions/` ignored. Run it from the consuming app root after install. The preferred and only documented shape is nested JSON under `agent`. The loader still accepts legacy flat keys such as `"agent.command"` for compatibility, but `variiant init` always writes the nested shape. Claude and Copilot presets write their own non-interactive command defaults; only Codex currently adds an explicit `agent.image.cliFlag`. The Claude preset now opts into `stream-json`, `--verbose`, and `--include-partial-messages` so the overlay can surface incremental thought text instead of only the final response.

With that file present, the floating bar can send a prompt to the local coding agent, swap the prompt area into a compact latest-message progress strip while the run is active, and let Vite reload the changed files in place. `agent.refresh` defaults to `"hmr"`, which reloads only affected variiant proxy modules after an agent-created variant change instead of refreshing the whole page. Set `"refresh": "full-reload"` if the host app needs the older full-page behavior. If you do not want to put that in `variiant.config.json`, you can also force the behavior in `vite.config.ts` with `variantPlugin({ agentRefresh: "full-reload" })`.

When `agent.image.cliFlag` is configured, the overlay also shows an `Attach <component name> screenshot` checkbox that captures the active component at 1x resolution, stores it in the session folder, and passes the saved file to the CLI using that flag. If `agent.logFile` is set to `true`, the dev server also writes the full emitted agent event stream to `.variiant/sessions/<session-id>/agent-events.ndjson`. The command runs inside the project root and the package rejects `agent.cwd` values that escape the repo.

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
