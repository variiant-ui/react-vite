# variiant-ui/react-vite

`@variiant-ui/react-vite` is a React + Vite design-iteration package. It keeps exploratory component versions outside the main source tree, swaps them live in the browser during development, and ships only the selected implementation in production.

The public developer experience is intentionally one package:

- install one package into the app
- keep normal component imports
- put experiments under a top-level `.variants/`
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

The current repo supports mirrored `.variants/` folders for discovery. The source implementation is always the implicit `source` variant.

```text
.variants/
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

## Local proving

We keep the proving app outside this repo so the package is exercised like a normal consumer dependency.

- use a separate local app such as a sibling `shadcn-admin` checkout
- install `@variiant-ui/react-vite` from this repo via an npm local file dependency for day-to-day development
- keep the source components and `.variants/` tree in the host app, not in this package repo

## Documents

- [Vision](./docs/VISION.md)
- [Implementation Plan](./docs/IMPLEMENTATION_PLAN.md)
- [Local Proving Plan](./docs/LOCAL_PROVING_PLAN.md)
- [API and Adoption Guide](./docs/API_AND_ADOPTION_GUIDE.md)
- [Agent Notes](./AGENTS.md)
