# Knockout Mode Audit

**Datum:** 2026-07-04
**Quellen:** playgoals.com/en/game-modes-guide, goals-tracker.com/knockout, goals-tracker.com/leaderboard/top-500
**Methode:** Live-HTTP-Fetch + RSC-Payload-Parse (kein Browser, kein Spiel-Login)

---

## 1. Sicher bekannte Fakten

### 1.1 Modus-Grundstruktur (Quelle: playgoals.com)

- Offizieller Name: **Knockout** (nicht "Weekend League")
- Läuft wöchentlich: **Freitag 09:00 CET bis Montag 09:00 CET**
- Ziel: Durch Divisionen aufsteigen per Siege in begrenzten Versuchen
- Scheitern (Versuche aufgebraucht) = **Elimination für die Woche**
- Matchmaking-Strategie: `KNOCKOUT_MATCHMAKING_STRATEGY_DIVISION` (division-based, MMR nur in Bronze)
- Jeder Sieg verbessert Rewards, auch ohne Aufstieg in die nächste Division

### 1.2 Divisions-Struktur (Quelle: goals-tracker.com RSC-Payload)

| Division                        | Versuche (attempts_limit) | Siege zum Aufstieg (subdivisions)   |
|---------------------------------|--------------------------|--------------------------------------|
| Bronze                          | 20                       | 1 Win (Sub 1), dann 3 Wins (Sub 2)  |
| Silver                          | 15                       | 2 Wins, 4 Wins, 6 Wins              |
| Gold                            | 12                       | 3 Wins, 5 Wins, 7 Wins              |
| Elite                           | 10                       | 4 Wins, 6 Wins                      |
| Knockout (Final/KO Division)    | 1 (= 2 Niederlagen = Out)| Unbegrenzte Wins bis 2 Losses        |

Hinweis: `attempts_limit: 1` in der KO-Division bedeutet: du hast genau einen "Pool" — du spielst bis zu 2 Niederlagen. Das deckt sich mit der offiziellen Regel "unlimited wins until two losses".

### 1.3 Rewards pro Division (Quelle: goals-tracker.com RSC-Payload, verifiziert)

**Bronze (20 Versuche):**
| Meilenstein | Packs | Punkte | XP |
|-------------|-------|--------|----|
| 1 Win (Sub 1) | 10 Basic+ Players | — | — |
| 2 Wins (Sub 1 Abschluss) | 10 Basic+ Players | 5.000 | 250.000 |
| 3 Wins (Sub 2 Abschluss) | 3 Common+ Players + 10 Basic+ Players | 10.000 | 500.000 |

**Silver (15 Versuche):**
| Meilenstein | Packs | Punkte | XP |
|-------------|-------|--------|----|
| 2 Wins | 3 Uncommon+ Players | 20.000 | 1.000.000 |
| 4 Wins | 3 Uncommon+ Players | 25.000 | 1.050.000 |
| 6 Wins | 3 Uncommon+ Players | 30.000 | 1.100.000 |

**Gold (12 Versuche):**
| Meilenstein | Packs | Punkte | XP |
|-------------|-------|--------|----|
| 3 Wins | 5 Uncommon+ Players | 40.000 | 1.150.000 |
| 5 Wins | 5 Uncommon+ Players | 45.000 | 1.200.000 |
| 7 Wins | 10 Uncommon+ Players | 50.000 | 1.250.000 |

**Elite (10 Versuche):**
| Meilenstein | Packs | Punkte | XP |
|-------------|-------|--------|----|
| 4 Wins | 1 Rare+ Player | 60.000 | 1.300.000 |
| 6 Wins | 1 Rare+ Player | 65.000 | 1.350.000 |

**Knockout/Final Division (Leaderboard-Rewards, nach Wochenende):**
| Tier | Reward |
|------|--------|
| 1. Platz (FIRST) | 1 Legendary+ Player + 300.000 Punkte + 2.000.000 XP |
| Top 500 in Division (IN_DIVISION) | 1 Rare+ Player + 10 Uncommon+ Players + weitere Packs |

Rewards in frühen Divisionen sind **sofort einlösbar** (nach Elimination). KO-Division-Rewards werden nach Leaderboard-Finalisierung ausgezahlt.

### 1.4 Leaderboard-Daten (Quelle: goals-tracker.com/knockout, live)

Die Seite zeigt ein **wöchentliches KO-Division-Leaderboard** mit:
- `global_position` (Rang)
- `total_wins` (Gesamtsiege in der KO-Division diese Woche)
- `attempts_remaining` (noch verbleibende Versuche, 0 = eliminiert)
- `achieved_at` (Zeitstempel, wann der Spieler in die KO-Division aufstieg)
- `user_display`: `{ id, username: { goals, steam, playstation, epic, xbox }, platform }`

Aktuelle Woche (2026-07-04, live):
- Platz 1: ERROR — 12 Wins, 1 Versuch verbleibend
- Platz 2: Turbulence — 12 Wins, 1 Versuch verbleibend
- Platz 3: Cilenomioo99 — 9 Wins
- Seite hat 381 Einträge, Pagination: "Page 1 / 39" (ca. 390 aktive KO-Division-Spieler diese Woche)

Vergangene Wochen ebenfalls abrufbar:
- Week of Jun 25, Jun 18, Jun 11, Jun 5 — alle über Tabs auf /knockout erreichbar

**Runden-IDs (knockout_id) und Zeiträume:**

| Woche | knockout_id (Anfang) | Start (UTC) | Ende (UTC) |
|-------|---------------------|-------------|------------|
| Jul 2 | b4c622ea | 2026-07-02T16:00 | 2026-07-06T07:00 |
| Jun 25 | 685ff8af | 2026-06-25T16:00 | 2026-06-29T07:00 |
| Jun 18 | 782a47f4 | 2026-06-18T16:00 | 2026-06-22T07:00 |
| Jun 11 | 734b0293 | 2026-06-11T16:00 | 2026-06-15T07:00 |
| Jun 5 | ac760a6f | 2026-06-05T08:00 | 2026-06-08T08:00 |

Hinweis: Startzeiten sind UTC, entspricht Freitag 18:00 CEST (16:00 UTC) — nicht 09:00 CET wie im offiziellen Guide beschrieben. Mögliche Sommer-/Winterzeit-Abweichung oder Guide ist approximiert.

### 1.5 Top-500-Gesamtleaderboard (Quelle: goals-tracker.com/leaderboard/top-500)

Das ist ein **separates, allgemeines SR-Leaderboard** (Skill Rating, alle Modi).
- Zeigt: Rank, Username, Wins, Losses, SR (Skill Rating)
- 500 Einträge, paginiert (Page 1 of 25, 20 Einträge/Seite)
- Kein reines Knockout-Leaderboard — SR kommt aus allen competetiven Spielen

Das /knockout-seitige "KO Top 500"-Tab ist vermutlich dasselbe Leaderboard für die KO-Division, aber nur während der aktiven Woche. Trennung verifiziert:
- `/leaderboard/top-500` = SR-basiertes Gesamtranking
- `/knockout` = KO-Division-Leaderboard (Wins diese Woche)

### 1.6 Squad-Requirements / Restrictions

Keine Squad-Anforderungen für Knockout gefunden (kein OVR Max/Min, kein Tier-Lock, kein Duplicates-Filter im RSC-Payload). Knockout ist ein **offener Modus** ohne Squad-Beschränkungen — anders als die Cup-Turniere.

---

## 2. Fehlende / Unbekannte Daten

| Offene Frage | Status |
|--------------|--------|
| Exakte Startuhrzeit (09:00 CET = 08:00 UTC oder 16:00 UTC wie RSC-Timestamps zeigen?) | Widerspruch Guide vs. Timestamps — im Spiel manuell verifizieren |
| Wie viele Wins braucht man für Top 500 in der KO-Division? (Minimum?) | Nicht in Payload — hängt von Wochen-Teilnehmern ab |
| Gibt es Restrictions beim Einsetzen von Spielern? (z.B. nur eigene Club-Spieler?) | Nicht öffentlich dokumentiert — im Spiel prüfen |
| Win-Streak/Bonus-Mechanik? | Nicht im Payload gefunden |
| Match Points & XP pro Spiel (Double Win-Bonus)? | Im Guide erwähnt, exakte Werte nicht im Payload |
| Wie verhalten sich Punkte wenn man zu spät einsteigt (z.B. Samstagnacht)? | Nicht dokumentiert |
| Early-Leave-Penalty exakter Schwellwert? | Guide: "time-based rewards if you leave early" — kein konkreter Wert |

---

## 3. Manuell im Spiel zu verifizieren

1. **Startzeit vs. Guide:** Guide sagt "Freitag 09:00 CET", RSC-Timestamps zeigen "16:00 UTC" (= 18:00 CEST). Ist 09:00 CET korrekt für Winter oder generell?
2. **Subdivisions-Mechanik:** In Bronze gibt es z.B. Sub 1 (1 Win) und Sub 2 (2 Wins). Sind das separate Stages die man durchläuft, oder addieren sich die Wins?
3. **Eliminationsverhalten:** Verlierst du nach genau X Versuchen aufgebraucht, oder nach X Niederlagen ohne genug Siege?
4. **KO-Division "2 Niederlagen":** Im Payload `attempts_limit: 1` — wie zählt das Spiel genau?
5. **Matchmaking in Silver/Gold/Elite/KO:** Nur divisionsbasiert? Kein MMR-Einfluss in höheren Divisionen?

---

## 4. Verfügbare öffentliche Daten — Zusammenfassung

| Datentyp | Verfügbar? | Quelle | Methode |
|----------|-----------|--------|---------|
| Modus-Regeln (Text) | Ja | playgoals.com/en/game-modes-guide | HTTP + Text-Parse |
| Division-Struktur (Versuche, Wins) | Ja, vollständig | goals-tracker.com/knockout RSC | HTTP + unicode_escape decode |
| Rewards pro Division und Meilenstein | Ja, vollständig | goals-tracker.com/knockout RSC | HTTP + regex |
| Pack-Tier-Drop-Rates | Ja, vollständig | goals-tracker.com/knockout RSC | HTTP + regex |
| KO-Division-Leaderboard (Live) | Ja, top ~381 Plätze | goals-tracker.com/knockout | HTTP + RSC |
| Historische Wochen-Leaderboards | Ja, 4 Wochen zurück | goals-tracker.com/knockout | HTTP + RSC |
| Spieler-IDs (UUID) der Top-Spieler | Ja | goals-tracker.com/knockout RSC | HTTP + RSC |
| SR-Gesamtleaderboard (Top 500) | Ja, 500 Plätze | goals-tracker.com/leaderboard/top-500 | HTTP + Text-Parse |
| Squad-Requirements für Knockout | Nein | — | Nicht gefunden |
| Goalsverse: Knockout-Daten | Nein | goalsverse.com | goalsverse hat keine KO-Seite |

---

## 5. Empfehlung — Knockout-Unterstützung im Tool

### Sinnvoll (kurzfristig, kein Aufwand):

**A) Knockout-Kontext im Lineup-Tool:**
Der Modus hat keine Squad-OVR-Requirements. Das bedeutet: Kein Tournament-Readiness-Filter nötig.
Was sinnvoll wäre: Ein Hinweis "Knockout: Kein OVR-Limit — wähle deinen stärksten Squad" im Tournament-Bereich, parallel zu den Cup-Einträgen.

**B) Link zur aktuellen KO-Leaderboard-Seite:**
goals-tracker.com/knockout ist öffentlich und zeigt Live-Rankings. Ein simpler externer Link im Tool (kein eigener Scraper nötig) gibt Spielern Kontext.

### Mittelfristig interessant (eigener Scraper):

**C) KO-Leaderboard-Tracker:**
Der RSC-Payload von goals-tracker.com/knockout enthält strukturierte JSON-Daten:
```
user_display.id (UUID), username.goals, global_position, total_wins, attempts_remaining, achieved_at
```
Ein Audit-Script (`scripts/audit-knockout.mjs`) kann diese Daten wöchentlich snapshotten.
Der Scraper-Ansatz ist identisch zu `scripts/audit-tournaments.mjs` (kein Browser, nur HTTP + RSC-decode).

**D) Eigener Nutzer-Lookup:**
Wenn man einen Nutzernamen kennt, könnte man prüfen ob er in der Top-500-Liste der KO-Division auftaucht. Die UUID im Payload stimmt mit den Goalsverse-User-IDs überein (gleiches Backend).

### Nicht sinnvoll (kein Mehrwert):

- Eigene Knockout-Reward-Kalkulation: Goals-Tracker zeigt das bereits perfekt.
- Bracket-/Matchup-Vorhersage: Keine ausreichende Datenbasis (nur Top-Plätze sichtbar, keine Match-History per Spiel).
- Echt-Zeit-Tracking: Goals-Tracker ist live, ein eigener Poller wäre Redundanz.

### Fazit

Knockout ist öffentlich gut dokumentiert (playgoals.com Guide + goals-tracker.com Live-Daten).
Das Tool braucht keinen eigenen Knockout-Scraper — die nützlichste Integration ist:

1. `TournamentReadinessCard` oder ähnliche Komponente: Zeige "Knockout" als offenen Modus ohne OVR-Filter, mit Link zu goals-tracker.com/knockout.
2. Optional (später): `scripts/audit-knockout.mjs` für wöchentliche Snapshots — nur manuell, nie als App-Runtime-Dependency.

Kein Produktivcode-Sprint nötig — der Mehrwert liegt im Hinweis, nicht im eigenen Leaderboard.

---

## 6. Technische Notizen (für späteres Scraping)

Wenn ein Knockout-Audit-Script gebaut wird:

```js
// goals-tracker.com/knockout RSC Payload
const res = await fetch('https://goals-tracker.com/knockout', {
  headers: {
    'RSC': '1',
    'Next-Router-State-Tree': encodeURIComponent(JSON.stringify(
      ['', { children: ['knockout', { children: ['__PAGE__', {}, '/knockout', 'refresh'] }] }, null, null, true]
    )),
    'Next-Url': '/knockout',
  }
});
// Response enthält Chunks mit JSON-encoded Leaderboard-Daten
// Extraction: regex r/self\.__next_f\.push\((\[.*?\])\)/gs
// Chunk mit "entries" enthält die Spieler-Objekte
// Decode: inner.encode().decode('unicode_escape')
```

Leaderboard-Eintrag-Shape:
```json
{
  "user_display": {
    "id": "UUID",
    "username": { "goals": "Name", "steam": "...", "playstation": "..." },
    "platform": "GAMING_PLATFORM_PLAYSTATION"
  },
  "global_position": 1,
  "total_wins": 12,
  "attempts_remaining": 1,
  "achieved_at": "2026-07-04T06:47:54Z"
}
```

Pack-Tier-Mapping aus dem Payload:
| TIER_KEY | Min OVR | Name |
|----------|---------|------|
| TIER_BASIC | 40+ | Basic |
| TIER_COMMON | 60+ | Common |
| TIER_UNCOMMON | 70+ | Uncommon |
| TIER_RARE | 80+ | Rare |
| TIER_LEGENDARY | 90+ | Legendary |
