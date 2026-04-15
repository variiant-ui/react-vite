# variiant-ui Local Proving Plan

## Purpose

Prove the current architecture in a real web app we own, outside this package repo:

- imports stay normal
- exploratory variants live under `.variiant/variants/`
- development can swap them live
- production only ships the selected implementation

The proof is successful only if the integration feels elegant to a normal React team, not merely technically possible.

## What to prove

We need evidence for these claims:

- a React app can enable Variant without editing component callsites
- exploratory files can live fully outside the production component tree
- imports of real source components are still enough to make them swappable
- runtime keybindings can switch mounted components and their variants
- production excludes non-selected variants

## Host app selection

Choose a real app with:

- React and TypeScript
- Vite if possible for the first proof
- a visually meaningful route
- a component whose import path is stable

Good targets:

- dashboard overview
- analytics rail
- detail hero
- report summary

Avoid tiny primitives for the first proof. The point is to prove a real component swap.

Keep the proving app in a separate checkout and install `@variiant-ui/react-vite` from this repo via an npm local file dependency with `npm install --install-links`. That gives the host app a normal installed package shape instead of a symlink while still consuming your local checkout.

## Proof setup

### 1. Add the plugin

In `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { variantPlugin } from "@variiant-ui/react-vite";

export default defineConfig({
  plugins: [variantPlugin(), react()],
});
```

### 2. Keep imports unchanged

The host app should continue importing components normally:

```tsx
import DashboardOverview from "@/dashboard/DashboardOverview";
```

Do not rewrite the app to import generated proxies or wrapper components.

### 3. Add top-level variant folders

Example:

```text
.variiant/
  .gitignore
  variants/
    src/
      dashboard/
        DashboardOverview.tsx/
          default/
            compact.tsx
            editorial.tsx
```

## Manual validation

Use this script:

1. Start the app in development mode.
2. Open the route that mounts the source component.
3. Confirm the source implementation renders with unchanged imports.
4. Press `Cmd/Ctrl + Shift + .` to open the overlay.
5. Confirm the mounted component appears in the overlay.
6. Switch to each exploratory variant.
7. Press `Cmd/Ctrl + Shift + ,` to open the fullscreen canvas.
8. Confirm `Components` mode shows only the mounted component families on the current page, with source-file labels in the top-left of each group.
9. Switch to `Pages` mode and confirm the active component family renders as full-page previews, one preview per variant.
10. Confirm the page still functions.
11. Use `Cmd/Ctrl + Alt + ArrowUp/ArrowDown` to switch the active mounted component.
12. Use `Cmd/Ctrl + Shift + ArrowLeft/ArrowRight` to switch the active variant.
13. Refresh and confirm the local runtime selection persists if expected.

Then verify production:

1. Run a production build.
2. Inspect the built output.
3. Confirm exploratory variant strings or modules are absent from the production bundle.

## Pass criteria

The proof passes if:

- the host app import paths remain untouched
- exploratory files live fully in `.variiant/variants/`
- runtime swapping works on a real mounted component
- current-page canvas comparison works in both `Components` and `Pages` modes
- keyboard navigation works
- non-selected variants are absent from the production bundle
- the integration diff feels small enough that another team would accept it

## Failure criteria

The proof fails if:

- engineers have to wrap core components in source just to opt in
- exploratory files creep into the production component tree
- production build includes non-selected variants
- runtime swapping feels brittle on a normal page

## What to learn

At the end of the proof, answer these:

1. Is `.variiant/variants/` easier for teams to accept than colocated source wrappers?
2. Does import rewriting feel invisible enough to be a strong day-1 value prop?
3. Is the compatibility model permissive enough for exploratory design work?
4. What is still needed before a Next.js adapter is credible?
