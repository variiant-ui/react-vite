# variiant-ui React/Vite API and Adoption Guide

## Product story

`@variiant-ui/react-vite` should feel invisible to product engineers until they want it.

The adoption bar is:

- no source-level wrapper around every variantable component
- no runtime provider mounted in app code
- no exploratory files mixed into the production component tree
- clear production behavior

The implementation in this repo is designed around that bar.

## Public API

Current public API:

- `variantPlugin()` for Vite
- top-level `.variants/`
- mirrored source-path folders for default and named export targets
- optional `variant.json` manifests for explicit production selection or custom mapping
- one installable package for the whole browser workflow

That is the whole integration surface.

## Integration

### 1. Install the package

```bash
npm install @variiant-ui/react-vite
```

### 2. Add the Vite plugin

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { variantPlugin } from "@variiant-ui/react-vite";

export default defineConfig({
  plugins: [variantPlugin(), react()],
});
```

### 3. Keep app imports unchanged

```tsx
import OrdersTable from "@/components/OrdersTable";
```

Variant does not require app code to import a generated proxy or mount a provider.

### 4. Add a top-level variant entry

```text
.variants/
  src/
    components/
      OrdersTable.tsx/
        default/
          compact.tsx
          cta.tsx
```

The source component remains the implicit default variant named `source`.

### 5. Add a manifest when production should ship a non-source variant

```json
{
  "source": "src/components/OrdersTable.tsx",
  "displayName": "Orders Table",
  "selected": "compact",
  "variants": ["compact", "cta"]
}
```

Use `variant.json` when you need:

- an explicit production selection that is not `source`
- a stable display name
- custom mapping instead of same-name sibling files

## How it works

In development:

- the plugin scans top-level `.variants/`
- when the app imports a component that has a matching mirrored variant folder, the plugin rewrites that import to a virtual proxy module
- the proxy exports the source component plus all discovered exploratory variants
- the browser runtime exposes those variants in the overlay and keybindings

In production:

- the plugin still rewrites the import
- but it rewrites it to only the selected implementation declared by the manifest or to `source` if no manifest overrides it
- non-selected exploratory files are not imported into the production module graph

That keeps the app import stable while moving all Variant behavior into the toolchain.

## Compatibility model

Variant compatibility is boundary-based, not strict-type-based.

The important rule is:

- every variant must be renderable from the same component import boundary

The unimportant rule is:

- every variant does not need to use the same data or props internally

So this is allowed:

- source component consumes `items`
- variant ignores `items`
- variant renders a static CTA instead

As long as the variant can safely tolerate the parent’s props, the swap is valid.

## Production safety contract

Variant must guarantee all of the following:

- normal app imports remain the source of truth
- exploratory files live outside the main source tree
- development can expose multiple variants for a component
- production imports only the selected implementation
- non-selected variants are excluded from the production import graph
- the runtime overlay is development-only

This contract is the reason the architecture uses bundler rewriting instead of source-level wrappers as the primary model.

## Why this is adoptable

The default flow matches how teams already think:

- component stays where it already lives
- designers or exploratory builders can work in `.variants/`
- the bundler handles the magic
- engineers do not have to thread a new abstraction through the app

That is a much better day-1 value prop than asking teams to change production component code just to enable design exploration.

## Current scope

This repo currently implements:

- Vite plugin integration
- development overlay and keybindings
- production-safe selected-variant builds
- top-level `.variants` conventions
- a single package that contains the Vite plugin, browser overlay, and React runtime adapter

Future adapters like Next.js should preserve the same mental model:

- unchanged imports
- top-level `.variants`
- build-time import rewriting
