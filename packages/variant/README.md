# variiant-ui/react-vite

When you use AI to iterate on a component, every new version overwrites the last one. You can't go back, you can't compare, and you can't show a stakeholder three real alternatives at once — only the most recent survives. `@variiant-ui/react-vite` fixes that.

It lets you accumulate multiple implementations of the same component and switch between them live inside your running app, on top of real data and real state. No screenshots. No isolated storybooks. Your main code never changes, and only your chosen version ships to production.

## Features

### Floating bar

![Floating bar](https://raw.githubusercontent.com/variiant-ui/react-vite/main/docs/floating-bar.png)

Press `Cmd/Ctrl + Shift + .` to open a compact floating bar at the bottom of any page. It shows every variant-enabled component currently on screen and lets you cycle through their alternatives instantly. The app keeps running — routing, providers, data loading — nothing resets. Close the bar when you're done; it stays out of the way the rest of the time.

### Ask Agent

The floating bar has a built-in prompt field. Type a direction — "make this table more compact" or "try a card grid layout" — and the agent creates a new variant file without touching your existing component. When the file lands, Vite swaps it in and you see it immediately. You can keep prompting, keep stacking variants, and only decide what to keep when you're ready.

### Canvas

Press `Cmd/Ctrl + Shift + ,` to open the fullscreen comparison canvas. It shows every variant of every component you've created, grouped side-by-side with labels. Two modes:

- **Components** — isolates each component family so you can compare implementations without page noise
- **Pages** — clones the current page once per variant so you can see every design direction in full context at once

## How it works

variiant-ui works by intercepting component imports at the Vite level and transparently replacing them with a thin proxy. The proxy knows about all the variant implementations you've created and switches between them at runtime.

Your source components are never modified. The variants live in a separate `.variiant/variants/` folder that mirrors the shape of your source tree but sits entirely outside your main code path. If you delete the entire folder, your app is identical to what it was before you installed the package.

Production builds are not affected. The Vite plugin resolves exactly one implementation per component — the one you've selected, or the original source if you haven't picked one — and the rest never make it into the bundle.

```text
your-app/
  src/
    components/
      OrdersTable.tsx        ← your code, untouched
  .variiant/
    variants/
      src/
        components/
          OrdersTable.tsx/
            default/
              compact.tsx    ← variant A
              cta.tsx        ← variant B
```

Your import stays exactly as it was:

```tsx
import OrdersTable from "@/components/OrdersTable";
```

In development, that import resolves through the proxy and shows whichever variant is active. In production, it resolves directly to the source (or your chosen variant) with no proxy overhead and no dead code.

## Install

From the consuming app root:

```bash
npm install @variiant-ui/react-vite
npm exec variiant init
```

`variiant init` detects any local AI CLI you have installed (Codex, Claude, or Copilot) and sets up the agent bridge for you. It also creates `.variiant/.gitignore` so session files stay out of your repo.

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

That's it. The floating bar and all keyboard shortcuts are active the next time you start your dev server. You don't need any variants yet — the bar opens even with an empty `.variiant/` folder and fills in as you create alternatives.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + Shift + .` | Open / close the floating bar |
| `Cmd/Ctrl + Shift + ,` | Open / close the canvas |
| `Cmd/Ctrl + Alt + ↑ / ↓` | Move focus between components |
| `Cmd/Ctrl + Shift + ← / →` | Cycle through variants |

All shortcuts work whether the bar or canvas is open or closed.

## Variant file convention

Variant files live under `.variiant/variants/` and mirror your source tree. A folder named after the source file holds one sub-folder per export, and each file inside is one variant.

```text
.variiant/
  variants/
    src/
      components/
        OrdersTable.tsx/
          default/
            compact.tsx      ← replaces the default export
            cta.tsx
      features/
        dashboard/
          index.tsx/
            Dashboard/
              sparkline-stacked.tsx
```

- `default/<name>.tsx` targets the default export
- `<NamedExport>/<name>.tsx` targets a named export
- each variant file must use `export default`; other files in the folder are treated as helpers and ignored by the registry
- relative imports inside a variant resolve against the original source directory, so you can copy source-relative imports without changes

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

When this file is present, the floating bar's Ask Agent prompt sends to that CLI. While the agent is running, the prompt area becomes a progress strip showing the latest output. When the agent writes a variant file, Vite hot-reloads the affected proxy module and you see the result immediately without a full page refresh.

Set `"refresh": "full-reload"` if your app needs the older full-page behavior, or configure it per-plugin in `vite.config.ts` with `variantPlugin({ agentRefresh: "full-reload" })`.

If `agent.image.cliFlag` is set, the floating bar shows an `Attach screenshot` checkbox. Checking it captures the active component at 1x resolution and passes the saved file to the agent CLI alongside your prompt.
