# variiant-ui Vision

## One-line idea

`@variiant-ui/react-vite` is a package for React applications that turns design exploration into a first-class development workflow by letting teams generate, register, and switch between multiple real component implementations directly inside the running app.

## Problem

AI makes it easy to produce a new UI direction quickly, but current workflows collapse back to a single implementation too early.

The main failure modes are:

- AI overwrites the current source-of-truth component instead of preserving multiple viable directions.
- Teams can show only screenshots or disconnected prototypes instead of real product behavior.
- Product and design stakeholders cannot compare alternatives side by side in the actual application context.
- Engineers lose time re-creating prototype ideas because the exploratory version is not connected to the real app.
- "Which version did we like best?" becomes a Slack archaeology problem instead of a trackable code decision.

## Product thesis

Design iteration should happen inside the real application, on top of real data, real state, and real interactions.

Instead of replacing a component with one new AI-generated version, the codebase should be able to hold several variants of the same component at once. During development, the team should be able to switch those variants live on the page. During production builds, only the chosen variant should ship.

This gives AI and humans a safe place to explore without destabilizing the primary implementation until a decision is made.

## Vision

variiant-ui should feel like a design branch system for React components:

- The app keeps a stable canonical component contract.
- Alternative visual and structural implementations can exist beside the default implementation.
- The running app can swap between them live.
- The swap should preserve the surrounding app environment and use the same props, hooks, providers, routing, and theme tokens.
- The final decision can be promoted cleanly into production without shipping every experiment.

## What this is

variiant-ui is:

- a runtime developer tool for React apps
- a registry system for component variants
- a file/folder convention for storing variant implementations
- a keyboard-driven in-browser inspector/switcher
- a build-time pruning system so only approved variants ship to production
- a workflow surface for humans and AI agents to create new variants safely

## What this is not

variiant-ui is not:

- a design canvas tool like Figma
- a no-code website builder
- a generic visual editor that mutates arbitrary DOM
- a theme switcher for token sets only
- a hot reload replacement
- a full A/B testing platform

The core unit is a React component implementation, not arbitrary DOM patches.

## Primary users

### 1. Product engineers

They want to try multiple dashboard, settings, onboarding, and marketing UI directions without losing the current version.

### 2. Designers who work in code

They want to see alternatives inside the live app instead of only in static mocks.

### 3. AI-assisted builders

They want a stable workflow where an AI can create a new variant without overwriting the current implementation.

### 4. Founders and stakeholders

They want to review real alternatives quickly in the running product.

## Core user experience

### Variant creation

The user or an AI agent creates a new implementation of an existing component under a known variants folder structure. The variant keeps the same component contract as the original component.

Example intent:

- "Create a denser analytics dashboard variant."
- "Create a more editorial hero section."
- "Create three card layout explorations for this report page."

### Variant registration

The package discovers or registers the available variants for a component. These variants are tied to a stable component ID so the runtime knows which alternatives exist.

### Runtime inspection

In development mode, the user opens the app and presses a keyboard shortcut. An overlay or command bar appears and shows:

- which variant-enabled components are present on the current page
- which variant is active for each component
- what alternatives are available

### Live swapping

The user switches a component from one variant to another. The running page updates immediately, but the component still executes inside the real application tree, with the same props and surrounding providers.

### Decision and promotion

Once the team decides on a final variant, they mark it as selected. Production builds include only the selected implementation.

## Design principles

### 1. Real app, not simulation

Variants should render in the actual product tree, not in an isolated mock environment.

### 2. Preserve component contracts

A variant should be a drop-in replacement for the original component, not a loosely related redesign that breaks usage.

### 3. Exploration without destruction

Creating a new variant should never require overwriting the existing implementation.

### 4. AI-native workflow

The system should provide enough structure that AI can generate variants safely and predictably.

### 5. Explicit production selection

Production output must be deterministic. The build should know which variant is canonical.

### 6. Low integration cost

Adoption should be feasible in an existing React or Next.js codebase without rewriting the whole app.

## Product shape

The long-term product likely has four surfaces:

### 1. Runtime package

Installed into the React app. Provides the registry, overlay UI, keyboard shortcut, swapping mechanics, and development-only tooling.

### 2. Build integration

Ensures development mode can load all variants, while production mode includes only the chosen variant.

### 3. File convention and CLI

Provides commands to create, list, validate, select, and clean up variants.

### 4. AI skill / protocol

Gives AI agents a documented workflow for creating new variants inside the right folders while respecting component contracts and local design tokens.

## Example workflow

1. The team installs `@variiant-ui/react-vite` into an existing React + Vite app.
2. They keep importing a component normally, for example `DashboardShell`.
3. The default implementation remains the current source of truth.
4. An AI agent generates `dashboard-shell.compact.tsx` and `dashboard-shell.editorial.tsx` as new variants.
5. The app runs in development mode with the Variant runtime enabled.
6. The user presses the shortcut and sees `DashboardShell` listed with three implementations.
7. They switch between variants live on the page during a stakeholder review.
8. They mark `compact` as the selected production variant.
9. The production build includes only that chosen implementation.

## Success criteria

variiant-ui is successful if it makes the following cheap and reliable:

- preserving multiple viable component ideas in one codebase
- reviewing design alternatives in the actual running app
- using AI to generate variants without overwriting working code
- promoting a chosen variant into production cleanly
- keeping variant code aligned with the existing app's tokens, data, and contracts

## Constraints and truths

Several truths shape the product:

- Swapping arbitrary components live is only safe if variant contracts are disciplined.
- React state preservation is subtle. Some swaps can preserve parent and provider state, but local component state may reset depending on how the implementation changes.
- Build pruning needs bundler support or a clear compile-time strategy.
- Teams will want gradual adoption, not a framework rewrite.
- Next.js support matters, but the concept should stay React-first rather than Next-specific.

## Non-goals for v1

- arbitrary visual editing of any node on the page
- cross-framework support beyond React
- perfect state retention across every possible component swap
- automated design quality scoring
- remote collaboration backend
- persistence of stakeholder comments inside the tool
- production experimentation or traffic splitting

## Positioning

variiant-ui sits between design tooling and production code:

- more real than a mockup
- safer than AI overwriting source files
- faster than hand-building multiple branches
- more reviewable than screenshot-based exploration

## Long-term vision

If the product works, a React codebase gains a native design exploration layer:

- every important component can have an intentional evolution history
- AI can propose alternatives without trashing the baseline
- product reviews can happen in the real app
- chosen variants can graduate cleanly into production

The end state is that "show me three viable UI directions in the real app" becomes a normal engineering operation, not a custom sprint.
