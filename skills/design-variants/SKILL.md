---
name: design-variants
description: Create, update, or validate exploratory React component variants for this repo's Variant architecture. Use when working with the top-level `.variants/` tree, adding or editing `variant.json`, creating externalized component variants, ensuring imports in app code stay unchanged, or validating that the Vite plugin exposes variants correctly at runtime and ships only the selected implementation in production.
---

# Design Variants

Use this skill when the task is about adding or exposing exploratory UI variants through the top-level `.variants/` system.

This skill is for whole component replacements through bundler rewriting and the top-level `.variants/` tree.

## Current architecture

Variant in this repo works like this:

- app source imports components normally
- exploratory variants live under top-level `.variants/`
- `variantPlugin()` rewrites matching component imports at bundler time
- the browser runtime exposes mounted components and variants through an overlay
- production imports only the selected implementation

Do not introduce app-source integration contracts or provider-based wiring unless the user explicitly asks for a different architecture.

## Expected file layout

Example:

```text
src/dashboard/OrdersTable.tsx
.variants/
  OrdersTable/
    variant.json
    compact.tsx
    cta.tsx
```

Example `variant.json`:

```json
{
  "source": "src/dashboard/OrdersTable.tsx",
  "displayName": "Orders Table",
  "selected": "source",
  "variants": ["compact", "cta"]
}
```

## Core workflow

### 1. Read the source component

Inspect:

- the real source component module
- the importing page or parent when needed
- the matching `.variants/<Name>/variant.json` if it exists

You need to understand:

- what the parent import boundary is
- which props the parent currently passes
- which props can be safely ignored by an exploratory replacement

### 2. Create or update the external variant

Add a new file under the matching folder in `.variants/`.

Good variant examples:

- `compact.tsx`
- `editorial.tsx`
- `minimal.tsx`
- `cta.tsx`

Use the host app's styling system and shared primitives where appropriate.

### 3. Keep the import boundary stable

Do not change app imports to point at the variant file.

The app should continue importing the real source component path. The plugin handles the swap.

### 4. Update `variant.json`

Add the new variant name under `variants`.

Do not change `selected` unless the user explicitly wants the new variant to become the production choice.

### 5. Validate runtime behavior

For Vite apps in this repo, confirm:

- `variantPlugin()` is enabled in `vite.config.ts`
- the source component is still imported normally
- the overlay can see the mounted component
- the new variant is selectable at runtime

## Compatibility rule

Do not enforce strict semantic equivalence between source and variant.

The real rule is:

- the variant must be safe to render from the same import boundary

That means a variant may ignore most or all incoming props if it wants to, as long as it does not crash when rendered by the existing parent.

This is valid:

- source component uses `items`
- variant ignores `items`
- variant renders a link or summary instead

## Validation checklist

After edits, validate all of these:

1. The source component import path in app code is unchanged.
2. The new variant file exists under top-level `.variants/`.
3. `variant.json` lists the new variant.
4. The Vite plugin is still enabled.
5. The runtime overlay shows the mounted component in development.
6. The new variant can be activated with the overlay or keybindings.
7. A production build only includes the selected implementation.

## Keybindings

Default runtime keybindings:

- `Cmd/Ctrl + Shift + .` toggles the overlay
- `Cmd/Ctrl + Shift + ArrowUp` selects the previous mounted component
- `Cmd/Ctrl + Shift + ArrowDown` selects the next mounted component
- `Cmd/Ctrl + Shift + ArrowLeft` selects the previous variant
- `Cmd/Ctrl + Shift + ArrowRight` selects the next variant

Use these when validating a new variant.

## Repo-specific notes

In this repo:

- the Vite plugin lives in `packages/variant/src/plugin.ts`
- the browser runtime lives in `packages/variant/src/runtime.tsx`
- the demo app lives in `examples/demo`
- the demo's exploratory variants live in `examples/demo/.variants`

If the user asks you to prove the system end-to-end, use the demo app as the reference implementation.
