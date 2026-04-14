# variiant-ui React/Vite Implementation Plan

## Goal

Let a React app keep exploratory component versions outside the main source tree while swapping them live in development and ship only the selected implementation in production.

The current implementation direction is:

- top-level `.variants/`
- unchanged component imports in app source
- bundler-level import rewriting
- development overlay with runtime keybindings
- production build selecting exactly one implementation per component

## Core design choice

Variant should not ask developers to wrap components with a source-level contract as the primary integration path.

The swap boundary still has to exist, but it should live in the toolchain, not in user source code.

That means:

- app code keeps importing `src/components/Foo.tsx`
- the plugin detects that `.variants/` contains a mirrored target for that source file
- the bundler rewrites the import to a generated proxy module

This gives us a stable boundary without polluting the main component tree.

## File convention

Current convention:

```text
.variants/
  src/
    components/
      OrdersTable.tsx/
        default/
          compact.tsx
          cta.tsx
```

Rules:

- `source` is also the implicit default variant name
- `default/<name>.tsx` overrides the default export
- `<NamedExport>/<name>.tsx` overrides a named export
- the mirrored path under `.variants/` must match the real source module path

## Compatibility model

Compatibility should be shallow and practical.

A variant does not need to use the same strict semantic contract as the source component.

It only needs to be safe to render from the same import boundary.

This means all of the following are allowed:

- source table variant uses `items`
- replacement variant ignores `items`
- replacement variant renders a static call-to-action

The real rule is:

- do not crash when mounted from the same parent import site

Validation can become stricter later, but the day-1 product should not force users to formalize types more than their codebase already does.

## Vite-first implementation

The code in this repo currently implements the architecture as a Vite plugin.

Main pieces:

- `variantPlugin()` in [packages/variant/src/plugin.ts](/Users/darko/personal/variant/packages/variant/src/plugin.ts:1)
- headless runtime controller in [packages/variant/src/runtime-core.ts](/Users/darko/personal/variant/packages/variant/src/runtime-core.ts:1)
- browser bindings and overlay in [packages/variant/src/runtime-dom.ts](/Users/darko/personal/variant/packages/variant/src/runtime-dom.ts:1)
- React proxy adapter in [packages/variant/src/runtime.tsx](/Users/darko/personal/variant/packages/variant/src/runtime.tsx:1)
- proving workflow through an external consumer app linked to this repo locally

### Development behavior

For a source file that has a matching `.variants` entry:

1. Vite resolves the normal component import.
2. Variant intercepts the resolved module id.
3. Variant resolves the matching mirrored folder from `.variants/`.
4. Variant generates a virtual proxy module.
5. That proxy imports:
   - the source component as `source`
   - all discovered exploratory variants for that boundary
6. The runtime exposes those choices through the overlay and keybindings.

### Production behavior

For the same component:

1. Vite resolves the same normal import.
2. Variant rewrites it to a production proxy module.
3. That proxy imports only:
   - the single production implementation for that component boundary
4. Non-selected variants are absent from the production import graph.

## Runtime behavior

The browser runtime is development-only and auto-injected by the plugin.

It is responsible for:

- tracking which proxied components are currently mounted
- storing current runtime selections
- rendering the overlay
- registering keybindings

Default keybindings:

- `Cmd/Ctrl + Shift + .` toggles the overlay
- `Cmd/Ctrl + Alt + ArrowUp/ArrowDown` changes the active mounted component
- `Cmd/Ctrl + Shift + ArrowLeft/ArrowRight` changes the active variant

## Why this architecture is a better fit for adoption

This import-rewrite model is better because:

- exploratory files stay outside the production component tree
- app imports stay unchanged
- engineers do not need to thread Variant-specific abstractions through feature code
- designers or experimental builders can work in `.variants/` with less social friction

The swap boundary is created by the bundler instead of app-source integration code.

## Risks

### 1. Bundler complexity

Import rewriting is more subtle than explicit source wrappers.

Mitigation:

- start Vite-first
- keep the file convention small and explicit
- keep proxy generation deterministic

### 2. Weak compatibility guarantees

Variants may ignore props or data that the source used.

Mitigation:

- treat compatibility as runtime safety, not type identity
- add warnings later if needed
- let AI repair breakage when shallow compatibility is not enough

### 3. Production trust

If production accidentally includes exploratory variants, adoption fails immediately.

Mitigation:

- verify production build output
- keep selected-variant generation explicit in the plugin
- fail loudly on invalid `.variants` configs

## Current implementation status

Implemented:

- top-level `.variants` scanning
- Vite plugin import interception
- virtual proxy modules in development
- production selected-variant rewriting
- development overlay and keybindings
- split runtime architecture with headless controller, browser adapter, and React adapter
- external proving workflow with unchanged imports and externalized variants

Not implemented yet:

- Next.js adapter
- stricter validation tiers
- visual highlighting on the page
- persistence beyond local browser state

## Next build steps

1. Harden config validation and error messages.
2. Add a richer variant file mapping format beyond same-name sibling files.
3. Add watch-mode verification for live editing in `.variants/`.
4. Prototype a Next.js adapter that preserves the same mental model.
5. Add optional warnings for obviously unsafe variants without blocking experimentation.
