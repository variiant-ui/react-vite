# variiant-ui Local Proving Plan

## Purpose

Prove the updated product direction in a real consumer app outside this repo, currently `~/personal/shadcn-admin`.

The proof now needs to validate more than variant swapping. It needs to validate the new browser workflow:

- ideation on the live page
- legible review of generated results
- bounded deterministic tweaks

The proof is successful only if the integration feels elegant to a normal React team, not merely technically possible.

## What to prove

We need evidence for these claims:

- a React app can enable Variant without editing component callsites
- exploratory files can live fully under `.variiant/variants/`
- the live page is enough for page-context exploration
- the transient dock is a better entrypoint than a generic floating utility surface
- contextual comments improve prompt quality without making the runtime noisy
- sketch mode feels intentional and not broken
- generated variants are easier to review after a run
- small copy edits can happen without another full prompt
- production still excludes non-selected variants

## Host app selection

Use a real app with:

- React and TypeScript
- Vite
- a visually meaningful route
- at least one component family worth iterating on

Good proving targets:

- dashboard overview
- analytics panel
- settings surface
- data table or card grid

Avoid tiny primitives for the first proof. The product needs to prove a meaningful exploration workflow.

## Proof setup

### 1. Install the package locally

In the host app:

```bash
npm install --install-links /Users/darko/personal/variant/packages/variant
npm exec variiant init
```

### 2. Add the plugin

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { variantPlugin } from "@variiant-ui/react-vite";

export default defineConfig({
  plugins: [variantPlugin(), react()],
});
```

### 3. Keep imports unchanged

```tsx
import DashboardOverview from "@/dashboard/DashboardOverview";
```

### 4. Add top-level variant folders

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

## Proving stages

### Stage 1: Runtime baseline

Validate:

- the runtime bootstraps with unchanged imports
- mounted component tracking works
- variant switching still works on a real page
- production excludes non-selected variants

### Stage 2: Dock and review flow

Validate:

- the transient dock opens and closes reliably
- the dock is understandable as an ideation and review entrypoint
- generated-result summaries are legible after a run
- component-focused review is enough without a duplicated page gallery

### Stage 3: Comment mode

Validate:

- hover targeting feels precise
- comment placement is obvious
- comments hide when their target is not visible
- comment context improves the resulting agent output

### Stage 4: Sketch mode

Validate:

- entering sketch mode clearly changes interaction
- drawing is smooth
- submit/discard flows are obvious
- sketch attachments are useful to the local agent

### Stage 5: Deterministic tweaks

Validate:

- copy tweaks are faster than issuing a new prompt
- tweak affordances are understandable
- rewrites only affect variant files
- Tailwind tweak support, when added, remains reliable on static utility strings

## Manual validation

### Baseline

1. Start the app in development mode.
2. Open a route that mounts the target component.
3. Confirm the source implementation renders with unchanged imports.
4. Add one or more variant files under `.variiant/variants/`.
5. Confirm the runtime detects and swaps those variants.
6. Verify keyboard navigation between mounted components and variants.

### Ideate

1. Open the dock.
2. Enter a prompt for the active component.
3. Submit a run and confirm the session is created under `.variiant/sessions/`.
4. Confirm generated files land under the correct mirrored variant directory.

### Comments

1. Enter comment mode.
2. Hover a visible target and confirm its boundary highlight.
3. Place a comment on a target inside a tab or conditional view.
4. Change the UI state so the target disappears.
5. Confirm the comment is hidden rather than rendered in the wrong place.

### Sketch

1. Enter sketch mode.
2. Confirm normal page interaction is disabled while drawing.
3. Draw, then discard once.
4. Draw again and submit.
5. Confirm the sketch is attached to the request session.

### Review

1. Run a prompt that creates multiple variants.
2. Confirm the runtime reports which component family changed.
3. Preview the generated variants on the live page.
4. Open the component-focused comparison surface.
5. Confirm the result is legible without relying on a full-page clone mode.

### Tweaks

1. Select an existing variant.
2. Use the tweak UI to change literal copy.
3. Confirm the rewrite affects only the variant file.
4. Refresh and confirm the result remains selectable and mounted.
5. When Tailwind tweaks exist, validate a static utility replacement such as `px-4` to `px-2`.

### Production

1. Run a production build.
2. Inspect the output bundle.
3. Confirm exploratory non-selected variants are absent.

## Pass criteria

The proof passes if:

- import paths remain untouched
- exploratory files stay fully under `.variiant/variants/`
- the dock improves ideation and review clarity
- contextual comments are helpful and not noisy
- sketch mode feels intentional
- generated results are easier to understand than they were with the old runtime
- copy tweaks work without another full prompt
- non-selected variants remain absent from the production bundle

## Failure criteria

The proof fails if:

- teams must wrap source components to opt in
- the runtime still depends on duplicated page-mode comparison to explain results
- comments feel detached from the UI they describe
- sketch mode fights normal page interaction
- deterministic tweaks are too brittle to trust
- production output includes exploratory non-selected variants

## Questions to answer after proofing

1. Does the dock make the product easier to understand than the old floating-bar mental model?
2. Is the live page enough as the only page-context surface?
3. Do comments and sketches materially reduce prompt length and ambiguity?
4. Is copy-tweak support valuable enough to justify the deterministic rewrite path?
5. Which Tailwind utility groups are safe enough to support next?
