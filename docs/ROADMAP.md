# variiant-ui Roadmap

## Goal

Shift Variant from a generic variant switcher with an agent prompt into a clearer exploration product with three workflows:

- `Ideate`
- `Review`
- `Tweak`

This roadmap reflects the current direction:

- the live page is the contextual surface
- duplicated page-mode comparison is obsolete
- richer context should reduce prompt bloat
- bounded deterministic edits should handle cheap follow-up changes

## Phase 0: Direction Lock

Outcome:

- docs rewritten around the new product model
- roadmap and implementation plan established
- repo stops pointing toward page-mode as the future

## Phase 1: Replace the runtime shell

Deliver:

- transient bottom-centered dock
- clearer prompt/composer area
- explicit mode framing for ideation and review
- existing shortcuts preserved where sensible

Why first:

- every other workflow depends on a better browser shell

## Phase 2: Reset review around components

Deliver:

- component-focused comparison surface
- explicit generated-result summaries
- live-page preview affordances
- removal of page-mode from the target product direction

Why now:

- "generate five variants" is not useful unless the runtime makes the results legible

## Phase 3: Add contextual comments

Deliver:

- hover targeting on the live DOM
- comment placement against visible targets
- visibility-aware comment rendering
- comment serialization into request sessions

Why now:

- comments are high-signal, structured context and simpler than sketching

## Phase 4: Add sketch mode

Deliver:

- overlay drawing canvas
- draw / clear / discard / attach flow
- sketch session artifacts for the agent bridge

Why after comments:

- sketching is more complex and should land on top of the clearer dock and session model

## Phase 5: Improve agent payloads

Deliver:

- richer target metadata
- comment attachments
- sketch attachments
- more structured session files under `.variiant/sessions/`

Outcome:

- prompts become shorter because the context is richer

## Phase 6: Deterministic tweaks v1

Deliver:

- tweak mode in the dock
- copy-only deterministic rewrites for active variants
- local analyzer/executor pipeline

Outcome:

- small copy changes no longer require a full agent run

## Phase 7: Deterministic tweaks v2

Deliver:

- static Tailwind utility analysis
- bounded utility controls for spacing, radius, border, gap, and type scale
- deterministic replacements for literal class strings only

Outcome:

- common visual polish changes become cheap and trustworthy

## Phase 8: Tweak-system expansion

Potential future work:

- token/style-variable tweaks
- richer literal prop edits
- deterministic fallback rules
- agent-assisted fallback for unsupported tweak requests

## Ongoing guardrails

These stay true through every phase:

- one package
- one Vite plugin
- one browser workflow
- no source-level wrappers as the default integration path
- business logic stays in `runtime-core.ts`
- browser-only interaction stays in `runtime-dom.ts`
- variant files remain under `.variiant/variants/`
- production still ships only the selected implementation

## Definition of success

The roadmap succeeds if Variant becomes the place where a team can:

- ask for multiple directions in the live app
- annotate intent with comments and sketches
- review results clearly
- make cheap deterministic follow-up edits
- choose one implementation to ship without dragging every experiment into production
