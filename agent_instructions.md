# GOALS Squad Optimizer - Agent Instructions & Roadmap

> Zuletzt gegen den echten Code verifiziert: 2026-07-10. 394 passing Unit-Tests (28 Test-Dateien).

## 1. Project Context & Current State
- **Project Name:** GOALS Squad Optimizer (https://goals.ivo-tech.com/)
- **Repository:** https://github.com/trixr1907/goals-optimizer
- **Core Purpose:** Tactical squad optimization for the game GOALS based on real player stats. Calculates Fit-Scores (positional performance) and Development-Scores / True-Value (upgrade ROI).
- **Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Zustand (state, `src/lib/store/*.ts`).
- **Current Quality Level:** Extremely high. **394 passing unit tests** (verify live with `npx vitest run` — do not trust stale numbers in docs/CHANGELOG), E2E tests, CLI audit scripts (`scripts/audit-payload.ts`), complex handling of missing API data (e.g., `confidence` levels, `isBasic` banners, `dataQuality`).
- **Data Source Reality:** The GOALS API is sometimes incomplete (e.g., missing `training_value`). The codebase handles this via explicit UX (tooltips, missing data banners, `confidence`/`basis`/`missing` fields) rather than silent mathematical failures.
- **Real file map (verified, do not trust filenames guessed from the old draft of this doc):**
  - Fit-Score-Berechnung: `src/lib/scoring/position-fit.ts` (nicht `fit-score.ts`) — exportiert `calcPositionFitScore`, `enrichPlayerWithScores`, `explainFootFit`, `topWeightedStats`.
  - Player-Detail-UI: es gibt **keine eigene `DetailsPanel.tsx`-Datei**. Die Detailansicht ist eine inline-Funktion `DetailsPanel()` innerhalb von `src/app/squad/page.tsx` (ca. Zeile 136+). Analoge Detail-Darstellung für True-Value/Upgrade-ROI liegt in `src/app/development/page.tsx`.
  - True-Value / Upgrade-ROI: `src/lib/analysis/true-value.ts`, `src/lib/analysis/upgrade-roi.ts` (+ jeweilige `.test.ts`).
  - Squad-State: `src/lib/store/squad-store.ts` (Zustand, persist). Kein `manualOverrides`-Feld bisher.
  - Weights-State: `src/lib/store/weights-store.ts` + UI `src/components/development/WeightsPanel.tsx`.
  - Share/Export: `src/components/lineup/ShareCard.tsx`.

## 2. Agent Guidelines (Strict Rules)
1. **Preserve the Architecture:** Do not introduce massive rewrites or "spaghetti code". Respect the current state management (Zustand stores under `src/lib/store/`) and component structure.
2. **Test-Driven:** Any logic changes (especially in `src/lib/analysis/` and `src/lib/scoring/`) MUST be accompanied by updated or new unit tests. Run `npx vitest run` and confirm all tests pass before declaring a feature done. Report the actual test count in your summary — never assume the old number in this doc.
3. **Handle Edge Cases:** Like the current `true-value v2` implementation, always account for `null`, `undefined`, or missing API fields.
4. **UI/UX Consistency:** Use the existing Tailwind configuration and UI components (`src/components/ui/*`). Keep the styling dark-mode compatible and visually coherent with the current design language.
5. **No Hallucinations on External Data:** We know `goalsvalue.com` has no API. Do not try to implement external API fetching for market values; it is technically impossible right now.
6. **Verify file paths before editing:** This doc has been wrong before about exact filenames/line locations. Always `grep`/search the actual codebase first — do not blindly trust a target path below without confirming it exists.

## 3. Roadmap & Feature Implementation Prompts

The following sections define the exact features to be implemented next. Proceed feature by feature. Do not attempt all at once.

**Status-Übersicht (verifiziert 2026-07-10):**
| # | Feature | Status |
|---|---|---|
| 1 | Fit-Score Transparency | **Teilweise vorhanden** — Top-5-Beitragsstats existieren bereits inline in `squad/page.tsx`, aber kein Popover/Tooltip-UX, kein "schwächstes Attribut" |
| 2 | Manual Override (training_value) | **Fehlt komplett** — echtes Zielfeature |
| 3 | Shareability | **Bereits gebaut** (`ShareCard.tsx`: Canvas-Export, PNG-Download, Clipboard-Copy als Bild) — nur kleine Lücken offen |
| 4 | Meta-Adaptability (Weights) | **Bereits weitgehend gebaut** (`WeightsPanel.tsx` + `weights-store.ts`: Slider für True-Value-Pillars, Rating-Blend, ROI-Toggles) — Fit-Score-Attributgewichte (Pace etc.) bewusst NICHT editierbar, siehe Absatz unten |
| 5 | Market Value FAQ | **Fehlt komplett** — echtes Zielfeature |

---

### Feature 1: Transparency of Fit-Score Calculation (Opening the "Black Box")
**Goal:** Show users exactly *why* a player has a specific Fit-Score.
**Real Target Files:** `src/lib/scoring/position-fit.ts` (contains `topWeightedStats`, already returns top-N contributing stats), `src/app/squad/page.tsx` (inline `DetailsPanel()` function, ~line 136+, already renders a "Top-5 Beitrags-Stats" block using `topWeightedStats`).

**Was schon da ist:** `topWeightedStats(player, position, n, slotX)` liefert bereits `{stat, value, weight, contribution}[]` sortiert absteigend, genutzt für die Top-5-Anzeige in `squad/page.tsx`.

**Was wirklich fehlt (Instructions for Agent):**
1. Erweitere `topWeightedStats` (oder ergänze eine neue Funktion) so, dass zusätzlich das **schwächste beitragende Attribut** zurückgegeben wird (niedrigste `contribution` unter den Attributen mit `weight > 0`), nicht nur die Top-N.
2. Ergänze in der bestehenden Top-5-Anzeige in `squad/page.tsx` einen sichtbaren Hinweis auf das schwächste Attribut (z.B. rot markiert, "Bremst den Score:").
3. Wandle die aktuell "always visible" Stat-Liste in ein echtes Hover-Tooltip oder Klick-Popover um (nutze das existierende `src/components/ui/StatTooltip.tsx` als Vorlage/Basis, falls es dafür geeignet ist — sonst neue kleine Popover-Komponente nach bestehendem Tailwind-Muster bauen).
4. Update/ergänze Unit-Tests in `src/lib/scoring/position-fit.test.ts` für die neue "schwächstes Attribut"-Logik.
5. Lauf `npx vitest run` und bestätige alle Tests grün.

---

### Feature 2: Manual Override for Missing API Data (training_value Bug)
**Goal:** Allow users to manually input `training_value` when the GOALS API fails to provide it (currently causing `confidence` 0.5/'partial' in `true-value.ts`, displayed with note "(MISSING → neutral 4/8)" in `src/app/development/page.tsx`).
**Real Target Files:** `src/app/development/page.tsx` (zeigt aktuell die "training_value MISSING" Zeile, ca. Zeile 363), `src/lib/analysis/true-value.ts`, `src/lib/analysis/true-value.test.ts`, `src/lib/store/squad-store.ts` (State-Erweiterung) oder ein neuer kleiner Store `src/lib/store/overrides-store.ts`.

**Status:** Komplett offen — kein `manualOverride`-Mechanismus im Code vorhanden.

**Instructions for Agent:**
1. Verifiziere zuerst live in `src/lib/analysis/true-value.ts`, wie `confidence`/`basis`/`missing` genau berechnet werden (Stand: `missing.length===0` → confidence 1.0/'full'; sonst mit `hasAging||hasAge` → 0.5/'partial'; sonst 0.25/'thin'). Baue darauf auf, ändere die bestehende Logik nicht ohne Grund.
2. In der UI, wo `training_value` als fehlend markiert ist (`src/app/development/page.tsx`, die Zeile mit `note: '(MISSING → neutral 4/8)'`), füge ein 'Edit'-Icon (Pencil, z.B. aus `lucide-react` falls bereits Dependency — prüfen) hinzu.
3. Klick verwandelt die Anzeige in ein einfaches Zahlen-Input-Feld (Range 1-8, siehe Kommentar `training_value/8` im Code).
4. Beim Speichern (z.B. Enter-Taste) den `manualOverride`-Wert im State ablegen — pro Spieler, z.B. `manualOverrides: Record<playerId, number>` in einem neuen kleinen Zustand-Store (persist via localStorage wie die anderen Stores).
5. Die App muss sofort neu rendern und `trueValue()` mit dem manuellen Wert neu berechnen. `confidence` für diese spezifische Berechnung soll auf `1.0`/'full' springen, wenn der Override die einzige fehlende Info war.
6. Stelle sicher, dass der globale State sauber bleibt (kein Aufblähen bei jedem Re-Import — Override sollte an der `playerId` hängen, nicht am Objekt-Index).
7. Schreibe 2-3 neue Unit-Tests in `true-value.test.ts`, die die Override-Logik simulieren und verifizieren.
8. Lauf `npx vitest run` und bestätige alle Tests grün (aktuelle Baseline: 394 Tests — melde die neue Zahl).

---

### Feature 3: Shareability (Export Optimized Lineup)
**Goal:** Allow users to easily share their optimized squad on Discord/Twitter.
**Real Target File:** `src/components/lineup/ShareCard.tsx` (395 Zeilen) — **bereits fertig gebaut**: Canvas-Rendering des Pitch (1200×630px), PNG-Download-Button, Clipboard-Copy-Button (kopiert das gerenderte Bild via `navigator.clipboard.write` mit `ClipboardItem`), Wasserzeichen/Branding vermutlich schon integriert (verifiziere `drawPitch()`/Rest der Datei).

**Status:** Kernfeature bereits vorhanden, inkl. des im alten Draft als "Optional Enhancement" markierten Screenshot-Downloads.

**Instructions for Agent (nur falls Lücken bestätigt werden):**
1. Lies die komplette Datei `ShareCard.tsx` (aktuell nur teilweise gelesen: Zeilen 1-60 Drawing-Helpers, 246-391 Copy/Download-Handler) um zu bestätigen, ob ein Text-Export-Format (die Emoji-Textblock-Variante aus dem ursprünglichen Plan: "🏆 My Optimized GOALS Squad...") zusätzlich zum Bild-Export existiert.
2. Falls NICHT vorhanden: Ergänze einen zusätzlichen "Text kopieren"-Button neben dem bestehenden Bild-Copy/Download, der den Startaufstellung als Text formatiert und via `navigator.clipboard.writeText()` kopiert. Format:
   ```
   🏆 My Optimized GOALS Squad
   ST: [Player Name] (OVR: 85, Fit: 90)
   CM: [Player Name] (OVR: 82, Fit: 88)
   ...
   Generated with goals.ivo-tech.com
   ```
3. Falls bereits vorhanden: Feature 3 gilt als erledigt, keine weitere Arbeit nötig — kurz bestätigen und weiter zu Feature 4/5.
4. Bei Änderungen: `npx vitest run` grün halten.

---

### Feature 4: Meta-Adaptability (Custom Attribute Weighting)
**Goal:** Allow advanced users to tweak stat weights to react to game patches before code updates.
**Real Target Files:** `src/lib/store/weights-store.ts`, `src/components/development/WeightsPanel.tsx` (222 Zeilen) — **bereits weitgehend gebaut**: Slider für True-Value-Pillar-Blend (current/ceiling/headroom/lifecycle, auto-normalisiert auf Σ=1), Rating-Blend (OVR-Anteil/Fit-Anteil), ROI-Toggles (tierCrossOnly, ignoreLateAge), Reset-Button, "angepasst"-Badge.

**Status:** Bewusste Architektur-Entscheidung im Code (Kommentar Zeile 122-126 in `WeightsPanel.tsx`): Positions-Fit, Positions-Penalty und Rarity-Tiers sind als "GOALS-Spielmechanik" gesperrt und NICHT editierbar — nur "Opinion"-Gewichte (True-Value-Pillars, Rating-Blend, ROI-Regeln) sind einstellbar. Das widerspricht der ursprünglichen Doc-Idee "Pace Importance Slider" (Pace ist ein Fit-Score-Attributgewicht, also Game-Truth).

**Instructions for Agent:**
1. **Vor jeder Änderung mit Ivo klären, ob die Architektur-Guardrail (Fit-Score-Attributgewichte bleiben gesperrt) explizit aufgehoben werden soll.** Falls nein: Feature 4 gilt bereits als erledigt im Sinne der Kernidee (Meta-Tuning existiert, nur eben nur für "Opinion"-Werte) — keine weitere Arbeit nötig.
2. Falls Ivo tatsächlich editierbare Fit-Score-Attributgewichte (Pace, Shooting etc.) will: Das wäre ein bewusster Bruch der bestehenden Guardrail (`🔒 Positions-Fit ... nicht editierbar (würde das Spiel "erfinden")`) — sauber als eigenes, explizit gewolltes Feature behandeln, nicht stillschweigend in `WeightsPanel.tsx` einbauen.
3. Bei jeder Änderung: Memoization/Performance prüfen (Recalc der gesamten Squad darf nicht laggen) und bestehende Tests (`npx vitest run`) grün halten.

---

### Feature 5: Market Value Communication & FAQ
**Goal:** Manage user expectations regarding missing market values (due to lack of third-party APIs).
**Real Target Files:** `src/app/layout.tsx` (globales Layout) oder `src/components/layout/DisclaimerBanner.tsx` (bestehender Disclaimer-Banner-Pattern, 9 Zeilen, sticky Banner-Komponente — guter Referenzpunkt für Styling) oder `src/app/page.tsx` / `src/components/layout/Sidebar.tsx`.

**Status:** Komplett offen — keine FAQ/Info-Komponente zu Marktwerten im Code gefunden.

**Instructions for Agent:**
1. Prüfe zuerst, ob es bereits eine Footer-Komponente gibt (aktuell nicht gefunden) — falls nicht, kleine neue `Footer.tsx` oder Erweiterung von `Sidebar.tsx`/`layout.tsx` anlegen.
2. Erstelle eine kompakte FAQ-Komponente oder Info-Tooltip (folge dem Styling-Muster von `DisclaimerBanner.tsx`: `bg-slate-900/95`, `border-amber-900/40` o.ä., aber weniger aufdringlich — kein sticky Banner, eher ein Icon mit Popover).
3. Nutze diesen Text: "Warum sehe ich keine Marktwerte? Aktuell gibt es leider keine öffentliche Preis-API (weder von GOALS noch von Drittanbietern wie goalsvalue). Sobald sich das ändert, binden wir die Live-Preise sofort für euch ein!"
4. Integriere sauber ins bestehende Dark-Theme (Tailwind, `slate-*`/`emerald-*`/`amber-*` Farbpalette wie im Rest des Codes).
5. Nutze ein Standard-Info/Help-Icon (prüfe zuerst, ob `lucide-react` bereits als Dependency installiert ist, bevor eine neue Icon-Library eingeführt wird).
6. `npx vitest run` grün halten (neue Komponente sollte, falls sinnvoll testbar, einen einfachen Render-Test bekommen).
