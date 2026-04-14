# AGENTS

This repo publishes `@variiant-ui/react-vite`. Keep the public install story as one package even if the internals keep splitting into smaller modules.

## Product boundary

- Public surface: one package, one Vite plugin, one browser workflow.
- Internal split: headless runtime logic, browser bindings, React adapter, and bundler integration stay separate.
- Do not move runtime state management back into React components just because the overlay is a React-rendered control.

## Source map

- `packages/variant/src/plugin.ts`: Vite integration and virtual proxy generation.
- `packages/variant/src/runtime-core.ts`: headless controller, selections, mounted-component tracking, and shortcut actions.
- `packages/variant/src/runtime-dom.ts`: browser event bindings and compact overlay UI.
- `packages/variant/src/runtime-api.ts`: singleton browser-facing helpers such as `installVariantOverlay()` and `setVariantShortcuts()`.
- `packages/variant/src/runtime.tsx`: React proxy adapter that binds source and variant components to the controller.
- local proving app: keep the real consumer app outside this repo. The current local target is `~/personal/shadcn-admin`, which installs this package via an npm local file dependency with `--install-links`.
- `docs/`: product, adoption, proving, and implementation notes that must stay aligned with the shipped behavior.

## Working rules

- Keep the overlay transient. It opens on `Cmd/Ctrl + Shift + .` and should not become a persistent sidebar by default.
- Keep active-component and active-variant shortcuts working whether the overlay is open or closed.
- Do not hijack accessibility-critical keys such as plain `Tab`.
- New browser shortcuts must be safe outside text input and easy to override later.
- Business logic belongs in `runtime-core.ts` unless there is a hard browser dependency.
- Browser-only code belongs in `runtime-dom.ts` or `runtime-singleton.ts`.
- React-only rendering concerns belong in `runtime.tsx`.
- If the public package name changes, update generated import strings in `plugin.ts`, docs, the external proving app, and package metadata in the same change.

## Documentation checklist

- Update root `README.md` when install, imports, shortcuts, or the local proving workflow change.
- Update `packages/variant/README.md` before publishing so npm gets accurate package docs.
- Update `docs/API_AND_ADOPTION_GUIDE.md` and `docs/IMPLEMENTATION_PLAN.md` when architecture or file conventions change.
- Update `docs/LOCAL_PROVING_PLAN.md` when the proving workflow changes.

## Versioning

- Current phase is pre-1.0 semver, starting at `0.1.0`.
- Do not bump the package version for repo moves, local proving-app changes, or doc-only cleanup unless that change is part of an actual release.
- Patch releases are for fixes, docs, and non-breaking tooling cleanup.
- Minor releases cover any intentional user-visible package behavior change, public API/config change, shortcut change, or breaking change while pre-1.0.
- If a change is only for local workflow, internal cleanup, or unreleased proving ergonomics, keep the version unchanged.
- Every breaking change must be documented in the README and relevant docs in the same release.
- Do not publish a new version unless build, tests, and docs have all been updated together.
