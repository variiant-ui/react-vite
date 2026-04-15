# @variiant-ui/react-vite

React + Vite component variant tooling with a compact browser overlay and production-safe variant selection.

## Install

```bash
npm install @variiant-ui/react-vite
npm exec variiant init
```

## Usage

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { variantPlugin } from "@variiant-ui/react-vite";

export default defineConfig({
  plugins: [variantPlugin(), react()],
});
```

Keep normal component imports in the app and place exploratory variants under `.variiant/variants/`. Development exposes `source` plus discovered variants, while production imports only one implementation for a given component boundary. The package still falls back to a legacy top-level `.variants/` folder when present, but new projects should use the `.variiant/` workspace.

For the experimental local agent workflow, add a top-level `variiant.config.json`:

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

The `variiant` bin writes that file via `npm exec variiant init`. It also creates `.variiant/.gitignore` with `sessions/` ignored so agent session artifacts stay untracked by default. The preferred config shape is nested under `agent`.

The overlay can then submit prompts to the local CLI, collapse the prompt area into a compact latest-message progress strip while the agent runs, and let the app reload changed files automatically. When `agent.image.cliFlag` is configured, the Ask Agent UI also exposes an `Attach <component name> screenshot` checkbox that saves a 1x PNG into the session folder and passes it to the CLI with that flag.

Default shortcuts:

- `Cmd/Ctrl + Shift + .` toggles the overlay
- `Cmd/Ctrl + Shift + ,` toggles the fullscreen comparison canvas
- `Cmd/Ctrl + Alt + ArrowUp/ArrowDown` changes the active mounted component
- `Cmd/Ctrl + Shift + ArrowLeft/ArrowRight` changes the active variant

The fullscreen canvas stays scoped to the current page. `Components` mode lays out the mounted component families side by side with visible source-file labels, while `Pages` mode clones the current page DOM for the active component family so you can compare variants in context without rasterized previews.

See the repo root `README.md` and `docs/` for the architecture, local proving workflow, and adoption notes.
