# Full Audit & SOTA Roadmap — GOALS Squad Optimizer

Stand: 2026-07-07
Repo: `/home/ivo/projects/goals-optimizer`
Live: `https://goals.ivo-tech.com`
Basis: `main` / `1c58512 test: add E2E + DOM + 360° test suite (325 tests total)`

---

## 1. Executive Summary

Der GOALS Squad Optimizer ist nach dem letzten Refactor technisch in einem deutlich besseren Zustand als der externe Audit `Audit_Goals_SquadOptimizer.md` annimmt. Die Kernarchitektur ist stabil: Import läuft serverseitig über `/api/import`, Spieler werden mit Fit-Scores angereichert, Formationen sind auf die 15 echten GOALS-Formationen korrigiert, UI und Tests sind sauber, und die Live-Version funktioniert mit dem echten Club `txr'`.

Die wichtigsten Fortschritte gegenüber dem externen Audit:

- `age`, `xp_current`, `aging` und Development-Daten sind im Player-Modell bereits vorhanden.
- `/development` konsumiert `aging`, Alter, Potential-Range und Turnierwert bereits produktiv.
- 15 GOALS-Formationen sind live verifiziert, inklusive `3-4-3`/`3-5-2` mit `WM` statt `WB` und `4-2-3-1` mit 3x `AM`.
- 325 Tests laufen grün.
- Live-Import mit `txr'` funktioniert.
- Profil-Links zeigen echte PlayGOALS-UUIDs.
- Normale UI zeigt keine Datenquellen-Namen; technische Quellen bleiben unter `/debug` bzw. in Diagnostics.

Trotzdem gibt es relevante offene Punkte. Der wichtigste P0/P1-Bereich ist nicht mehr „Felder fehlen komplett“, sondern: Die echten Live-Daten sind unvollständig bzw. fallen wegen Goals-Tracker 403 auf Fallbacks zurück. Beim Live-Import `txr'` kamen 53 Spieler an, aber nur 18 Full-Spieler haben `age`/`aging`; `training_value` kam bei 0/53 Spielern an. Außerdem stammen live alle `roleRatings` aus Goalsverse, weil Goals-Tracker von Vercel/Live aus HTTP 403 liefert. Damit ist das Single-Ratings-/Role-Ratings-Schema zwar technisch konsumiert, aber live nicht authoritativ genug für alle Spieler.

---

## 2. Verifikationsprotokoll

### 2.1 Lokale Checks

Ausgeführt:

```text
npm run test && npm run lint && npm run build
```

Ergebnis:

```text
Test Files  25 passed (25)
Tests       325 passed (325)
Lint        No ESLint warnings or errors
Build       Compiled successfully
Static      14 static pages generated
Dynamic     /api/import server-rendered on demand
```

Build-Routen laut Next.js:

- `/`
- `/debug`
- `/development`
- `/lineup`
- `/lineup/alternatives`
- `/matchup`
- `/meta`
- `/squad`
- `/api/import`
- `/api/meta`

### 2.2 Live-Smoke

Live geprüft:

- `https://goals.ivo-tech.com/`
- `https://goals.ivo-tech.com/squad`
- `https://goals.ivo-tech.com/lineup`

Wichtig: Die Live-Domain läuft ohne `/goals`-Basepath. `https://goals.ivo-tech.com/goals` liefert 404 und darf nicht als Live-URL verwendet werden.

### 2.3 Echter Club-Import

Live-Import:

```json
{"clubName":"txr'"}
```

Ergebnis:

```text
success: true
count: 53
clubName: txr'
```

Diagnostics:

```json
{
  "full": 18,
  "basic": 35,
  "warnings": 143,
  "positionSources": {
    "playgoals": 37,
    "goalsverse": 16
  },
  "roleRatingSources": {
    "goalsverse": 53
  }
}
```

Live-Feldabdeckung:

```text
with_age:        18 / 53
with_aging:      18 / 53
with_xp_current: 13 / 53
with_training_value: 0 / 53
```

Interpretation:

- Full-Squad-Spieler aus Goalsverse liefern Alter, Aging und teilweise XP.
- Basic-Spieler aus Profil-/Club-Array liefern diese Daten nicht.
- `training_value` ist im Modell vorhanden, kommt live bei `txr'` aktuell aber nicht an.
- Goals-Tracker fällt live mit HTTP 403 aus; PlayGOALS übernimmt Primary Position, aber nicht roleRatings.

---

## 3. Abgleich mit externem Audit `Audit_Goals_SquadOptimizer.md`

### 3.1 Externe P0-These: „Datenmodell fehlt für Development / True Value“

Status: teilweise überholt, teilweise noch offen.

Bereits vorhanden in `src/lib/scraper/types.ts`:

- `age?: number`
- `training_value?: number`
- `xp_current?: number`
- `xp_next_upgrade?: number`
- `upgrade_count?: number`
- `aging?: PlayerAging`

`PlayerAging` enthält:

- `currentAge`
- `targetRating`
- `upgradesRemaining`
- `potentialRange`

Mapping in `src/lib/scraper/goalsverse-client.ts`:

- `raw.current_age` → `age` / `aging.currentAge`
- `raw.max_potential_rating` → `aging.targetRating`
- `raw.upgrades_remaining` → `aging.upgradesRemaining`
- `raw.current_xp` → `xp_current`
- `raw.potential.training_value` → `training_value`

Aber live:

- `training_value` ist bei `txr'` 0/53 vorhanden.
- `xp_next_upgrade` und `upgrade_count` sind im Type vorhanden, werden aber im aktuellen Mapping nicht sichtbar befüllt.
- Basic-Spieler bleiben OVR-/Position-only.

Bewertung: Der externe Audit ist als Code-Kritik veraltet, als Datenqualitäts-Kritik aber weiterhin relevant.

Empfehlung:

- P1: Import-Diagnose erweitern: Anzahl `age`, `aging`, `xp_current`, `training_value` in Diagnostics aufnehmen.
- P1: Ziele für `training_value`, `xp_next_upgrade`, `upgrade_count` gegen echte Goalsverse-Payloads erneut validieren.
- P2: `/debug` um eine Datenfeld-Abdeckung pro Kader erweitern.

### 3.2 Frage aus Audit: „Wird das Single-Ratings-Schema konsumiert?“

Kurzantwort: Ja, technisch; live aber mit Fallback-Einschränkung.

Technischer Konsum:

- `goalsverse-client.ts` aggregiert `ovr_roles` zu `roleRatings`.
- `bestPositionFromRatings()` bestimmt Primary Position anhand `roleRatings`, top-level role, Stat-Tie-Break und Fallback.
- `secondaryPositions` werden aus Role-Ratings mit Threshold `equippedOverall - SECONDARY_OVR_THRESHOLD` abgeleitet.
- `position-fit.ts` berechnet `fit_scores` für alle GOALS-Positionen.
- `formation-optimizer.ts` nutzt `fit_scores`, `positionType`, `calcPositionFitScore()` und Hungarian Solver.
- `development-advisor.ts` nutzt `fit_scores` für `bestRole` und Entwicklungslabel.

Live-Einschränkung:

- `roleRatingSources` für `txr'` live: `goalsverse: 53`.
- Goals-Tracker als authoritativer Pitch-Ratings-Layer fällt live mit HTTP 403 aus.
- PlayGOALS-Fallback liefert Primary Position, aber nicht authoritativen Role-Ratings-Pitch.

Bewertung:

- Das Schema wird konsumiert.
- Die Qualität hängt live stark an Goalsverse-RoleRatings.
- Für exakte GOALS-Pitch-Ratings bleibt Goals-Tracker/PlayGOALS-Datenzugriff das größte Datenrisiko.

Empfehlung:

- P1: `roleRatingsSource` in `/debug` und Import-Diagnostics stärker hervorheben.
- P1: Optionalen lokalen/Backend-Cache für Tracker-Pitch-Ratings prüfen, um Vercel-403 zu umgehen.
- P2: Wenn PlayGOALS öffentliche Pitch-Ratings hergibt, Parser erweitern; aktuell nur Position-Fallback.

### 3.3 Externe UI-Kritik: Datenquellen in normaler UI

Status: weitgehend erledigt.

Live geprüft:

- Normale Squad-/Lineup-UI zeigt keine Begriffe wie `goalsverse`, `goals-tracker`, `source`, `fallback`, `tracker`.
- Ausnahme ist der gewünschte neutrale Button `Spieler öffnen` auf der Kaderseite.
- Linkziel nutzt PlayGOALS-UUIDs, z.B. `https://playgoals.com/en/player/<uuid>`.

Bewertung: Erledigt. Technische Quellen gehören weiter nur nach `/debug` und API-Diagnostics.

---

## 4. Technischer Audit nach Modul

### 4.1 Import/API

Datei: `src/app/api/import/route.ts`

Stärken:

- Serverseitiger Import; Client ruft nicht direkt Goalsverse.
- Validierung für leere, zu kurze, zu lange oder ungültige Clubnamen.
- Strukturierte Error-Codes (`club_not_found`, `goalsverse_timeout`, `rsc_payload_incomplete`, `no_players_found`, `network_error`, `invalid_club_name`).
- Demo-Pfad setzt `dataQuality: 'full'` und `positionSource: 'heuristic'`.
- API-Response nutzt `ApiResponse`-Shape.
- Import-Diagnostics zählen Full/Basic/Warnungen/PositionSources/RoleRatingSources.

Risiken:

- Diagnostics zählen noch nicht Feldabdeckung für `age`, `aging`, `xp_current`, `training_value`.
- `summarizeImport` ist für Nutzerqualität wertvoll, wird aber in normaler UI nur reduziert sichtbar.
- Keine API-Ratelimit-/Abuse-Schutzschicht erkennbar.

Empfehlung:

- P1: Diagnostics um Feldabdeckung erweitern.
- P2: Import-Timeouts und Rate-Limits pro IP/Session prüfen, falls Traffic steigt.

### 4.2 Scraper/Enrichment

Dateien:

- `src/lib/scraper/goalsverse-client.ts`
- `src/lib/scraper/goals-tracker-client.ts`
- `src/lib/scraper/playgoals-client.ts`

Stärken:

- Richtige Server-only-Architektur.
- Goalsverse RSC-Pipeline ist robust dokumentiert.
- PlayGOALS-Fallback fängt Live-Tracker-403 für Primary Position ab.
- `sourceWarnings`, `positionSource`, `roleRatingsSource` machen Datenqualität transparent.
- `hasFullStats()` trennt Full- und Basic-Spieler.

Risiken:

- Live `txr'`: 143 Source-Warnings bei 53 Spielern.
- Live alle roleRatings aus Goalsverse, keine Tracker-Pitch-Ratings.
- Basic-Spieler haben keine echten Individualstats und keine authoritativen Secondary Ratings.
- `training_value` wird gemappt, kommt aber live nicht an.

Empfehlung:

- P1: Tracker-Failure-Rate sichtbar in `/debug` und Import-Status machen.
- P1: Cache/Proxy-Strategie gegen HTTP 403 evaluieren.
- P1: Payload-Audit für `training_value`/XP-Felder mit gespeicherter Fixture.

### 4.3 Store/Zustand

Dateien:

- `src/lib/store/squad-store.ts`
- `src/lib/store/lineup-store.ts`
- `src/lib/store/development-store.ts`
- `src/lib/store/tactics-store.ts`

Stärken:

- Persistenz via Zustand.
- Cross-club orphaned lineup assignments wurden bereits adressiert.
- `isValidPlayer`-Guard existiert gegen stale LocalStorage.
- Lineup-Store hat atomisches `setFormationWithLineup`.

Risiken:

- LocalStorage bleibt langfristig Migrationsrisiko, da Player-Shape sich schnell entwickelt.
- Development-Store enthält weiterhin manuelle Trackingdaten (`minutesPlayed`, `xpEstimate`), während echte Importdaten teilweise vorhanden sind. Das ist UX-seitig noch nicht klar getrennt.

Empfehlung:

- P1: Store-Versionierung/Migrationsnotizen in `/debug` anzeigen.
- P2: Development-UI klar zwischen „importiert“, „geschätzt“ und „manuell“ unterscheiden.

### 4.4 Formation/Optimizer

Dateien:

- `src/config/formations.json`
- `src/lib/optimizer/formation-optimizer.ts`
- `src/lib/optimizer/hungarian-solver.ts`
- `src/lib/scoring/position-fit.ts`
- `src/lib/tactics/tactics-settings.ts`

Stärken:

- 15 echte GOALS-Formationen live verifiziert.
- Hungarian Solver mit Greedy-Fallback.
- Optimizer nutzt slot-spezifische Fit-Scores und PositionType-Bonus.
- Varianten für offensiv/defensiv/gegenMeta vorhanden.
- Tests decken Formationen und Tactics ab.

Risiken:

- Optimizer-Qualität hängt direkt an `roleRatingsSource` und Stat-Qualität.
- Basic-Spieler werden mit `fit_scores` ohne echte Individualstats bewertet.
- `FormationRecommendation.squadMatch` ist faktisch `averageFit` clamped; als Prozentwert gut lesbar, aber nicht kalibriert gegen echte Winrate.

Empfehlung:

- P1: Empfehlungen bei hoher Basic-/Fallback-Quote mit Confidence-Hinweis versehen.
- P2: Optimizer-Score in `/debug` erklärbar machen: Stat-Fit, Primary/Secondary-Bonus, RoleBias.

### 4.5 Development

Dateien:

- `src/app/development/page.tsx`
- `src/lib/analysis/development-advisor.ts`
- `src/lib/store/development-store.ts`

Stärken:

- Development Advisor existiert und ist getestet.
- Labels: `Starter`, `Trainieren`, `Turnier-Spezialist`, `Rotation`, `Ersetzen`.
- `age` fließt in Youth-Bonus und Label ein.
- `aging` wird in Potential-Bar angezeigt.
- Turnierwert ist integriert.
- Basic-Daten erzeugen Warnung.

Risiken:

- `training_value` kommt live nicht an; Upgrade-ROI ist daher noch nicht echt datengetrieben.
- `XP grob` nutzt Store-Schätzung (`tracked?.xpEstimate`) statt importiertem `xp_current`.
- Manuelle Upgrade-Historie und echte XP/Aging-Daten sind noch nicht zu einer klaren Upgrade-ROI-Entscheidung verbunden.

Empfehlung:

- P1: `/development` um importierte XP/Aging-Daten sichtbar erweitern: `xp_current`, `training_value` falls vorhanden, Datenstatus.
- P1: Upgrade-ROI-Engine bauen, aber nur auf verifizierter Feldabdeckung.
- P2: Prioritätslogik mit `training_value` nachziehen, sobald Datenquelle stabil ist.

### 4.6 Meta

Datei: `src/app/meta/page.tsx`

Stärken:

- Top-3 Best-Elf-Karten sind klar und nutzbar.
- `recommendFormations(players)` wird direkt konsumiert.
- Apply nutzt `setFormationWithLineup` atomar.
- PositionType-Badges (`Neben`, `Fremd`) zeigen Risiken.
- Produkttexte sind deutsch und ohne Source-Begriffe.

Risiken:

- Live-Meta aus `/api/meta` kann gegenüber den korrigierten 15 Formationen divergieren; im alten E2E-Report standen noch 13 Formationen.
- Formation-Namen `4-3-3 Attack`/`4-3-3 Defense` könnten UI-seitig noch stärker an GOALS-Screenshot-Namen `4-3-3-ATK`/`4-3-3-DEF` angepasst werden.

Empfehlung:

- P1: `/api/meta` gegen aktuelle 15 Formationen erneut prüfen und ggf. Bericht/Tests aktualisieren.
- P2: UI-Display-Namen für ATK/DEF angleichen, Legacy-Key-Migration beibehalten.

### 4.7 Matchup

Dateien:

- `src/app/matchup/page.tsx`
- `src/lib/analysis/matchup-analysis.ts`
- `src/components/matchup/MatchupAnalysis.tsx`
- `src/components/matchup/MatchupCanvas.tsx`

Stärken:

- Gegneranalyse läuft über `/api/import`, nicht direkt über Scraper im Browser.
- Wenn eine eigene Lineup-Aufstellung existiert, nutzt Matchup diese statt des ganzen Kaders.
- Analyse-Regeln sind stat-basiert und getestet.
- Produkttexte sind weitgehend klar und quellenfrei.

Risiken:

- Bei Basic-Gegnerdaten sind viele Stat-Regeln nicht aussagekräftig.
- Keine sichtbare Confidence-/Datenqualitätsanzeige im Matchup-Flow.
- Gegner-Import kann wegen Tracker-Fallbacks dasselbe RoleRatings-Problem haben.

Empfehlung:

- P1: Matchup-Resultate mit Datenqualität markieren: „Analyse eingeschränkt, weil nur Basisdaten für X Spieler“.
- P2: Gegnervergleich nach Linien stärker erklären: Angriff/Mittelfeld/Abwehr/GK.

### 4.8 Debug

Datei: `src/app/debug/page.tsx`

Stärken:

- Debug Canvas trennt technische Datenquellen von normaler UI.
- Import-Snapshot kann lokale Datenqualität sichtbar machen.
- Gute Grundlage für Diagnostik.

Risiken:

- Debug-Seite muss aktiv gegen Code-Drift gepflegt werden.
- Neue Felder (`training_value`, `xp_current`, RoleRatings-Fallback) sollten dort sichtbarer werden.

Empfehlung:

- P1: Datenfeld-Abdeckung für importierten Kader ergänzen.
- P1: RoleRatingsSource/PositionSource als Ampel anzeigen.
- P2: Formation-Slot-Referenz mit den 15 screenshot-verifizierten Formationen anzeigen.

---

## 5. Findings nach Severity

### P0 — aktuell keine Produktionsblocker gefunden

Es gibt keinen reproduzierten Crash, keine kaputte Live-Route und keine fehlgeschlagenen Checks. Import, Squad, Lineup, Auto-Fill und Spielerlinks funktionieren live.

### P1 — wichtig

#### P1.1 Live-Datenqualität: Goals-Tracker HTTP 403 / RoleRatings-Fallback

Befund:

- Live `txr'`: `roleRatingSources.goalsverse = 53`.
- `positionSources.playgoals = 37`, `goalsverse = 16`.
- 143 Warnings.

Risiko:

- Optimizer und Development nutzen RoleRatings/Fit-Scores, aber diese sind live nicht authoritativ genug, wenn Tracker-Pitch nicht erreichbar ist.

Konkreter Plan:

1. In `/debug` prominent anzeigen: RoleRatingsSource-Verteilung, Warnings, Tracker-Failure-Rate.
2. Optionalen Cache/Fixture-Layer für bekannte Spieler prüfen.
3. PlayGOALS auf weitere Ratings-Felder auditieren.
4. Wenn keine authoritativen Ratings verfügbar: UI-Confidence-Hinweis für Empfehlungen.

#### P1.2 `training_value` / Upgrade-ROI nicht live nutzbar

Befund:

- Type und Mapping existieren.
- Live `txr'`: `training_value` 0/53.

Risiko:

- Upgrade-ROI kann ohne belastbare Training-Value-Daten nur simuliert/heuristisch sein.

Konkreter Plan:

1. Goalsverse-Payload für Full-Spieler speichern und Feldnamen prüfen.
2. Falls `training_value` verschoben/umbenannt wurde: Mapping korrigieren.
3. Diagnostics um Feldabdeckung erweitern.
4. Erst danach Upgrade-ROI-Engine finalisieren.

#### P1.3 Development-UI mischt echte und manuelle/geschätzte Daten

Befund:

- `aging` wird echt angezeigt.
- `XP grob` stammt aus Development-Store-Schätzung.
- `xp_current` aus Import wird nicht prominent angezeigt.

Risiko:

- Nutzer kann nicht erkennen, welche Entwicklungsempfehlung datenbasiert vs. geschätzt ist.

Konkreter Plan:

1. „Importiert“ vs. „Geschätzt“ visuell trennen.
2. `xp_current` anzeigen, wenn vorhanden.
3. `training_value` nur anzeigen, wenn wirklich vorhanden.
4. Basic-Spieler klar als eingeschränkt markieren.

#### P1.4 `/api/meta` und ältere Reports können Formation-Drift enthalten

Befund:

- Aktuelle App hat 15 Formationen.
- `docs/test-report-e2e.md` dokumentiert noch `/api/meta` mit 13 Formationen.

Risiko:

- Doku/Meta kann veraltet wirken.

Konkreter Plan:

1. `/api/meta` gegen aktuelle Formationliste prüfen.
2. Falls nötig API/Tests/Doku aktualisieren.
3. Test ergänzen: Meta-Formation-Keys müssen mit `formations.json` kompatibel sein oder bewusst abweichen.

### P2 — Verbesserungen

#### P2.1 UI-Namen für ATK/DEF angleichen

Aktuell sichtbar: `4-3-3 Attack`, `4-3-3 Defense`.

GOALS-Screenshot/UI-Wunsch: `4-3-3-ATK`, `4-3-3-DEF`.

Plan:

- Display-Name ändern.
- Legacy-Migration im Store beibehalten.
- Tests für alte gespeicherte Namen behalten.

#### P2.2 Confidence-Hinweise für Optimizer/Matchup

Wenn viele Spieler Basic sind oder RoleRatings aus Fallback kommen, sollten Empfehlungen sichtbar als eingeschränkt markiert werden.

#### P2.3 Debug-Formation-Referenz

Unter `/debug` eine Tabelle:

```text
Formation | Slots
3-4-3     | GK CB CB CB WM CM CM WM WF ST WF
4-2-3-1   | GK FB CB CB FB DM DM AM AM AM ST
...
```

#### P2.4 Produkttext-Polish

Einzelne Kurzlabels in Meta können noch natürlicher werden, z.B. `Außenverteidi.` → `Außenverteidiger` wenn Platz reicht.

---

## 6. Refactoring-/Implementierungsplan

### Sprint A — Datenqualität & Diagnostics (P1)

Ziel: Empfehlungsgüte sichtbar machen, ohne Scoring neu zu bauen.

Dateien:

- `src/app/api/import/route.ts`
- `src/app/debug/page.tsx`
- `src/lib/api-types.ts`
- Tests: `src/lib/api-types.test.ts` oder neue Import-Diagnostics-Tests

Tasks:

1. `summarizeImport()` erweitern:
   - `withAge`
   - `withAging`
   - `withXpCurrent`
   - `withTrainingValue`
   - `withFullStats`
2. API-Response-Typ erweitern.
3. `/debug` Snapshot um Feldabdeckung ergänzen.
4. Produkt-UI bleibt quellenfrei; nur `/debug` zeigt Quellen.
5. Tests/Lint/Build.

Akzeptanz:

- Live Import `txr'` zeigt nachvollziehbar, warum Development/Optimizer nur begrenzt sicher ist.
- Keine Datenquellen-Namen in normaler UI.

### Sprint B — Training/XP Payload Audit (P1)

Ziel: klären, ob `training_value`, `xp_next_upgrade`, `upgrade_count` wirklich verfügbar sind.

Dateien:

- `src/lib/scraper/goalsverse-client.ts`
- `src/lib/scraper/import-mapping.test.ts`
- ggf. neue Fixture unter `src/lib/scraper/__fixtures__/`

Tasks:

1. Echten Goalsverse-Full-Spieler-Payload speichern/anonymisieren.
2. Feldnamen für Potential/Training/XP prüfen.
3. Mapping korrigieren oder bewusst dokumentieren, falls Feld nicht geliefert wird.
4. Tests für mindestens einen Spieler mit Aging/XP-Feldern.

Akzeptanz:

- Entweder `training_value` kommt live an, oder Bericht/Debug sagt explizit „Quelle liefert derzeit kein training_value“.

### Sprint C — Development-UX Klarheit (P1)

Ziel: `/development` soll echte vs. geschätzte Werte sauber unterscheiden.

Dateien:

- `src/app/development/page.tsx`
- `src/lib/analysis/development-advisor.ts`
- `src/lib/analysis/development-advisor.test.ts`

Tasks:

1. `xp_current` anzeigen, wenn importiert.
2. `XP grob` als manuell/geschätzt labeln oder nachrangig machen.
3. `training_value` nur bei vorhandenem Wert anzeigen.
4. Advice-Warnings erweitern, wenn Development-Daten fehlen.
5. Tests für Full/Basic/fehlende Aging-Daten.

Akzeptanz:

- Nutzer sieht klar, ob Empfehlung auf echten Aging-Daten basiert.

### Sprint D — RoleRatings Confidence (P1/P2)

Ziel: Optimizer/Matchup-Empfehlungen nicht überverkaufen, wenn RoleRatings nur Fallback sind.

Dateien:

- `src/lib/optimizer/formation-optimizer.ts`
- `src/app/meta/page.tsx`
- `src/components/lineup/TournamentReadinessCard.tsx`
- `src/components/matchup/MatchupAnalysis.tsx`

Tasks:

1. Confidence-Helper bauen: Full/Basic/roleRatingsSource-Verteilung.
2. In Meta/Lineup/Matchup dezente Warnung anzeigen, ohne Source-Namen in normaler UI.
3. Debug zeigt technische Details.

Akzeptanz:

- Normale UI sagt z.B. „Empfehlung eingeschränkt: Für einige Spieler liegen nur Basisdaten vor.“
- `/debug` zeigt konkrete Quellen.

### Sprint E — Display-Namen & Formation-Doku (P2)

Ziel: GOALS-Namen und Formation-Referenz polieren.

Dateien:

- `src/config/formations.json`
- `src/lib/store/squad-store.ts` bzw. bestehende Migrationen
- `src/app/debug/page.tsx`
- `src/lib/tactics/tactics-settings.test.ts`

Tasks:

1. UI-Display `4-3-3-ATK` / `4-3-3-DEF` prüfen/ändern.
2. Legacy-Namen weiter akzeptieren.
3. `/debug` Formation-Slot-Tabelle ergänzen.
4. Tests ergänzen.

---

## 7. Feature-Roadmap Richtung SOTA

### Kurzfristig

1. Datenqualitäts-Ampel pro Import.
2. Development-Ansicht mit echten XP/Aging-Werten.
3. Debug-Feldabdeckung.
4. Confidence-Hinweise für Empfehlungen.

### Mittelfristig

1. Upgrade-ROI-Engine, wenn `training_value`/XP verifiziert ist.
2. Matchup-Analyse mit Formation-vs-Formation und Linienvorteilen.
3. Turnier-Lineups mit Erklärung: warum dieser Spieler trotz niedriger OVR passt.
4. Export/Share für Best XI und Tournament XI.

### Langfristig

1. Historischer Kader-Snapshot: Entwicklung über Zeit.
2. Gegnerdatenbank / letzte Gegner speichern.
3. Manuelle Overrides für bekannte Datenquellen-Divergenzen.
4. Offline/Cache-Modus für Tracker-/PlayGOALS-Daten.

---

## 8. Compliance-Checkliste

- [x] Kein EA/FIFA-Framing in Produkttexten.
- [x] Disclaimer vorhanden.
- [x] Normale UI versteckt technische Datenquellen.
- [x] Spielerprofil-Link neutral als `Spieler öffnen`.
- [x] Import läuft serverseitig.
- [x] Keine Secrets im geprüften Source-Kontext.
- [x] Tests/Lint/Build grün.
- [x] Live-Import mit echtem Club geprüft.
- [ ] Training-/XP-Feldabdeckung final validiert.
- [ ] RoleRatings-Quelle live authoritativ oder klar als eingeschränkt markiert.

---

## 9. Empfohlene nächste Umsetzung

Der nächste konkrete Sprint sollte nicht ein großer Refactor sein, sondern Sprint A:

**Datenqualität & Diagnostics erweitern**

Warum:

- Er ist klein.
- Er macht die wichtigste Restunsicherheit sichtbar.
- Er verhindert, dass Development/Optimizer mit unvollständigen Daten zu selbstsicher wirken.
- Er bereitet Upgrade-ROI vor, ohne auf falsche Annahmen zu bauen.

Danach folgt Sprint B:

**Training/XP Payload Audit**

Erst wenn `training_value` und XP-Felder verlässlich geklärt sind, lohnt sich die echte Upgrade-ROI-Logik.

---

## 10. Abschlussbewertung

Der aktuelle Stand ist releasefähig und stabil. Die ursprünglichen P0-Bedenken aus dem externen Audit sind nicht mehr als „App ist blind“ korrekt. Die App hat bereits ein echtes Development- und Formation-/Optimizer-Fundament.

Der neue Hauptfokus ist Datenvertrauen:

- Welche Felder kommen live wirklich an?
- Welche Spieler sind Full vs. Basic?
- Welche Ratings sind authoritativ vs. Fallback?
- Wie deutlich kommuniziert die App diese Unsicherheit?

Wenn diese Schicht sauber ist, kann der nächste große Qualitätssprung kommen: echter Upgrade-ROI und bessere taktische Empfehlungen auf Basis belastbarer Daten.
