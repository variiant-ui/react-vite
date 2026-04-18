# variiant-ui Vision

## One-line idea

`@variiant-ui/react-vite` should make design iteration inside a real running React app feel normal, fast, and reviewable.

The product is not "AI edits your component." The product is "your app gains an exploration layer" where multiple implementations, lightweight annotations, and bounded tweaks can coexist without destabilizing the source component or the production bundle.

## Core thesis

Design exploration should happen in the real app:

- on top of real routing, data, auth, and providers
- without replacing the canonical source file
- without forcing teams into a separate design canvas workflow
- without shipping every experiment to production

The right abstraction is not arbitrary DOM editing. The right abstraction is a component boundary plus contextual input around that boundary.

## Updated product model

variiant-ui should organize the in-browser workflow into three distinct jobs:

### 1. Ideate

The user is on the live page and wants to direct the next change.

They should be able to:

- type an instruction
- point at the relevant component
- attach contextual comments
- attach a sketch over the current UI
- submit one request that carries both natural language and structured visual context

### 2. Review

The user wants to understand what the agent produced and compare options.

They should be able to:

- see which component families changed
- preview generated variants on the live page
- open a focused comparison surface for one component family
- cycle and compare alternatives without losing app context

The live page is the page-context review surface. A dedicated comparison surface still matters, but it should be component-oriented, not a duplicated full-page gallery.

### 3. Tweak

The user does not always need another full prompt.

Many follow-up edits should be cheap and deterministic:

- change copy
- adjust static Tailwind utility values
- later, adjust selected tokenized style values

This should be a separate bounded workflow, not a disguised prompt.

## Product direction

The runtime should move away from a generic floating utility bar toward a clearer transient dock.

Target direction:

- bottom-centered transient dock
- large prompt/composer area
- small explicit tool modes
- ideation and review as first-class states
- deterministic tweaks as a sidecar workflow

The dock should stay transient. Variant should not become a persistent sidebar by default.

## What variiant-ui is

variiant-ui is:

- a build-integrated runtime for switchable component implementations
- a structured exploration workflow for humans and local coding agents
- a safe place to accumulate and compare multiple component directions
- a review surface for evaluating live alternatives in context
- a bounded tweak system for fast post-generation refinement

## What variiant-ui is not

variiant-ui is not:

- a generic no-code DOM editor
- a Figma replacement
- a persistent collaboration backend
- a full visual builder for arbitrary page patches
- an excuse to move runtime state back into React presentation code

The unit of composition remains the component boundary, even when the browser UI renders overlays, comments, and sketches on top of the page.

## Primary users

### Product engineers

They want to explore multiple directions without overwriting a working component.

### Designers who work in code

They want to guide changes in the live app with comments, sketches, and reviewable alternatives.

### AI-assisted builders

They want a structured protocol that preserves existing code and produces parallel variants instead of destructive edits.

### Stakeholders

They want to compare real alternatives in the running product, not only screenshots.

## Design principles

### Real app first

The live app is the primary surface. Page context comes from the actual route, not a cloned mock.

### Component boundaries stay central

Variant targets component imports, variant files, and explicit runtime registrations. It should not collapse into arbitrary DOM patching.

### Context beats verbosity

Good prompts should come from richer context, not only from longer text. Comments and sketches should reduce prompt bloat, not increase it.

### Exploration without destruction

A new direction should create or update a variant, not replace the canonical source file by default.

### Deterministic when possible

If a change can be applied with a bounded local rewrite, Variant should not waste tokens on a full agent run.

### Clear review surfaces

Generating alternatives is not enough. The product must make the results legible and easy to compare.

### Low integration cost

Teams should still adopt Variant with unchanged imports, one package, one Vite plugin, and one browser workflow.

## Target runtime shape

The long-term runtime has these surfaces:

### Transient dock

The default entrypoint for prompt entry, tool selection, status, and lightweight review actions.

### Comment mode

The user hovers the live DOM, sees the target boundary, and drops contextual comments that travel with the request.

### Sketch mode

The user draws over a non-interactive overlay canvas, then attaches or discards the sketch.

### Review surface

The user compares component variants in a focused stacked view, while the live page remains the contextual presentation surface.

### Tweaks panel

The user applies bounded deterministic edits such as copy changes and later static utility changes.

## Current strategic calls

These calls shape the direction of the product:

- The live page is the only page-context surface.
- The old page-mode canvas direction is obsolete and should be removed.
- Comments should be contextual and visibility-aware.
- Sketch mode should own pointer interaction while active.
- Global single-letter shortcuts should not hijack normal typing; tool-local shortcuts are acceptable.
- Business logic for modes, comments, sketches, review sessions, and tweak state belongs in `runtime-core.ts` unless it depends on the browser.

## Success criteria

variiant-ui is successful if teams can do all of the following cheaply:

- preserve multiple viable UI directions in one codebase
- add structured context to a request without writing a giant prompt
- review generated alternatives clearly in the running app
- make small deterministic follow-up edits without another full agent run
- promote a chosen implementation to production without shipping every experiment

## Non-goals for this phase

- arbitrary DOM editing as the main product model
- remote persistence of comments or sketches
- cross-framework support beyond React
- perfect state retention across every variant swap
- visual editing so open-ended that every change becomes an unreliable AST guess

## End state

If the product works, "show me five viable directions for this component, mark up the page, tweak the copy, and review them in the real app" becomes a normal engineering workflow rather than a custom sprint artifact.
