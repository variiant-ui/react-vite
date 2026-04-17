# @variiant-ui/react-vite

Vite plugin that enables parallel React component explorations without modifying app source code. The app keeps importing components normally — the plugin detects variant files under `.variiant/variants/`, rewrites the import to a proxy at dev time, and ships only the selected implementation in production. The swap boundary lives in the toolchain, not in user source code. App imports never change.

## Install

From the consuming app root:

```bash
npm install @variiant-ui/react-vite
npm exec variiant init
```

`npm exec variiant init` is the default way to run the package bin after install. If it detects local `codex`, `claude`, or `copilot` CLIs, it prompts you to choose which one to configure and writes the matching default command. Codex gets the `--image` screenshot flag automatically. If you prefer an npm script wrapper, add `"variiant": "variiant"` to the app's `package.json` and run `npm run variiant -- init`. Avoid `npx variiant init` for local proving or local file installs because it can bypass the app-local binary.

## Usage

In the consuming app's `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { variantPlugin } from "@variiant-ui/react-vite";

export default defineConfig({
  plugins: [variantPlugin(), react()],
});
```

Keep normal component imports in the app and place exploratory variants under `.variiant/variants/`. Development exposes `source` plus discovered variants, while production imports only one implementation for a given component boundary. The package still falls back to a legacy top-level `.variants/` folder when present, but new projects should use the `.variiant/` workspace. When a variant file keeps copied relative imports from the original source module, unresolved relative specifiers fall back to the source module directory before failing, so teams do not need to re-alias client apps just to make exploratory variants build.

Within a mirrored variant target directory, only files that `export default` are treated as swappable runtime variants. Neighboring `.ts` or `.tsx` files without a default export are ignored by the proxy registry, which lets agent-created helper modules live beside the real variant entrypoints without breaking the generated imports.

The dev plugin bootstraps the floating bar and keybindings even before `.variiant/variants/` exists. With no matching mounted component boundaries yet, the bar still opens but there is nothing to switch.

For the experimental local agent workflow, add a top-level `variiant.config.json`:

```json
{
  "agent": {
    "command": ["codex", "exec", "--json", "--sandbox", "workspace-write", "--skip-git-repo-check"],
    "streaming": "text",
    "refresh": "hmr",
    "image": {
      "cliFlag": "--image"
    }
  }
}
```

The `variiant` bin writes that file via `npm exec variiant init`. Run it from the consuming app root. It also creates `.variiant/.gitignore` with `sessions/` ignored so agent session artifacts stay untracked by default. The preferred config shape is nested under `agent`. Claude and Copilot presets write their own non-interactive command defaults; only Codex currently adds an explicit `agent.image.cliFlag`. The Claude preset opts into `stream-json`, `--verbose`, and `--include-partial-messages` so the progress strip can show incremental text while the CLI is still running.

The overlay can then submit prompts to the local CLI, collapse the prompt area into a compact latest-message progress strip while the agent runs, and let the app reload changed files automatically. `agent.refresh` defaults to `"hmr"`, which reloads only affected variiant proxy modules after the run instead of forcing a full page refresh. Set it to `"full-reload"` if the host app needs the old behavior, or use `variantPlugin({ agentRefresh: "full-reload" })` in `vite.config.ts` as a fallback override. When `agent.image.cliFlag` is configured, the Ask Agent UI also exposes an `Attach <component name> screenshot` checkbox that saves a 1x PNG into the session folder and passes it to the CLI with that flag.

Default shortcuts:

- `Cmd/Ctrl + Shift + .` toggles the overlay
- `Cmd/Ctrl + Shift + ,` toggles the fullscreen comparison canvas
- `Cmd/Ctrl + Alt + ArrowUp/ArrowDown` changes the active mounted component
- `Cmd/Ctrl + Shift + ArrowLeft/ArrowRight` changes the active variant

The fullscreen canvas stays scoped to the current page. `Components` mode lays out the mounted component families side by side with visible source-file labels, while `Pages` mode clones the current page DOM for the active component family so you can compare variants in context without rasterized previews.

See the repo root `README.md` and `docs/` for the architecture, local proving workflow, and adoption notes.
