# Changelog

All notable changes to the GOALS Optimizer made during Phases 1–5 are documented below.

---

## Phase 1 — Audit (Initial Assessment)

- Performed full codebase audit covering backend, frontend, data flow, and code quality.
- Identified prioritized issues: redundant stat configs, unused tactics settings, duplicate player keys, hardcoded penalties.
- Generated `AUDIT_REPORT.md` documenting all findings with severity ratings.
- Established compliance guidelines for the unofficial fan-tool disclaimer.

## Phase 2 — Backend Stabilization

- **Tactics engine**: Fixed `tactics-engine.ts` to consume `customSettings` from `TacticsPanel` instead of discarding them with `void`. User-adjustable tactical focus now takes effect.
- **Constants**: Removed redundant `stats-reference.json` (duplicate of `stat-reference.json`). Consolidated all stat config references to a single source of truth.
- **Error handling**: Improved resilience in scraper clients (`goalsverse-client.ts`, `goals-tracker-client.ts`, `playgoals-client.ts`) with better error propagation and fallback behavior.
- **Enrichment fallback tests**: Expanded coverage for enrichment fallback scenarios.

## Phase 3 — Frontend Stabilization

- **min-h-screen**: Restored `min-h-screen` to `body` and the root layout wrapper in `layout.tsx`, ensuring full-height pages on all routes.
- **loading.tsx**: Added `src/app/loading.tsx` with a centered spinner and loading text for top-level route transitions.
- **Slot position fix**: Corrected slot/position mapping in `PitchView.tsx` to align with GOALS position taxonomy (not FIFA/EA FC legacy mappings).
- **Mobile layout**: Refined padding classes (`pt-11 pb-14` / `lg:pt-0 lg:pb-0`) for consistent spacing across mobile and desktop.

## Phase 4 — Refactoring

- **api-types.ts**: Extracted shared API type definitions into `src/lib/api-types.ts`, reducing duplication across scraper modules.
- **player-id.ts**: Centralized player ID generation and parsing logic into `src/lib/player-id.ts`.
- **Config cleanup**: Removed orphaned config file `stats-reference.json`; validated all remaining config imports point to the correct paths.
- **Import hygiene**: Cleaned up unused imports and resolved type re-export chains across the codebase.

## Phase 5 — Disclaimer Banner, Branding, README Update

- **DisclaimerBanner.tsx**: Created dedicated banner component displaying "Unofficial community tool by ivo-tech — not affiliated with or endorsed by the Goals developers." Placed as a sticky top bar.
- **layout.tsx**: Integrated `DisclaimerBanner` into the root layout. Added matching disclaimer text in the footer.
- **Metadata**: Updated page title and description in `layout.tsx` to clearly state the unofficial fan-tool nature.
- **README.md**: Rewrote to reflect the GOALS-only scope, added compliance note, removed any implied EA FC connection.
- **Branding**: Ensured all user-facing text consistently refers to "GOALS" (not "EA FC" or "FIFA").

---

*All phases verified: 295 tests passing, ESLint clean, production build succeeding.*
