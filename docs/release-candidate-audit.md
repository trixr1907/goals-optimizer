# GOALS Optimizer — Release Candidate Audit

**Datum:** 2026-07-04  
**Auditor:** Hermes (lokaler Browser-Audit)  
**Commit:** 0b525e6 (main)  
**Umgebung:** Lokal, `NEXT_PUBLIC_BASE_PATH="" npm run dev -- --port 3012`

---

## Kurzverdikt

Kernfluss funktioniert stabil. Kein P0-Crash. Zwei Code-Quality-Warnings in
der Squad-Seite (React-Hydration / key-prop) sollten vor RC behoben werden.

---

## Test-Verifikation

| Check | Ergebnis |
|---|---|
| `npm run test` | 242/242 grün (17 Test-Suites) |
| `npm run lint` | 0 Errors, 0 Warnings |
| `npm run build` | Exit 0, alle Routen gebaut |

---

## Import — API-Ebene

Alle drei Clubs lokal via `POST /api/import` getestet.

| Club | Count | Zeit | dataQuality | positionSource | sourceWarnings |
|---|---|---|---|---|---|
| `demo` | 15 | ~22 ms | 15× full | fehlt (P2) | 0 |
| `txr'` | 18 | ~800 ms | 18× full | 18× goals-tracker | 0 |
| `xJuiceWrld999-` | 23 | ~4.8 s | 18 full + 5 basic | 23× goals-tracker | 0 |

**Anmerkungen:**
- `txr'` und `xJuiceWrld999-` importieren korrekt mit voller Goals-Tracker-Enrichment.
- `xJuiceWrld999-` braucht ~5 s (23 Spieler, Tracker-Requests). Unter Vercel-Timeout.
- `clubUrl` wird korrekt als `https://goalsverse.com/p/txr` gesetzt.

---

## Import — Browser-UI

| Schritt | Ergebnis |
|---|---|
| `demo` in Textfeld tippen | Kader-importieren-Button wird aktiv |
| Klick auf "Kader importieren" | Import läuft, Redirect auf `/lineup` |
| Nach Import auf `/lineup` | 15 Demo-Spieler in Bank, Auto-Fill funktioniert |

**Anmerkung:** Welcome-Modal erscheint beim ersten Besuch und überdeckt den Content. Nach
"Loslegen"-Klick verschwindet es dauerhaft (localStorage-State korrekt).

---

## Squad — /squad

| Check | Ergebnis |
|---|---|
| 18 Spieler + Kaderanalyse laden | OK |
| Suche / Filter Position / Filter Rarity | OK |
| Kaderanalyse (Stärken/Baustellen/Empfehlungen) | OK, sinnvolle Texte |
| Schlüsselspieler-Block | OK |
| Details-Button expandiert Stats | OK (Row wird inline expandiert) |
| GK-Spieler zeigt Torwart-Stats in Details | OK (div, reflexes, positioning etc.) |
| Chart-Button (📊) | Kein Canvas/SVG-Modal sichtbar — **P1, siehe unten** |
| Link-Button (🔗) | Links vorhanden (goals-tracker.com) |
| Sortierung per Spalten-Header | OK |

---

## Lineup — /lineup

| Check | Ergebnis |
|---|---|
| Formation-Select (14 Formationen) | OK |
| Top-Empfehlungen-Cards (3 Formationen) | OK, zeigen Meta-Score + Spielstil |
| Varianten-Tabs (Ausgewogen/Offensiv/Defensiv/Gegen-Meta) | OK |
| Auto-Fill | OK — 11/11 Slots gefüllt, Bank korrekt |
| Teilen-Button (disabled vor Fill) | OK — enabled nach Auto-Fill |
| Teilen-Modal | OK — Modal öffnet, "Bild herunterladen" + "In Zwischenablage" sichtbar |
| Pitch-Slots (leere DnD-Buttons) | OK — zeigen Position-Labels |
| Spieler-Karten im Pitch (nach Auto-Fill) | OK — Name + Meta-Score + OVR |
| Bank | OK — 7 Spieler korrekt |

---

## Tournament Readiness

| Check | Ergebnis |
|---|---|
| Karte sichtbar nach Auto-Fill | OK |
| Squad OVR berechnet | 76 (korrekt — txr' Startelf OVR ~76) |
| Beginners Cup #5 (OVR Max 69) | ✗ Nicht geeignet — korrekt |
| Challengers Cup #5 (OVR Max 79) | ✓ Geeignet — korrekt |
| Masters Cup #5 (OVR Max 84) | ✓ Geeignet — korrekt |
| Champions Cup #5 (OVR Min 70) | ✓ Geeignet — korrekt |

---

## Tactics Settings — /lineup (TacticsPanel)

| Check | Ergebnis |
|---|---|
| TAKTIK-ANALYSE Section rendert | OK |
| EMPFOHLENE SETTINGS sichtbar | OK |
| DEFENSIVE DEPTH Wert | 40 (korrekt für Profil ohne DM) |
| BUILD UP PLAY | Long (korrekt für schnellen ST/WF) |
| LINEUP-STATUS | 11/11 · Bank: 7 |
| Begründungs-Liste | OK — "Langsame CBs", "Kein DM", "Schneller ST" |
| Filter-Buttons (Alle/Warnung/Angriff) | OK |
| Taktik-Items (7 expandierbare Cards) | OK — Tiefe Linie, Flanken, Absicherung etc. |

---

## Matchup — /matchup

| Check | Ergebnis |
|---|---|
| Eingabefeld + Analysieren-Button | OK |
| Import xJuiceWrld999- | OK (~5 s) |
| Linker Team-Header (txr', Ø Meta 73) | OK |
| Rechter Team-Header (xJuiceWrld999-, Ø Meta 76) | OK |
| Canvas/Pitch mit Spielernamen+Werten | OK — beide Aufstellungen gerendert |
| Verdict (Schwieriges Duell) | OK — 76 vs 82 OVR-Lücke korrekt |
| Kader-Summary (Stärken/Gegner-Stärken) | OK |
| Linienvergleich (GK/CB/FB/WB/DM/CM/AM/WM/WF/CF/ST) | OK |
| Risiken-Section | OK — 4 Risiken (Schnelle Angreifer, Flanke, Zentrum, Kondition) |
| Empfehlungen-Section | OK — 2 konkrete Empfehlungen |

---

## Development — /development

| Check | Ergebnis |
|---|---|
| Summary-Karten (18 Spieler, Sofort spielen, Trainingskandidaten) | OK |
| Suche + Positions-Filter + Prioritäts-Filter | OK |
| GK-Card (Mariadel Paez) zeigt Torwart-Werte | OK — div, reflexes, positioning |
| Feldspieler-Cards zeigen Basis-Werte (Pace/Sho/Pas/Dri/Def/Phy) | OK |
| Status-Dropdown (Spielen/Trainieren/Parken/Aussortieren) | OK |
| "+ Eintragen" Button | OK (Notiz-Textfield sichtbar) |
| Potential/Upgrade-Info | OK — Alter, Ziel-OVR, Upgrade-Anzahl |

---

## Mobile

| Check | Ergebnis |
|---|---|
| Mobile Bottom-Nav (`lg:hidden fixed bottom-0`) | Im DOM vorhanden und korrekt |
| Main-PaddingBottom auf Desktop (1280px) | 24px (p-6) — korrekt für Desktop |
| globals.css `@media (max-width: 1023px) main { padding-bottom: max(5rem, ...) }` | Vorhanden |
| Lineup Mobile Quick-Nav Pills | Vorhanden (laut Code, nicht live-simuliert) |
| Squad Mobile Card-Ansicht (`lg:hidden`) | Vorhanden (laut Code, nicht live-simuliert) |

**Nicht getestet:** Echter Mobile-Viewport-Smoke (iPhone-Preset / Playwright-Mobile).
Empfehlung: Vor Release kurz auf echtem Gerät oder Devtools-Mobile-Preset prüfen.

---

## localStorage Reset

| Check | Ergebnis |
|---|---|
| `localStorage.clear()` | Alle Keys geleert |
| Nach Clear auf /squad navigieren | Welcome-Modal + "Zum Import" — korrekt |
| Nach Clear auf / navigieren | Import-Formular leer, "Kader exportieren" disabled — korrekt |
| Re-Import nach Clear | Funktioniert (Demo über UI getestet) |

---

## Console Errors

### /squad — P1

```
Warning: Each child in a list should have a unique "key" prop.
Check the render method of `SquadPage`.
at SquadPage (src/app/squad/page.tsx:860)
```

Betrifft eine Liste ohne `key`-Prop in der Squad-Seite. Führt zu React-Diffing-Problemen
bei Updates, aber kein visueller Crash.

```
Warning: In HTML, <button> cannot be a descendant of <button>.
This will cause a hydration error.
at SquadPage (src/app/squad/page.tsx:860)
```

Ein `<button>` ist in einen anderen `<button>` eingebettet. Das verursacht Hydration-Fehler
und kann Details-/Chart-Button-Klicks auf bestimmten Browsern unterbrechen.

### Alle anderen Routen

Keine Errors, nur React DevTools Info-Log.

---

## Findings

### P0 — Blocker (vor RC beheben)

Keine gefunden.

---

### P1 — Wichtig (vor Release beheben)

#### P1-1: `<button>` in `<button>` Hydration Error — Squad-Seite
**Route:** `/squad`  
**Symptom:** Console-Warning "In HTML, button cannot be a descendant of button. This will cause a hydration error."  
**Datei:** `src/app/squad/page.tsx` ca. Zeile 860  
**Ursache:** Details-Row wird als `<button>` gerendert, enthält aber selbst einen `<button>` (Details/Chart/Link).  
**Impact:** Hydration-Fehler auf Server-Side, potenziell kaputte Event-Handler auf bestimmten Browsern. Verletzt HTML-Standard.  
**Fix:** Äußeren Container von `<button>` auf `<div>` (mit `onClick`) umstellen oder innere Buttons aus dem äußeren Button herausnehmen.

#### P1-2: 📊 Chart-Button öffnet kein Chart
**Route:** `/squad`  
**Symptom:** Klick auf 📊-Button in der Spielertabelle produziert kein sichtbares Canvas, SVG, Modal oder Inline-Row. Kein Radar-Chart erscheint.  
**Geprüft:** Kein `<canvas>`, kein `<svg>`, kein `[role="dialog"]`, kein neues `<tr>` nach Klick.  
**Mögliche Ursache:** Button-in-Button-Bug verhindert Event-Propagation, oder Chart-Implementierung fehlt/ist deaktiviert.  
**Impact:** Angekündigtes Feature ("📊 → Radar-Chart") funktioniert nicht.  
**Fix:** Erst P1-1 beheben, dann re-testen. Falls Chart danach noch fehlt: Implementierung prüfen.

---

### P2 — Polish (nice-to-have)

#### P2-1: `key` prop fehlt in Liste — Squad-Seite
**Route:** `/squad`  
**Symptom:** "Each child in a list should have a unique key prop" in Console.  
**Datei:** `src/app/squad/page.tsx` ca. Zeile 860  
**Impact:** Schlechte React-Diffing-Performance bei Liste-Updates, aber kein Crash.  
**Fix:** `key={player.id}` oder `key={index}` an das entsprechende Listenelement hängen.

#### P2-2: Demo-Import hat keine `positionSource`
**Symptom:** `POST /api/import { clubName: "demo" }` liefert `positionSource` nicht gesetzt (undefined).  
**Ursache:** `MOCK_PLAYERS` werden ohne `positionSource` definiert, Tracker-Lookup läuft nicht.  
**Impact:** Inkonsistenz im API-Response (Live-Imports: `goals-tracker`, Demo: leer). Kein UX-Problem.  
**Fix:** In `src/app/api/import/route.ts` Demo-Pfad mit `positionSource: 'heuristic'` anreichern.

#### P2-3: Matchup-Snapshot im Accessibility-Tree unvollständig
**Symptom:** `browser_snapshot()` auf `/matchup` nach Analyse zeigt nur Eingabefeld + leerem Knotenbaum. Vollständige Analyse nur mit `full=true` sichtbar.  
**Ursache:** Analyse-Karten sind vermutlich als aria-hidden oder ohne semantische Rollen gerendert.  
**Impact:** Screenreader-Accessibility suboptimal. Kein Funktionsproblem.  
**Fix:** Analyse-Karten mit `<section>`, `<h3>` etc. strukturieren.

#### P2-4: Echter Mobile-Viewport nicht smoke-getestet
**Symptom:** Mobile-Audit nur auf Desktop-Browser mit Code-Inspektion durchgeführt.  
**Empfehlung:** Einmalig auf echtem iOS/Android oder Devtools-Mobile-Preset die Haupt-Routen checken (Squad-Cards, Lineup-PillRow, BottomNav-Überdeckung).

#### P2-5: Welcome-Modal überdeckt Content bei direktem Tieflink
**Symptom:** Wenn User direkt auf `/squad` navigiert (ohne vorher `/` besucht), überlagert Welcome-Modal den Squad-Content.  
**Impact:** Erste UX-Impression suboptimal. Modal lässt sich aber schließen.  
**Fix:** Welcome-Modal nur auf `/` zeigen, nicht auf tieferen Routen.

---

## Nicht getestet / Out of scope

- DnD-Drag auf Pitch (Playwright-DnD nötig)
- `/lineup/alternatives` Route (Alternatives-Feature)
- `/meta` Meta-Center Seite
- Live-Site `goals.ivo-tech.com` (kein Vercel-Smoke)
- Backup-Import (`.json`-Upload)
- Echter Mobile-Viewport-Smoke (Playwright iPhone)

---

## Fazit

App ist releasefähig mit zwei P1-Fixes. Beide betreffen dieselbe Code-Stelle in `squad/page.tsx`
(Button-in-Button). P2s können als Folge-Sprint gemacht werden.

Empfohlene Reihenfolge:
1. P1-1 und P1-2 fixen (squad/page.tsx ~Zeile 860)
2. P2-1 gleich mitfixen (key prop, gleiche Stelle)
3. Optional: P2-2 Demo positionSource
4. Mobil-Quickcheck auf echtem Gerät
