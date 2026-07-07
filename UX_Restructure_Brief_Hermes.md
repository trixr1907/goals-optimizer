# UX-Restrukturierung — Brief für Hermes

**Kontext:** Der GOALS Squad Optimizer wirkt auf zu vielen Routen mit zu vielen gleichgewichteten
Widget pro Seite „unübersichtlich". Ziel: Oberfläche auf die zwei Kern-Säulen reduzieren
(**Bauen = Entwicklung**, **Spielen = Meta Center + Lineup**), Redundanz entfernen,
pro Seite eine klare Hauptaktion.

---

## 1. Aktueller Stand (Probleme)
- 6 Top-Level-Routen: `/squad`, `/lineup`, `/lineup/alternatives`, `/development`, `/meta`, `/matchup` (+ `/debug`).
- `/lineup/alternatives` ist eine eigene Route, obwohl Alternativen natürlich in den Aufstellungs-Builder gehören.
- `/lineup` zeigt „Formation Optimizer" + „Variante" prominent → verwirrend.
- `/development` ist wertvoll, aber unterschätzt: True-Value / Upgrade-ROI nicht prominent, Training-Value versteckt.
- Meta Center zeigt nur Top-3 / empfohlene Formationen, nicht alle 15 wählbar mit Best-Fit.

## 2. Nützlichkeits-Ranking (für Priorisierung)
1. **Entwicklung** (True-Value, Upgrade-ROI, Training-Value) = einzigartiges SOTA-Asset, MOAT.
2. **Meta Center** = bestes „Wie spiele ich?"-Feature.
3. **Lineup** = Editor (Formation + Drag&Drop), soll Alternativen inline zeigen.
4. **/lineup/alternatives** = REDUNDANT → entfernen.
5. **Gegner-Analyse** = nützlich, aber Dünn-Daten-Hinweis nötig.

## 3. Ziel-IA (weniger Routen)
| Route | Inhalt | Änderung |
|---|---|---|
| **Kader** `/squad` | Spieler, Stats, Filter | unverändert |
| **Entwicklung** `/development` | True-Value, Upgrade-ROI, Cornerstones, Alterung | refactor (§6) |
| **Aufstellung** `/lineup` | EINE Seite: Formation wählen → Drag&Drop → Klick auf Slot = Alternativen inline | `/lineup/alternatives` wird eingeklappt, Route gelöscht |
| **Meta Center** `/meta` | alle 15 Formationen wählbar + Best-Fit-XI + Übernehmen | erweitert (§5) |
| **Gegner** `/matchup` | Gegner-Analyse | unverändert + Dünn-Daten-Hinweis |
| `/debug` | nur Dev | aus Haupt-Nav entfernen |

**Kernregel:** eine primäre Aktion pro Seite, der Rest kollabiert.

---

## 4. Detaillierte Änderungen

### A) Lineup entrümpeln (Priorität 1 — kleiner Aufwand, schnellster Clarity-Gewinn)
- **Route `/lineup/alternatives` LÖSCHEN.** Alternativen werden im `/lineup`-Builder als **Inline-Panel** angezeigt:
  Klick auf einen besetzten Slot → Popover / Seitenpanel mit den besten Alternativen aus dem Kader
  (bereits via `roleRatings` / `fit_scores` berechenbar) + Diff (overall / position / rarity).
- **„Formation Optimizer" + „Variante"** (offensiv / defensiv / gegenMeta): Varianten als **TOGGLE**
  innerhalb des Optimizers, nicht als separates Element. Eine klare Hauptaktion: „Formation optimieren".

### B) Meta Center: alle 15 Formationen wählbar + Best-Fit (Priorität 2)
- **Grid / Kachelleiste aller 15 Formationen** aus `src/config/formations.json` (statt nur Top-3).
- Klick auf eine Formation → zeigt **Best-Fit-XI aus DEM EIGENEN Kader**
  (nutze existierende `fit_scores` / `roleRatings` / `bestPositionFromRatings()`).
  Pro Slot der beste Spieler + Fit-Score (z.B. „83% Match").
- Button **„Übernehmen in Aufstellung"** → ruft `setFormationWithLineup()` auf (existiert schon)
  und navigiert zu `/lineup`.
- Meta Center = **Formation-Explorer**; Lineup = **Editor**. Keine Doppelung.

### C) /development refactor (mehr rausholen — Priorität 3)
Struktur in klare Sub-Views (Tabs oder Sektionen):
- **Eckpfeiler:** junge, hoher True-Value, Training-Value ≥ 6 → „bau hierauf auf".
  Nutze `trueValue()` + `devTag()` aus `src/lib/analysis/true-value.ts`.
- **Entwickeln:** Upgrade-ROI-Badge pro Spieler (`upgradeRoiV1()` aus `src/lib/analysis/upgrade-roi.ts`):
  `INVEST_NOW` (Tier-Cross), `INVEST` (Headroom), `SELL_OR_LEGEND`.
- **Verkaufen / Legend:** ≥34J oder Rentner.
- **Timeline:** Alterungs- / Rente-Verlauf pro Spieler (Dynasty-Gedanke).
- **Training-Value als #1-Kennzahl prominent** (nicht versteckt) — GOALS-definierendes Attribut.
- **Brücke zu Meta:** „Diese 3 deiner Eckpfeiler passen optimal in Formation X"
  (verknüpft Entwicklung + Meta Center).

### D) Gegner /matchup (Priorität 4)
- Dünn-Daten-Hinweis beibehalten/ergänzen: „Analyse eingeschränkt, weil nur Basisdaten für X Spieler".

---

## 5. Vorhandene Bausteine (NICHT neu bauen — wiederverwenden!)
- `src/lib/analysis/true-value.ts` → `trueValue()`, `devTag()`, `confidence`/`basis`/`missing`.
- `src/lib/analysis/upgrade-roi.ts` → `upgradeRoiV1()`, Rarity-Tier-Arbitrage.
- `src/lib/optimizer/formation-optimizer.ts` → `fit_scores`, `calcPositionFitScore()`, Hungarian Solver.
- `src/lib/scoring/position-fit.ts` → `fit_scores` für alle GOALS-Positionen.
- `src/config/formations.json` → 15 Formationen.
- `src/lib/store/lineup-store.ts` → `setFormationWithLineup()` (atomar).
- `bestPositionFromRatings()`, `secondaryPositions`, `roleRatings` → bereits im Player-Modell.

## 6. Akzeptanzkriterien
- `/lineup/alternatives` Route existiert nicht mehr; Alternativen erscheinen **inline** im `/lineup`-Builder.
- Formation-Varianten sind **Toggle** im Optimizer, nicht separates Element.
- Meta Center listet **alle 15 Formationen**; jede wählbar; zeigt Best-Fit-XI aus eigenem Kader;
  „Übernehmen" füllt `/lineup` via `setFormationWithLineup()`.
- `/development` hat klare Sub-Views (Eckpfeiler / Entwickeln / Verkaufen / Timeline) +
  Training-Value prominent + True-Value / Upgrade-ROI sichtbar.
- `/debug` nicht mehr in Haupt-Nav.
- Mobile + Desktop scrollt (Fix aus Commit `3459d98` greift), keine Überlappung von Inhalt hinter Top-/Bottom-Nav.
- `npm test` / `npm run lint` / `npm run build` grün.

## 7. Vorgeschlagene Implementierungs-Reihenfolge
1. **A** — Lineup entrümpeln (Route löschen, Alternativen inline, Varianten als Toggle).
2. **B** — Meta Center: alle 15 Formationen wählbar + Best-Fit-XI + Übernehmen.
3. **C** — /development refactor (Sub-Views + Training-Value prominent).
4. **D** — Matchup Dünn-Daten-Hinweis.

---

**Hinweis:** Dieses Briefing ersetzt keine laufenden Tests. Nach jedem Schritt `npm test && npm run lint && npm run build`
sowie Live-Check auf Mobile + Desktop (Scroll-Fix aus 3459d98 bleibt Voraussetzung).
