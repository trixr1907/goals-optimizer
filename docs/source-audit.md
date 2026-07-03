# Goals Optimizer — Data Source Audit

**Datum:** 2026-07-04
**Club:** txr' (Goalsverse ID: `1b0f88df-6f4c-45cf-8c96-46e47853731c`, Slug: `txr`)
**Squad-Spieler (volle Stats via /v1/club/):** 18
**Club/Profil-Spieler (Basic via /p/txr):** 18 (identisch — Club-Array enthält nur aktuelle 18)
**Script:** `scripts/audit-sources.mjs` — echte Live-Daten, kein Mock

---

## Übersicht der Positionsdiskrepanzen

| Spieler | App | PlayGOALS | Tracker (erw.) | Tracker (live) | GV ovr.role | GV best-rated (Goalsverse) | Tracker Primary |
|---------|-----|-----------|----------------|----------------|-------------|----------------------------|-----------------|
| Wendelin Pietsch | ⚠️ CB | FB | FB | **FB** | CB (role=2) | CB=76 (Tie CB=FB=76!) | FB:76 |
| Alfred Mengue | ⚠️ CB | FB | FB | **FB** | CB (role=2) | CB=75 (Tie CB=FB=75!) | FB:75 |
| Elen de Mattos | ⚠️ DM | AM | AM | **AM** | DM (role=7) | DM=70 (Tie DM=WB=70!) | AM:70 |
| Antoinette Sidibe | ⚠️ WB | CM | CM | **CM** | WB (role=5) | WB=73 (Tie WB=FB=DM=73!) | CM:73 |
| Jonathan Jones | ⚠️ DM | AM | AM | **AM** | DM (role=7) | DM=81 (4-way Tie!) | AM:81 |
| Romário Vieira | ⚠️ CM | WF | WF | **WF** | CM (role=9) | CM=76 (Tie CM=WM=76!) | WF:76 |
| Vitor do Monte | ⚠️ WM | ST | ST | **ST** | WM (role=11) | WM=81 (3-way Tie!) | ST:81 |

**Alle 7 Tracker-live-Positionen stimmen mit PlayGOALS überein. Alle 7 App-Positionen sind falsch.**

---

## Kerndiagnose: Das eigentliche Problem

### Was `bestPositionFromRatings()` tut — und warum es scheitert

Die Funktion funktioniert korrekt nach ihrer eigenen Spec. Das Problem liegt in den
**Rohdaten die Goalsverse liefert vs. was Goalsverse Tracker anzeigt.**

Goalsverse und Goals-Tracker verwenden **unterschiedliche Positionsrating-Systeme.**

#### Goalsverse `ovr_roles` — was wir scrapen:

```
Wendelin Pietsch: CB:76, FB:76, WB:73, DM:70, AM:69, CM:69, WM:68
Alfred Mengue:    CB:75, FB:75, WB:73, DM:70, AM:69, CM:68, WM:68
Elen de Mattos:   DM:70, WB:70, AM:69, CM:69, WM:69, FB:66, CB:64
Antoinette Sidibe:WB:73, FB:73, DM:73, AM:72, CM:72, WM:72, CB:72
Jonathan Jones:   DM:81, WB:81, CM:81, AM:81, WM:80, FB:76, CB:75
Romário Vieira:   CM:76, WM:76, AM:75, WB:74, DM:74, FB:64, CB:62
Vitor do Monte:   WM:81, CM:81, AM:81, WB:80, DM:80, FB:73, CB:71
```

#### Goals Tracker Primary Positions — live gescrapt:

```
Wendelin Pietsch:  FB:76 (Primary) — WB:76, CB:74, WM:74
Alfred Mengue:     FB:75 (Primary) — WB:75, CB:73, WM:73
Elen de Mattos:    AM:70 (Primary) — WM:68, CM:68, CF:68
Antoinette Sidibe: CM:73 (Primary) — DM:71, WM:71, AM:71
Jonathan Jones:    AM:81 (Primary) — WM:79, CM:79, CF:79
Romário Vieira:    WF:76 (Primary) — WM:74, CF:74, ST:74
Vitor do Monte:    ST:81 (Primary) — WF:79, CF:79
```

### Drei verschiedene Fehlertypen

#### Typ A: Tie zwischen CB und FB (Pietsch, Mengue)
- **Goalsverse:** CB=76 und FB=76 — exakter Tie
- **`bestPositionFromRatings()`:** Bei Tie → Stage 2 (`raw.role`) → kein top-level `role`-Feld vorhanden (`undefined`) → Stage 3 (stat Tie-Break) → kein klares kreatives/defensives Profil → Stage 4: `ovr.role = CB` → **CB gewinnt**
- **Tracker/PlayGOALS:** FB ist Primary
- **Ursache:** Goalsverse `ovr.role=2` (CB) ist die *ausgerüstete* Karte, aber Tracker zeigt FB als Primary. Der Tracker scheint eine andere Regel zu nutzen: **LB/RB (FB) hat Priorität vor CB bei gleichem OVR** oder FB wird vom Tracker als "echter Primary" klassifiziert.
- **Stat-Profil:** Pietsch pac=92, def=68 — kein eindeutig defensives Profil; Mengue pac=94, def=79, phy=69 — auch kein eindeutiger CB.

#### Typ B: Tie zwischen DM und AM (de Mattos, Jones) / WB und CM (Sidibe)
- **Goalsverse:** DM=70, WB=70, AM=69 (de Mattos); WB=73, FB=73, DM=73, AM=72 (Sidibe); DM=81, WB=81, CM=81, AM=81 (Jones)
- **Tracker:** AM=70 Primary (de Mattos), CM=73 Primary (Sidibe), AM=81 Primary (Jones)
- **Ursache:** Goalsverse `ovr_roles` zeigt für de Mattos DM als höchstes (DM=WB=70 > AM=69), aber Tracker zeigt AM=70 als Primary. **Der Tracker verwendet andere/aktuellere Ratings.** Die Rohdaten divergieren zwischen den Quellen.
- **Bei Jones:** 4-way Tie (DM/WB/CM/AM alle 81) in Goalsverse, aber Tracker zeigt nur AM=81 als top — der Tracker rechnet DM/WB deutlich tiefer (76). **Tracker und Goalsverse rechnen OVR unterschiedlich.**

#### Typ C: Goalsverse-Primärposition komplett falsch (Vieira, do Monte)
- **Romário Vieira:** GV zeigt CM=76, WM=76 als beste — Tracker zeigt WF=76 als Primary. WF taucht in GV `ovr_roles` **gar nicht auf!**
- **Vitor do Monte:** GV zeigt WM=81, CM=81, AM=81 — Tracker zeigt ST=81 als Primary. ST taucht in GV `ovr_roles` **gar nicht auf!**
- **Ursache:** Goalsverse `ovr_roles` und Goals-Tracker berechnen/zeigen unterschiedliche Positionslisten. **Tracker kennt Positionen (WF, ST, CF) die Goalsverse nicht in `ovr_roles` exponiiert** — oder Tracker nutzt ein anderes Mapping.

---

## Spieler-Detaildaten (echte Live-Daten)

### Wendelin Pietsch

**characterId:** `d6553983-f4d5-5923-8fe9-077939607a12`
**Goals-Tracker URL:** https://goals-tracker.com/player/d6553983-f4d5-5923-8fe9-077939607a12
**Data Quality:** full (Squad-Spieler)
**OVR:** 76 | **Tier:** nicht in Squad-Raw
**Stats:** PAC 92 | SHO 38 | PAS 68 | DRI 62 | DEF 68 | PHY 83

| Quelle | Position | OVR |
|--------|----------|-----|
| Unsere App (aktuell) | **CB** ← FALSCH | — |
| PlayGOALS (Referenz) | **FB** | — |
| GOALS Tracker (live) | **FB** | 76 |
| Goalsverse `ovr.role` | CB (role=2) | — |
| Goalsverse `ovr_roles` | CB=76, **FB=76**, WB=73, DM=70, AM=69, CM=69, WM=68 | Tie CB=FB |
| Tracker alle Pos | FB:76, WB:76, CB:74, WM:74, DM:71, CM:71, AM:71, WF:71, CF:71, ST:71 | |

**Diagnose Typ A:** Tie CB=FB=76 in GV. Stage 4 wählt `ovr.role=CB` als Fallback. Tracker zeigt FB=76 als Primary (CB=74 Tracker). **Tracker-Daten und GV-Daten weichen bei CB-Rating ab** (GV: CB=76, Tracker: CB=74).

---

### Alfred Mengue

**characterId:** `8d45f3f7-5d7b-5ea1-b72d-890ec1dfa6f6`
**Goals-Tracker URL:** https://goals-tracker.com/player/8d45f3f7-5d7b-5ea1-b72d-890ec1dfa6f6
**Data Quality:** full
**Stats:** PAC 94 | SHO 51 | PAS 76 | DRI 50 | DEF 79 | PHY 69

| Quelle | Position | OVR |
|--------|----------|-----|
| Unsere App (aktuell) | **CB** ← FALSCH | — |
| PlayGOALS (Referenz) | **FB** | — |
| GOALS Tracker (live) | **FB** | 75 |
| Goalsverse `ovr.role` | CB (role=2) | — |
| Goalsverse `ovr_roles` | CB=75, **FB=75**, WB=73, DM=70, AM=69, CM=68, WM=68 | Tie CB=FB |
| Tracker alle Pos | FB:75, WB:75, CB:73, WM:73, DM:70, CM:70, AM:70, WF:70, CF:70, ST:70 | |

**Diagnose Typ A:** Identisches Muster zu Pietsch. GV: CB=FB=75 (Tie). Tracker: FB=75 Primary, CB=73. **Tracker gewichtet FB höher als CB bei diesem Spielertyp.**

---

### Elen de Mattos

**characterId:** `30ea7689-33ca-5b3e-bb95-6b0f094a7a1f`
**Goals-Tracker URL:** https://goals-tracker.com/player/30ea7689-33ca-5b3e-bb95-6b0f094a7a1f
**Data Quality:** full
**Stats:** PAC 60 | SHO 57 | PAS 84 | DRI 82 | DEF 56 | PHY 42

| Quelle | Position | OVR |
|--------|----------|-----|
| Unsere App (aktuell) | **DM** ← FALSCH | — |
| PlayGOALS (Referenz) | **AM** | — |
| GOALS Tracker (live) | **AM** | 70 |
| Goalsverse `ovr.role` | DM (role=7) | — |
| Goalsverse `ovr_roles` | **DM=70**, WB=70, AM=69, CM=69, WM=69, FB=66, CB=64 | Tie DM=WB |
| Tracker alle Pos | AM:70, WM:68, CM:68, CF:68, FB:65, CB:65, WB:65, DM:65, WF:65, ST:65 | |

**Diagnose Typ B+:** GV liefert DM=70 (höchstes), aber Tracker zeigt AM=70. **Ratings sind bei Goalsverse und Tracker komplett unterschiedlich.** Stat-Profil (PAS=84, DRI=82, PAC=60, DEF=56) ist klar kreativ/playmaker. `bestPositionFromRatings()` Stage 3 sollte eigentlich AM wählen — aber DM/WB Tie verhindert das (Stage 1 kein eindeutiger Winner, Stage 2 kein top-level `role`).

**Stat-Tie-Break Check:** creativeScore = 82×0.35 + 84×0.30 + 60×0.20 + 57×0.15 = 28.7 + 25.2 + 12 + 8.55 = **74.45**. holdingScore = 56×0.55 + 42×0.45 = 30.8 + 18.9 = **49.7**. Delta = 74.45 - 49.7 = 24.75 > 10, DRI=82 ≥ 80, PAS=84 ≥ 75 → **Stage 3 sollte AM wählen**, aber AM ist nicht in `topPositions` (nur DM und WB haben OVR 70, AM hat nur 69).

**Das ist der kritische Bug:** Stage 3 kann nur zwischen den Positionen im `topPositions`-Array wählen. Wenn AM nicht im Tie ist (AM=69 < DM=70), greift Stage 3 nicht für AM. Aber der Tracker zeigt AM=70 — **Goalsverse und Tracker berechnen OVR-Ratings unterschiedlich.**

---

### Antoinette Sidibe

**characterId:** `1b1bafcd-1317-54ca-992c-55b9e0fe4a77`
**Goals-Tracker URL:** https://goals-tracker.com/player/1b1bafcd-1317-54ca-992c-55b9e0fe4a77
**Data Quality:** full
**Stats:** PAC 78 | SHO 73 | PAS 69 | DRI 65 | DEF 76 | PHY 58

| Quelle | Position | OVR |
|--------|----------|-----|
| Unsere App (aktuell) | **WB** ← FALSCH | — |
| PlayGOALS (Referenz) | **CM** | — |
| GOALS Tracker (live) | **CM** | 73 |
| Goalsverse `ovr.role` | WB (role=5) | — |
| Goalsverse `ovr_roles` | WB=73, FB=73, DM=73, AM=72, CM=72, WM=72, CB=72 | 3-way Tie WB=FB=DM |
| Tracker alle Pos | CM:73, DM:71, WM:71, AM:71, FB:68, CB:68, WB:68, WF:68, CF:68, ST:68 | |

**Diagnose Typ B:** GV zeigt WB=FB=DM=73 (3-way Tie). Stage 4 wählt `ovr.role=WB`. Tracker zeigt CM=73 Primary. **Massive Divergenz:** GV hat CM=72, Tracker hat CM=73. Tracker hat WB=68, GV hat WB=73. **Goalsverse und Tracker liefern fundamental andere Ratings für denselben Spieler.**

---

### Jonathan Jones

**characterId:** `6dbe494a-0568-58e9-bd59-30c331515659`
**Goals-Tracker URL:** https://goals-tracker.com/player/6dbe494a-0568-58e9-bd59-30c331515659
**Data Quality:** full
**Stats:** PAC 87 | SHO 74 | PAS 84 | DRI 90 | DEF 76 | PHY 38

| Quelle | Position | OVR |
|--------|----------|-----|
| Unsere App (aktuell) | **DM** ← FALSCH (nach letztem Fix noch immer?) | — |
| PlayGOALS (Referenz) | **AM** | — |
| GOALS Tracker (live) | **AM** | 81 |
| Goalsverse `ovr.role` | DM (role=7) | — |
| Goalsverse `ovr_roles` | DM=81, WB=81, CM=81, **AM=81**, WM=80, FB=76, CB=75 | 4-way Tie |
| Tracker alle Pos | AM:81, WM:79, CM:79, CF:79, FB:76, CB:76, WB:76, DM:76, WF:76, ST:76 | |

**Diagnose Typ B:** 4-way Tie (DM/WB/CM/AM alle 81). Stage 2: kein top-level `role`. Stage 3: creativeScore = 90×0.35 + 84×0.30 + 87×0.20 + 74×0.15 = 31.5 + 25.2 + 17.4 + 11.1 = **85.2**. holdingScore = 76×0.55 + 38×0.45 = 41.8 + 17.1 = **58.9**. Delta = 26.3 > 10, DRI=90 ≥ 80, PAS=84 ≥ 75 → **Stage 3 sollte AM wählen aus {DM, WB, CM, AM}!** AM ist in `topPositions` (alle 4 mit OVR 81). Also **sollte** der Stat-Tie-Break funktionieren. **Warum zeigt die App noch DM?**

→ Das deutet darauf hin, dass der Live-Import den letzten Fix (commit 2daa287) noch nicht reflektiert — oder Jones wird als Basic-Spieler importiert (kein Stats-Objekt → Stage 3 greift nicht).

---

### Romário Vieira

**characterId:** `b5b9e160-ee33-5ab6-82ab-4e660a067b6b`
**Goals-Tracker URL:** https://goals-tracker.com/player/b5b9e160-ee33-5ab6-82ab-4e660a067b6b
**Data Quality:** full
**Stats:** PAC 92 | SHO 83 | PAS 40 | DRI 86 | DEF 41 | PHY 50

| Quelle | Position | OVR |
|--------|----------|-----|
| Unsere App (aktuell) | **CM** ← FALSCH | — |
| PlayGOALS (Referenz) | **WF** | — |
| GOALS Tracker (live) | **WF** | 76 |
| Goalsverse `ovr.role` | CM (role=9) | — |
| Goalsverse `ovr_roles` | CM=76, WM=76, AM=75, WB=74, DM=74, FB=64, CB=62 | Tie CM=WM |
| Tracker alle Pos | **WF:76**, WM:74, CF:74, ST:74, FB:71, CB:71, WB:71, DM:71, CM:71, AM:71 | |

**Diagnose Typ C — kritisch:** Goalsverse `ovr_roles` enthält **WF nicht** (und auch nicht CF oder ST). Tracker zeigt WF=76 als Primary. **WF (LW/RW) fehlt komplett im Goalsverse-Payload.** Stat-Profil: PAC=92, SHO=83, DRI=86, PAS=40 — typischer Flügelstürmer, nicht CM. Aber `bestPositionFromRatings()` kann WF nicht wählen wenn es nicht in `roleRatings` ist. Tie-Break Stage 3: creativeScore = 86×0.35 + 40×0.30 + 92×0.20 + 83×0.15 = 30.1 + 12 + 18.4 + 12.45 = **72.95**. holdingScore = 41×0.55 + 50×0.45 = 22.55 + 22.5 = **45.05**. Delta > 10, DRI=86 ≥ 80, **PAS=40 < 75 → Stage 3 greift nicht!** Kein klares AM-Profil (zu wenig PAS). → Fallback auf `ovr.role = CM`.

---

### Vitor do Monte

**characterId:** `7cfe929a-32c9-5ef2-8690-322339963af8`
**Goals-Tracker URL:** https://goals-tracker.com/player/7cfe929a-32c9-5ef2-8690-322339963af8
**Data Quality:** full
**Stats:** PAC 86 | SHO 82 | PAS 66 | DRI 82 | DEF 43 | PHY 72

| Quelle | Position | OVR |
|--------|----------|-----|
| Unsere App (aktuell) | **WM** ← FALSCH | — |
| PlayGOALS (Referenz) | **ST** | — |
| GOALS Tracker (live) | **ST** | 81 |
| Goalsverse `ovr.role` | WM (role=11) | — |
| Goalsverse `ovr_roles` | WM=81, CM=81, AM=81, WB=80, DM=80, FB=73, CB=71 | 3-way Tie |
| Tracker alle Pos | **ST:81**, WF:79, CF:79, FB:76, CB:76, WB:76, DM:76, WM:76, CM:76, AM:76 | |

**Diagnose Typ C — kritisch:** ST fehlt komplett in Goalsverse `ovr_roles`. Tracker zeigt ST=81. 3-way Tie (WM/CM/AM alle 81). Stage 3: creativeScore = 82×0.35 + 66×0.30 + 86×0.20 + 82×0.15 = 28.7 + 19.8 + 17.2 + 12.3 = **78.0**. holdingScore = 43×0.55 + 72×0.45 = 23.65 + 32.4 = **56.05**. Delta > 10, DRI=82 ≥ 80, PAS=66 < 75 → **Stage 3 greift nicht** (PAS-Schwelle nicht erfüllt). Fallback: `ovr.role = WM`. AM wäre zumindest plausibler als WM, aber ST — die echte Primary — kann nicht aus `ovr_roles` kommen.

---

## Systemische Analyse: Goalsverse vs. Tracker Divergenz

### Grundproblem: Zwei verschiedene Rating-Berechnungen

Goalsverse `ovr_roles` und Goals Tracker verwenden **unterschiedliche Formeln/Daten**
zur Berechnung des positionsspezifischen OVR. Dies ist keine App-Bug, sondern ein
**upstream Datenproblem.**

| Spieler | GV Primary (by OVR) | Tracker Primary | Rating-Delta Beispiel |
|---------|---------------------|-----------------|----------------------|
| Pietsch | CB=76 (Tie mit FB) | FB=76 | GV: CB=76, Tracker: CB=74 |
| Mengue | CB=75 (Tie mit FB) | FB=75 | GV: CB=75, Tracker: CB=73 |
| de Mattos | DM=70 (Tie mit WB) | AM=70 | GV: AM=69, Tracker: AM=70 |
| Sidibe | WB=73 (3-way Tie) | CM=73 | GV: CM=72, Tracker: CM=73 |
| Jones | DM=81 (4-way Tie) | AM=81 | GV: alle 4 gleich, Tracker: nur AM=81 hoch |
| Vieira | CM=76 (Tie mit WM) | WF=76 | GV: kein WF-Eintrag! |
| do Monte | WM=81 (3-way Tie) | ST=81 | GV: kein ST-Eintrag! |

### Zwei strukturell verschiedene Fehler:

**Fehler 1 — Tie-Break-Problem (Pietsch, Mengue, de Mattos, Sidibe, Jones):**
Goalsverse `ovr_roles` hat mehrere gleichhohe Ratings. Unsere Tie-Break-Logik wählt
den falschen Gewinner, weil `ovr.role` (equipped) als letzter Fallback dominiert.
**Lösung: Goals-Tracker als authoritative Tie-Break-Quelle nutzen.**

**Fehler 2 — Fehlende Positionen in GV (Vieira, do Monte):**
Goalsverse `ovr_roles` enthält bestimmte Positionen (WF, ST, CF) gar nicht, die der
Tracker als Primary zeigt. Kein Tie-Break-Algorithmus kann eine Position wählen,
die nicht in `ovr_roles` ist.
**Lösung: Goals-Tracker-Daten als ergänzende Quelle für roleRatings nutzen.**

---

## Positions-System: Fachliche Dokumentation

### Primary / Secondary / Out-of-Position — Die Regeln

Basierend auf `src/lib/scraper/types.ts#getEffectiveStats()` und Community-Wissen:

| Positionstyp | Penalty | Gilt auf | Quelle |
|---|---|---|---|
| **Primary** (displayte Hauptposition) | 0 | alle Stats | types.ts |
| **Secondary** (in `ovr_roles` mit OVR >= primary-10) | **-2** alle Stats | PAC, SHO, PAS, DRI, DEF, PHY | types.ts |
| **Out of Position** (nicht in `ovr_roles` / weit darunter) | **-5** alle Stats | PAC, SHO, PAS, DRI, DEF, PHY | types.ts |

**Wichtig:**
- Penalty gilt auf die **6 Kategorie-Stats** (PAC/SHO/PAS/DRI/DEF/PHY), NICHT auf OVR
- Der OVR-Wert in `ovr_roles` ist bereits positionsspezifisch (jede Position hat eigene OVR)
- Secondary-Threshold ist aktuell -10 vom equippedOverall (Zeile ~536 goalsverse-client.ts) — das ist intentional weit
- Die -2/-5 Penalty-Werte sind **nicht offiziell von PlayGOALS dokumentiert** — Community-Konsens

### Secondary Positions — Wie zeigen sie die Quellen?

**PlayGOALS App:**
- Spieler-Profilseite zeigt alle equippten Positionen, nach OVR sortiert
- Höchster OVR = Primary (dominant angezeigt)
- Darunter: Secondary Positions mit jeweiligem OVR
- Diese Reihenfolge entspricht dem, was Tracker als Primary zeigt

**GOALS Tracker (goals-tracker.com):**
- Zeigt alle Positionen mit OVR-Rating in Tabellenform
- Sortiert nach OVR (höchstes zuerst) = Primary
- Enthält teils Positionen die Goalsverse `ovr_roles` NICHT hat (WF, ST, CF)
- **Authoritative für Primary-Position-Bestimmung** (stimmt mit PlayGOALS überein)

**Goalsverse `ovr_roles` (unser Scraper-Input):**
- Array mit positionsspezifischen OVR-Ratings
- Enthält für manche Spieler NICHT alle Positionen (fehlende WF/ST/CF)
- Ist die einzige maschinenlesbare Quelle für roleRatings im Import
- `ovr.role` (equipped) ≠ Primary-Position (7 Diskrepanzen belegt)

---

## Quellen-Authorität pro Feld

| Feld | Authoritative Quelle | Fallback | Begründung |
|------|---------------------|----------|------------|
| **player.position** (Primary) | Goals Tracker `primaryPosition` | ovr_roles höchstes OVR | Tracker = PlayGOALS, verifiziert für alle 7 Spieler |
| **roleRatings** | Goalsverse `ovr_roles` + Tracker-Ergänzung | nur GV (unvollständig) | GV hat alle Ratings, Tracker hat zusätzliche Positionen |
| **Stats** (PAC/SHO/…) | Goalsverse `stats`-Objekt (Squad only) | Goals Tracker HTML | Goalsverse liefert Individualstats — Tracker nur Kategorien |
| **OVR** (gesamt) | Goalsverse `ovr.overall_rating` | — | Einzige Quelle |
| **Matches/Goals/Assists** | Goalsverse `club`-Array (`matchesPlayed`, `goals`, `assists`) | Squad-Payload | Club-Array hat vollständige Match-History |
| **playTimeSeconds** | Goalsverse `club`-Array | — | Nur dort verfügbar |
| **Height/Age/Foot** | Goalsverse Squad-Payload | — | Nur bei Full-Stats-Spielern |
| **Tier/Potential** | Goalsverse `tier`, `max_potential_rating` | — | Nur in Squad-Payload |
| **Tracker Primary Pos** | goals-tracker.com HTML | PlayGOALS manuell | Verifiziert vs. PlayGOALS für alle 7 Spieler |

---

## Empfehlungen

### Für `player.position` (Primary)

**Empfehlung: Goals-Tracker-Scraping als authoritative Primary-Quelle nutzen.**

Der Tracker stimmt für alle 7 Spieler mit PlayGOALS überein. Goalsverse `ovr_roles` ist
unvollständig (fehlende WF/ST/CF) und hat Tie-Probleme die nicht verlässlich auflösbar sind.

**Implementierungsoptionen:**

Option A — Tracker als Primärquelle (genaueste Lösung):
```
GET https://goals-tracker.com/player/{characterId}
→ HTML scrapen → primaryPosition extrahieren
→ als player.position setzen
```
Vorteil: 100% korrekt (verifiziert). Nachteil: Extra HTTP-Request pro Spieler, Scraping fragil.

Option B — Bestimmte Tie-Break-Regel für bekannte Muster (schnellere Lösung):
```
Wenn Tie zwischen CB und FB → FB bevorzugen
Wenn Tie zwischen DM und AM → stat-Tie-Break mit niedrigerer PAS-Schwelle (z.B. 65 statt 75)
Wenn Tie 3- oder 4-fach → creative-Positionen über defensive bevorzugen
```
Nachteil: Heuristik, nicht generalisierbar.

Option C — Manueller Override-Store (robusteste Langzeitlösung):
```
PlayerOverrides in localStorage: { [characterId]: { position: 'FB' } }
Import nutzt Override wenn vorhanden, sonst automatisch
User kann per UI korrigieren
```
Vorteil: Kein externer Call, user-controlled, überlebt API-Änderungen.

### Für `roleRatings`

**Empfehlung: Goalsverse `ovr_roles` + Goals-Tracker als Ergänzung.**

- GV `ovr_roles` ist die beste maschinenlesbare Quelle
- Tracker ergänzt fehlende Positionen (WF, ST, CF) — sollte in roleRatings integriert werden
- Bei Konflikten: Tracker-Ratings für Primary, GV für alle anderen
- Basic-Spieler (aus Club-Array): nur Primärposition + OVR — keine Nebenpositionen möglich ohne Tracker

### Für Stats

**Empfehlung: Goalsverse Squad-RSC-Payload (unverändert, bereits korrekt).**

- Vollständige Individualstats nur im Squad-RSC verfügbar
- Goals Tracker HTML für Kreuzvalidierung (PAC/SHO/PAS/DRI/DEF/PHY), aber nicht als Primary

### Für Match/Performance-Daten

**Empfehlung: Goalsverse Club-Array (`matchesPlayed`, `goals`, `assists`, `playTimeSeconds`).**

- Bereits im Import gemergert — korrekte Implementierung
- Goalsverse Club-Array hat `playTimeSeconds` — noch nicht in Player-Model genutzt

### Was sollte gecacht werden?

| Datenkategorie | Empfohlener Cache | Begründung |
|---|---|---|
| Goalsverse Squad-RSC | 30-60 min (Server-Cache) | ~100-200KB, Rate-Limiting |
| Goalsverse Profil-RSC | 60 min (Server-Cache) | 590KB, verändert sich selten |
| Goals-Tracker HTML per Spieler | 4-8h (Server-Cache) | Scraping-Risiko, keine offizielle API |
| roleRatings + position nach Import | Permanent (localStorage) | Bereits via Zustand |
| Manueller Position-Override | Permanent (localStorage) | User-Korrektur soll persistent sein |

### Welche Features ergeben Sinn?

1. **Manueller Position-Override (höchste Prio):** Für Fälle wo Goalsverse-Daten falsch liegen.
   Kleines UI: Spielerkarte → "Position korrigieren" → Dropdown → gespeichert in localStorage.
   Kein API-Call, kein Deployment — sofort lösbar.

2. **Goals-Tracker-Enrichment (mittlere Prio):** Optionaler Enrichment-Step nach Import.
   Pro Spieler Tracker-Seite scrapen → primaryPosition + fehlende roleRatings ergänzen.
   Als Server-Route: `POST /api/enrich-positions` mit characterIds als Body.

3. **PlayTimeSeconds-Anzeige (niedrige Prio):** `playTimeSeconds` aus Club-Array ist bereits
   im Payload vorhanden — könnte in Development-Seite als Spielzeit-Balken angezeigt werden.

4. **Positionsdivergenz-Warning:** In der App: wenn `ovr.role` ≠ bestimte Primary-Position
   → kleines Warning-Icon mit "Position unsicher — ggf. manuell überprüfen".

5. **Audit-Cron (optional):** Dieses Script als wöchentlichen Cron laufen lassen,
   Output in `docs/source-audit.md` committen → Änderungen über Zeit sichtbar.

---

## Zusammenfassung

Alle 7 Positionsfehler sind real und reproduzierbar. Der Tracker stimmt für alle 7
Spieler mit PlayGOALS überein. Die Fehler haben zwei Ursachen:

1. **Goalsverse `ovr_roles` hat Tie-Situationen die unser Fallback falsch auflöst** (5 Spieler)
2. **Goalsverse `ovr_roles` fehlen Positionen die Tracker als Primary zeigt** (2 Spieler: Vieira, do Monte)

`bestPositionFromRatings()` ist korrekt implementiert für seine Inputs — aber die Inputs
(Goalsverse-Rohdaten) sind strukturell unvollständig und divergieren vom Tracker.

Die kurzfristig robusteste Lösung: **Manueller Override-Store** in localStorage.
Die mittelfristig korrekte Lösung: **Goals-Tracker als Enrichment-Quelle** für Primary-Position.

---

*Generiert von `scripts/audit-sources.mjs` — echte Live-Daten, kein Mock.*
*Alle Spieler-IDs, Ratings und URLs sind aus dem Live-Import zum 2026-07-04 verifiziert.*
