# @variiant-ui/react-vite

React + Vite component variant tooling with a compact browser overlay and production-safe variant selection.

## Install

```bash
npm install @variiant-ui/react-vite
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

Keep normal component imports in the app and place exploratory variants under a mirrored top-level `.variants/` tree. If production should ship something other than `source`, add a `variant.json` manifest to declare the selected implementation.

Default shortcuts:

- `Cmd/Ctrl + Shift + .` toggles the overlay
- `Cmd/Ctrl + Alt + ArrowUp/ArrowDown` changes the active mounted component
- `Cmd/Ctrl + Shift + ArrowLeft/ArrowRight` changes the active variant

See the repo root `README.md` and `docs/` for the architecture, proving app, and adoption notes.
