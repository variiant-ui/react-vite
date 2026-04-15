# variiant-ui React/Vite Implementation Plan

## Goal

Let a React app keep exploratory component versions outside the main source tree while swapping them live in development and ship only the selected implementation in production.

The current implementation direction is:

- `.variiant/variants/` as the canonical workspace
- unchanged component imports in app source
- bundler-level import rewriting
- development overlay with runtime keybindings
- production build selecting exactly one implementation per component

## Core design choice

Variant should not ask developers to wrap components with a source-level contract as the primary integration path.

The swap boundary still has to exist, but it should live in the toolchain, not in user source code.

That means:

- app code keeps importing `src/components/Foo.tsx`
- the plugin detects that `.variiant/variants/` contains a mirrored target for that source file
- the bundler rewrites the import to a generated proxy module

This gives us a stable boundary without polluting the main component tree.

## File convention

Current convention:

```text
.variiant/
  .gitignore
  variants/
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
- the mirrored path under `.variiant/variants/` must match the real source module path

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

For a source file that has a matching `.variiant/variants` entry:

1. Vite resolves the normal component import.
2. Variant intercepts the resolved module id.
3. Variant resolves the matching mirrored folder from `.variiant/variants/`.
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
- designers or experimental builders can work in `.variiant/variants/` with less social friction

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
- fail loudly on invalid `.variiant/variants` configs

## Current implementation status

Implemented:

- `.variiant/variants` scanning, with fallback to legacy `.variants`
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
3. Add watch-mode verification for live editing in `.variiant/variants/`.
4. Prototype a Next.js adapter that preserves the same mental model.
5. Add optional warnings for obviously unsafe variants without blocking experimentation.

## Agent-assisted iteration plan

### Goal

Let a designer or product engineer open the existing floating bar, reference one or more components on the page, describe a change in natural language, and route that request to a locally configured coding agent running in the app's working directory.

The agent should be able to:

- create a new exploratory variant under `.variiant/variants/`
- update an existing exploratory variant
- make safe local source edits when the configured skill says that is appropriate
- stream progress back into the bar when the CLI supports it
- fall back to a pending state plus final result when the CLI cannot stream incrementally

The package should still stay one package, one Vite plugin, and one browser workflow. This is not a hosted agent product. The browser overlay is a local front end for a local process the user already trusts and configures.

### Product shape

The new surface should extend the existing transient overlay instead of introducing a second panel or a permanent assistant sidebar.

The intended interaction is:

1. The user opens the floating bar with `Cmd/Ctrl + Shift + .`.
2. They optionally enter inspect mode and click one or more relevant components on the page.
3. They optionally enter sketch mode and annotate the current screen.
4. They type a request such as "Make this pricing card feel more premium and add a stronger CTA."
5. Variant sends a structured request to the configured local agent process.
6. The bar shows progress, streamed output when available, and a compact status view while work is running.
7. The project files change locally.
8. Vite reloads the affected modules and the result becomes visible immediately as a new or updated variant.

The overlay remains transient. When idle, it stays compact. When running, it can expand just enough to show logs, status, and resulting actions without becoming the default screen furniture.

### Core design choice

Variant should not try to become an agent framework.

The package should provide:

- a browser UI for prompt entry, inspect selection, and sketch capture
- a dev-server bridge that launches a local command in the project working directory
- a structured request format so arbitrary local agents have enough context to do useful work
- best-effort streaming of agent output back to the page

The package should not provide:

- a hosted backend
- a remote execution environment
- a new multi-agent runtime
- a mandatory skill format beyond passing local files and instructions to the configured CLI

The right abstraction is "local agent bridge", not "new agent platform".

### Config model

Use a top-level `variiant.config.json` in the host app.

That file should configure only the local-agent workflow and other top-level Variant behavior. We should not keep or expand the older per-component JSON manifest idea inside `.variiant/variants/`.

Recommended shape:

```json
{
  "agent": {
    "command": ["codex", "--dangerously-bypass-approvals-and-sandbox"],
    "cwd": ".",
    "streaming": "auto",
    "skill_paths": [
      "./skills/design-variants/SKILL.md",
      "~/.variiant/skills/local-design-agent.md"
    ],
    "prompt_preamble_file": "./.variiant/agent-preamble.md",
    "allow_source_edits": true
  }
}
```

Notes:

- Support both `command: string` and `command: string[]`, but recommend the array form for less shell ambiguity.
- `cwd` defaults to the Vite project root.
- `streaming` should support `auto`, `text`, and `none`.
- `skill_paths` should be plain local file paths in v1.
- Remote skill discovery or downloads from `variiant.dev` can come later as a companion workflow, but the runtime should only need local paths.

### Request contract

The browser should not try to cram all context into argv.

For each agent request, the dev server should materialize a session folder such as:

```text
.variiant/sessions/<timestamp>-<id>/
  request.json
  prompt.md
  orders-table.png
  page.png
  sketch.png
  selection.json
```

This gives the local agent ordinary file-based context inside the project root. Any CLI can read those files naturally, and the user can inspect them when something goes wrong.

`request.json` should include:

- the user prompt
- route URL and page title
- timestamp
- selected inspect targets
- known mounted variant boundaries
- current active component and active variant
- changed files from the current session once the run finishes
- references to any saved images

Current shipped behavior:

- Ask Agent can optionally attach the active component screenshot when `agent.image.cliFlag` is configured
- the browser captures that component at 1x resolution and stores the saved image in the session folder
- `request.json` records the saved attachment path rather than inlining the base64 payload
- the dev server passes the saved image path to the configured CLI flag

`prompt.md` should be a stable instruction wrapper that tells the agent:

- where the request files live
- which skill files to consult
- whether it should prefer creating a new variant or editing an existing one
- that the app uses Variant's `.variiant/variants/` workflow
- that results should stay compatible with the same import boundary

This contract is important because it keeps the browser and the agent loosely coupled. The local CLI can improve over time without changing the browser UI every time.

### Inspect plan

The inspect tool should behave like DevTools from the user's point of view.

The preferred target is the nearest meaningful React component boundary for any component on the page, not just existing Variant-enabled boundaries and not an arbitrary leaf DOM node.

That means v1 inspect should be React-first:

- hover highlights the nearest meaningful React component boundary
- click selects one or more targets
- each target resolves to the best available component identity, such as display name, source path, source location, current variant if known, and a DOM fallback selector when React data is weak

The targeting priority should be:

1. nearest meaningful React component boundary discoverable from the clicked DOM node
2. Variant boundary metadata when the element sits inside an already proxied component
3. DOM hierarchy fallback when React boundary inference is unavailable

The important product rule is:

- do not make the user click tiny implementation details like icons, labels, or nested decoration when a larger user-meaningful component boundary can be inferred

The most promising no-extension path is to inspect React's development-time DOM associations and walk from the clicked DOM node up to the nearest user component with useful metadata such as display name or source information. When available, source maps or React DevTools-style metadata can improve the result, but the inspector should not depend on a browser extension or external tool being installed.

To make this practical, the implementation should combine:

- generic React boundary discovery from the clicked DOM node
- development-only Variant boundary instrumentation in proxied components as a strong hint
- heuristics that skip obvious host-only leaves and prefer user-meaningful composite boundaries

Variant-specific instrumentation is still useful, but only as one signal among several. The inspector must work on normal app components even when they are not yet variant-enabled, because creating a variant from an arbitrary existing component is a core use case.

Because React-aware inspection will not always succeed, inspect should degrade gracefully:

- if a reliable React boundary is found, use that as the primary target
- if only partial React data is available, send both the React hint and the DOM path
- if React boundary inference fails entirely, fall back to a relatively specific DOM selector and ancestry summary

The fallback should still be useful enough for the agent to act on, but the UI should bias toward component-sized targets rather than raw leaf elements whenever possible.

### Sketch plan

Sketching should be treated as an attachment, not as a live visual editor.

The browser flow:

- the user enters sketch mode from the bar
- Variant captures a screenshot of the current viewport or page
- a transparent full-screen drawing layer appears above the app
- the user draws with a small set of pen colors and a clear undo action
- submit saves a flattened `sketch.png` or a `page-with-sketch.png` into the session folder

This keeps the mental model simple:

- inspect gives the agent structured component hints
- sketch gives the agent visual intent

The first version should avoid shape editing, text callouts, or persistent canvas documents. A fast pen tool with undo is enough to prove value.

### Runtime split

This feature should respect the current code boundaries.

`runtime-core.ts` should own:

- chat session state
- current mode: idle, inspect, sketch, running, complete, error
- selected inspect targets
- pending attachments and saved attachment references
- agent job state and the latest surfaced agent progress message
- actions for opening inspect mode, adding targets, starting a run, canceling a run, and clearing results

`runtime-dom.ts` should own:

- the expanded floating bar UI
- inspect overlays and hover highlights
- sketch canvas interactions
- screenshot capture
- fetch or stream wiring to the dev-server bridge

`runtime-api.ts` should expose any public browser helpers, for example:

- `installVariantOverlay()`
- optional future helpers like `openVariantChat()` or `startVariantInspect()`

`runtime.tsx` should stay focused on React proxy behavior:

- existing variant switching
- development-only boundary instrumentation so inspect can map DOM to component boundaries

`plugin.ts` should own:

- loading `variiant.config.json`
- injecting the client-side agent configuration into the dev runtime
- creating the dev-server endpoints that launch and monitor the local agent process

### Dev-server bridge

The Vite plugin should expose local-only development endpoints under a reserved path such as:

- `POST /__variiant/agent/run`
- `POST /__variiant/agent/cancel`
- `GET /__variiant/agent/events/:id`

There are two reasonable transport options:

- fetch streaming with newline-delimited JSON
- server-sent events for status plus a normal POST to start work

The simplest path is a single POST that returns a streamed response when available and a buffered final response otherwise.

The server should:

- create the session folder
- write request files
- spawn the configured command in the configured working directory
- capture stdout, stderr, exit code, and duration
- stream structured events back to the browser when possible
- detect changed files at the end of the run

### Streaming model

Not every local CLI will provide structured machine-readable output. The bridge therefore needs explicit capability tiers:

1. `text`
   Stream raw stdout and stderr lines into the UI as terminal-style progress.
2. `none`
   Show a spinner and final completion summary only.
3. `auto`
   Attempt streaming, but fall back to buffered completion if the process or platform makes streaming unreliable.

This is enough for v1.

Later, Variant can support a richer structured adapter mode where a wrapper script emits event types such as:

- `status`
- `thought`
- `file_change`
- `artifact`
- `done`

But the base product should not depend on that.

### Result model

When a run completes, the UI should summarize outcomes in product terms rather than dumping process trivia.

Useful result items:

- created variant `premium-card`
- updated variant `compact`
- changed source file `src/components/PricingCard.tsx`
- saved sketch attachment
- run duration
- exit status

If the run created or updated a variant that is already known to the runtime, the UI should offer a one-click action to switch to it. If the edited files changed the current page directly, the normal dev reload behavior is enough.

### UX requirements

The desired experience is smooth and designer-friendly, which means:

- the bar opens quickly and feels lightweight
- inspect mode makes it obvious what will be sent to the agent
- sketch mode feels direct and disposable
- the running state is readable without pretending to be an IDE terminal
- the result state makes the next action obvious: review, switch variant, retry, or refine

The UI should avoid feeling like a developer console bolted onto the page. The main bar can stay compact, but it should support:

- a textarea or expanding input for prompts
- chips for selected inspect targets
- small attachment previews
- a compact single-message progress strip
- prominent cancel and retry actions

### Safety and scope controls

This feature is inherently powerful because it launches a local command from the browser.

Guardrails should be:

- development-only
- disabled unless `variiant.config.json` explicitly enables the agent command
- same-origin only
- protected by a per-page session token injected by the plugin
- never included in production output

Variant should not try to sandbox the configured agent. The user is explicitly pointing Variant at a command they already trust locally.

### Phased rollout

#### Phase 1: Local agent chat

Ship:

- top-level `variiant.config.json`
- prompt input in the floating bar
- dev-server process launch
- latest-message progress strip with spinner fallback
- session folder materialization
- final result summary

Do not ship yet:

- inspect mode
- sketch mode
- structured agent events

Acceptance criteria:

- a user can submit a prompt from the browser
- the configured CLI runs in the project root
- progress is visible in some form
- resulting file changes reload into the running app

#### Phase 2: Inspect targeting

Ship:

- development-only boundary instrumentation
- hover highlight and multi-select targeting
- structured inspect context in `request.json`

Acceptance criteria:

- the user can point at a component on the page instead of naming it manually
- the agent receives useful source and variant hints

#### Phase 3: Sketch attachments

Ship:

- viewport capture
- drawing layer
- flattened image attachment in the request session

Acceptance criteria:

- the user can visually annotate the current screen and send that with the prompt
- the saved artifact is accessible to the agent by local file path

#### Phase 4: Richer agent adapters

Ship:

- optional structured event protocol
- better file-change attribution
- maybe one-click skill installers or curated local skill packs

Acceptance criteria:

- supported CLIs can show clearer progress and richer result summaries without changing the base workflow

### Why this fits Variant

This plan preserves the product boundary:

- one installable package
- one Vite plugin
- one floating browser workflow
- externalized `.variiant/variants/` as the safe home for exploratory work

It also keeps the architecture honest:

- core state stays in `runtime-core.ts`
- browser interaction stays in `runtime-dom.ts`
- React instrumentation stays in `runtime.tsx`
- local process orchestration stays in `plugin.ts`

That keeps the system aligned with the current repo shape while opening a credible path from "switch variants" to "ask for a new variant directly in the app".

## Canvas Comparison Mode Plan

### Goal

Let the user leave the compact floating bar and enter a full-screen comparison canvas where they can pan, zoom, and review variants side by side without mutating the live page.

This canvas should support two presentations:

- `Components`: every currently mounted proxied component family on the current page appears as a separate group, laid out horizontally, with that component's variants stacked vertically inside the group
- `Pages`: the current page is shown multiple times for the currently targeted component, one page preview per variant, so the user can compare the component in context

The canvas is not an editor. It is a comparison surface.

### Product shape

The existing overlay remains the entry point.

The intended interaction is:

1. The user presses `Cmd/Ctrl + Shift + .` to open the floating bar.
2. They click `Open Canvas`, or press a direct shortcut such as `Cmd/Ctrl + Shift + ,`.
3. The app enters a full-screen canvas with a dotted background, top chrome, and pan selected as the default tool.
4. The user pans with pointer drag, zooms with wheel or trackpad pinch, and switches between `Components` and `Pages` from a centered tab group.
5. `Escape` closes the canvas and returns the user to the normal app.

The canvas should be a separate surface state from the overlay. We should not model it as "overlay but bigger."

### Key product decisions

#### 1. Use one surface state, not two independent booleans

The runtime should move away from `overlayOpen: boolean` and instead model the visible UI surface explicitly.

Recommended shape:

- `surface: "closed" | "overlay" | "canvas"`
- `canvas.mode: "components" | "pages"`
- `canvas.camera: { x: number; y: number; zoom: number }`
- `canvas.targetSourceId: string | null`
- `canvas.captureState: "idle" | "capturing" | "error"`

This avoids impossible states such as the floating bar and full-screen canvas both thinking they are primary.

#### 2. Keep page mode scoped to one target component at a time

`Components` mode should only show component families that are actually mounted on the user's current page.

It should not:

- enumerate every variantable source file in the repo
- show component families that are not mounted in the current route or current visible app state
- turn the canvas into a global catalog browser

The practical rule should be:

- if a component family can currently be switched on the live page, it is eligible for `Components` mode
- if a component family is not mounted on the current page, it does not appear in `Components` mode

`Pages` mode should not try to render every component family across every page variant at once. That would explode both visually and computationally.

`Pages` mode should show full-page comparisons for the current target component only.

The current target component should come from:

- the runtime's active component selection
- a picker in the canvas chrome
- existing next/previous component shortcuts

This keeps the page-mode surface legible and keeps capture cost bounded.

#### 3. Preserve existing shortcut behavior

Current shortcuts must continue to work whether the overlay or canvas is open:

- `Cmd/Ctrl + Shift + .` toggles the floating bar
- active-component shortcuts still cycle the current target component
- active-variant shortcuts still affect the live page selection state
- `Escape` closes the canvas first, then the overlay

New canvas-specific shortcuts should be additive and safe:

- `Cmd/Ctrl + Shift + ,` toggles canvas mode directly
- no hijacking of `Tab`, arrow keys without modifiers, or text-editing keys

### Architecture split

This feature should stay aligned with the repo's current boundaries.

`runtime-core.ts` should own:

- surface state: closed, overlay, canvas
- canvas mode, camera state, and target component selection
- mounted component-family metadata
- mounted instance metadata needed for comparison planning
- actions for opening and closing canvas, changing canvas mode, moving target component, resetting camera, and updating capture lifecycle

`runtime-dom.ts` should own:

- the full-screen canvas DOM
- dotted background and chrome
- pan and zoom interactions
- viewport culling decisions
- page-capture orchestration and caching
- non-React DOM measurement helpers

`runtime.tsx` should own:

- React-side mounted instance registration
- context-preserving component preview portals
- per-instance measurement and representative-instance selection signals

`runtime-api.ts` should expose:

- `installVariantOverlay()` as the current entry point
- optional future helpers such as `openVariantCanvas()` if we want a programmatic integration later

### Context inheritance plan

This is the central implementation constraint.

The user explicitly wants the comparison canvas to inherit the same page context as the current app state, including auth, theme, router state, cookies, and provider-backed data.

The implementation should treat the two canvas modes differently.

#### Components mode: live React portals

For isolated component comparisons, the best implementation is to render previews through React portals owned by the already-mounted proxy instances.

Why this works:

- a React portal preserves the provider/context chain of the component that created it
- the proxy already sits inside the real app tree
- the preview therefore sees the same auth, theme, query client, and route context as the live page

Recommended mechanism:

1. Extend `createVariantProxy()` so each mounted proxy instance gets a stable `instanceId`.
2. Register that instance with the runtime, including `sourceId`, visible display name, current measured bounds, and latest props snapshot.
3. When canvas mode is open, the chosen representative instance for each component family renders a portal into the global canvas root.
4. Inside that portal, render all variants for that component family using the instance's current props and the same surrounding React context.

This gives us live, context-correct component comparisons without introducing a provider the consumer app must mount manually.

#### Pages mode: start with captured page previews

Full live page duplication is a different problem.

The current package does not own the consumer app root, so it cannot safely clone the entire live page tree multiple times with different selection overrides while preserving arbitrary provider topology.

The pragmatic v1 plan should therefore be:

- page mode renders captured page previews, not fully interactive duplicated React pages
- each preview is produced by temporarily applying a selection override for the target component, waiting for the page to settle, and capturing the document
- the resulting preview tiles are then shown on the pan/zoom canvas

This still satisfies the main product need:

- the previews inherit the real current page context
- the user can compare full-page outcomes side by side
- the package does not have to guess how to re-mount an arbitrary app root

If we later want truly live duplicated pages, that should be a separate architectural phase with an explicit app-root registration surface. It should not be hidden inside this first canvas implementation.

### Runtime data model

The current runtime only tracks component-family definitions plus mounted counts.

Canvas mode needs more structure.

Recommended additions:

```ts
type VariantCanvasMode = "components" | "pages";

type VariantSurface = "closed" | "overlay" | "canvas";

type VariantCanvasCamera = {
  x: number;
  y: number;
  zoom: number;
};

type MountedVariantInstance = {
  instanceId: string;
  sourceId: string;
  displayName: string;
  width: number | null;
  height: number | null;
  mountedAt: number;
  isVisible: boolean;
};
```

Important behavior:

- component-family selection remains keyed by `sourceId`
- canvas rendering chooses one representative `instanceId` per `sourceId`
- the representative should default to the first visible mounted instance, then fall back to the first mounted instance

That avoids duplicating the same component family several times when the page contains multiple mounts of the same proxied boundary.

### Layout model

The layout should be deterministic and stable so the canvas does not jump around while the user is inspecting it.

#### Components mode layout

For each mounted component family:

- one horizontal group per `sourceId`
- a visible frame-style label sits at the top-left of the group, similar to a Figma frame or group label
- the label should prioritize the source file identity, for example `src/pages/home/dashboard.tsx` or the nearest useful relative file path
- the group can also show a friendlier display name, but the file-oriented label is the primary identifier
- group header metadata shows the current live variant and mount count when useful
- group body stacks all variants vertically
- each variant tile gets the representative instance's measured width as its preferred width when available

This preserves a more realistic component footprint for width-sensitive components such as cards, tables, and toolbar sections.

The important UX property is that the user should be able to scan the canvas and immediately tell which source boundary each group belongs to, the way they can scan named frames in Figma.

#### Pages mode layout

For the current target component:

- one page tile per variant
- tiles laid out horizontally with generous spacing
- each tile shows the variant name and capture status
- captures should be cached until the route, target component, or variant set changes

### Pan and zoom behavior

The canvas should feel familiar to Figma, FigJam, and React Flow users.

Rules:

- pointer drag on empty canvas pans
- wheel and trackpad pinch zoom around the pointer position
- zoom is clamped to a sane range such as `0.25` to `2.5`
- there should be a one-click `Reset View` action in the top chrome
- preview tiles should not be directly interactive in v1

Making the tiles non-interactive is important. The canvas is for comparison, not for accidentally clicking buttons inside previews and mutating app state.

### Performance plan

This feature can get expensive quickly if implemented naively.

The main risks are:

- mounting every variant of every component family at once
- repeatedly capturing the full page while the user pans
- thrashing React by using live global selection changes for previews

Recommended guardrails:

#### 1. Only render comparison previews while canvas is open

No component-preview portals should exist while the user is just using the normal app or the compact overlay.

#### 2. Use representative-instance deduplication

Do not render one comparison group per mount. Render one group per component family.

#### 3. Add viewport culling for component groups

`runtime-dom.ts` should compute which group bounds intersect the visible camera viewport with padding, and only ask React to mount those groups.

This matters because a page with many variantable boundaries could otherwise double or triple render cost immediately.

#### 4. Capture page mode sequentially and cache results

Page captures should be:

- one variant at a time
- cancelable when the target component or route changes
- cached by `url + sourceId + variantName + captureRevision`

The canvas should never re-capture full-page previews just because the user panned or zoomed.

#### 5. Keep live-page selection restoration strict

When page mode temporarily flips the active selection to create a capture, it must always restore the previous live selection map, even on error or cancellation.

That restoration logic needs its own tested helper.

### Edge cases

The implementation needs explicit rules for the cases below.

- No mounted proxied components: opening canvas should show an empty-state screen, not a blank grid.
- One component family with one variant only: still show it in `Components` mode; the canvas is useful even without alternatives if the user wants scale or page context later.
- Multiple mounts of the same source component: dedupe to one representative group and surface a small note such as `3 mounts on page`.
- Width-sensitive components that rely on parent constraints: use measured live width when available; if missing, fall back to an unconstrained tile with a warning badge only in development.
- Variants that suspend or fetch: because component mode uses the same providers, they may legitimately suspend. Each tile needs a loading shell and error boundary so one bad variant does not kill the whole canvas.
- Page capture while the route is changing: cancel the capture batch and invalidate the cache.
- Page capture of very tall pages: cap preview height or scale the capture into a fixed page frame so memory use stays bounded.
- Canvas open while the overlay is open: canvas becomes the primary surface and the overlay is hidden.
- Keyboard focus in text inputs inside the app: the direct canvas shortcut should keep respecting the existing editable-target guard.

### Testing plan

This feature needs both state-level tests and DOM-level tests.

#### `runtime-core.test.ts`

Add coverage for:

- surface transitions between closed, overlay, and canvas
- canvas mode switching between components and pages
- target component selection while canvas is open or closed
- camera reset and persisted camera updates
- representative-instance selection rules
- restoration of live selections after page-capture override planning

#### `variant-plugin.test.tsx`

Add coverage for:

- opening canvas from shortcut and closing with `Escape`
- canvas mode tab switching
- component-group rendering for multiple mounted component families
- representative-instance deduplication when the same source is mounted multiple times
- page-mode capture orchestration for the active component family
- selection restoration after a successful capture batch
- selection restoration after a failed capture batch

#### Additional browser-facing tests

The current test suite is still JSDOM-oriented, which is fine for most state and DOM wiring.

For this feature, add targeted tests for:

- wheel zoom math around the pointer anchor
- pointer-drag panning with pointer capture
- tile non-interactivity inside the canvas

If those interactions become too awkward in JSDOM, that is the point where a small Playwright proving flow in the external consumer app becomes justified.

### Phased implementation

The safest build order is:

1. ✅ Introduce the new surface state, canvas camera state, and direct shortcut without rendering actual previews yet.
2. ✅ Ship `Components` mode with live React portals, representative-instance registration, and viewport culling.
3. ✅ Ship `Pages` mode with sequential cached document captures for the active target component.
4. Add polish such as reset-view, empty states, loading shells, and stronger capture invalidation.

This order matters because it delivers user value early without forcing the hardest part, full-page comparison, to block the correct state model.

### Why this fits the product boundary

This plan preserves the repo's constraints:

- one package
- one Vite plugin
- one browser workflow
- no shift of runtime state management back into React app code

It also stays honest about what the current architecture can and cannot do:

- live isolated component comparisons are a natural extension of the proxy runtime
- full-page comparison should start as captured previews because the package does not own the host app root

That is the right tradeoff for a first canvas mode: useful immediately, context-correct, and implementable inside the current package boundaries.
