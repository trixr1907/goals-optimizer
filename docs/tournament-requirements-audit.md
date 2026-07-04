# Tournament Requirements Audit

Quelle: https://goals-tracker.com/tournaments

Stand: 2026-07-04

## Kurzfazit

GOALS Tracker rendert die Turnierkarten serverseitig genug, um ohne Browser-Automation die aktuell sichtbaren Turnierdaten aus HTML zu lesen. Sichtbar sind Name, Restzeit, Modus, Squad-Requirements, Completion-Rewards und kompakte Rewards pro Runde. Für spätere Squad-Checks reicht die Requirements-Struktur als flexible Key/Value-Liste; die OVR-Requirements wurden manuell als Squad-OVR / Mannschaftsstärke verifiziert.

## Verifizierte Interpretation: OVR Requirements

`OVR Max` und `OVR Min` unter `Squad requirements` beziehen sich aktuell auf Squad OVR / Mannschaftsstärke. Sie sind nicht als Einzelspieler-OVR-Grenze zu interpretieren.

### Squad OVR Formel

Squad OVR wird aus dem Durchschnitt der OVR-Werte der Startelf berechnet und klassisch mathematisch auf eine ganze Zahl gerundet:

```
squadOvr = Math.round(sum(startingEleven.overall) / 11)
```

- Nur die 11 Startelfspieler zählen. Die Bank fliesst nicht ein.
- Einzelspieler-OVR ist nicht direkt die Grenze.

Stand: manuell im Spiel verifiziert am 2026-07-04.

Hinweis: Bei zukünftigen GOALS-Regeländerungen erneut prüfen.

Der Parser behandelt Requirements weiterhin bewusst nur als generische Key/Value-Paare und hardcodet kein Target wie `player`.

## Nächste Umsetzung / Tournament Builder

- Eligibility darf `OVR Max` / `OVR Min` anhand der oben dokumentierten Squad-OVR-Formel prüfen.
- Falls weniger als 11 Spieler in der Aufstellung sind, keine gültige Squad-OVR-Bewertung durchführen.

## Gefundene Requirements

- Duplicated Originals
- OVR Max
- OVR Min
- Retired

## Aktuell extrahierte Turniere

| Tournament | Time left | Mode | Duplicated Originals | OVR Max | OVR Min | Retired | Completion reward | Round rewards |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Beginners Cup #5 | 3d left | 1V1 | 0 | 69 | - | 0 | 200K XP, 4K pts, 3 Common+ Players | R16: 300 pts / 6K xp; QF: 400 pts / 10K xp; SF: 500 pts / 15K xp; F: 750 pts / 25K xp |
| Challengers Cup #5 | 3d left | 1V1 | 0 | 79 | - | 0 | 250K XP, 5K pts, 4 Common+ Players | R16: 300 pts / 6K xp; QF: 400 pts / 10K xp; SF: 500 pts / 15K xp; F: 750 pts / 25K xp |
| Masters Cup #5 | 3d left | 1V1 | 0 | 84 | - | 0 | 300K XP, 6K pts, 2 Uncommon+ Players | R16: 300 pts / 6K xp; QF: 400 pts / 10K xp; SF: 500 pts / 15K xp; F: 750 pts / 25K xp |
| Champions Cup #5 | 3d left | 1V1 | 0 | - | 70 | 0 | 350K XP, 9K pts, 2 Uncommon+ Players | R16: 300 pts / 6K xp; QF: 400 pts / 10K xp; SF: 500 pts / 15K xp; F: 750 pts / 25K xp |

## Parser-Shape für spätere Squad-Checks

```json
{
  "name": "Beginners Cup #5",
  "timeLeft": "3d left",
  "mode": "1V1",
  "requirements": [
    {
      "key": "Retired",
      "value": "0"
    },
    {
      "key": "OVR Max",
      "value": "69"
    },
    {
      "key": "Duplicated Originals",
      "value": "0"
    }
  ],
  "completionReward": [
    "200K XP",
    "4K pts",
    "3 Common+ Players"
  ],
  "rewardsPerRound": [
    {
      "round": "R16",
      "title": "Round of 16",
      "points": "300",
      "xp": "6K xp"
    },
    {
      "round": "QF",
      "title": "Quarter Final",
      "points": "400",
      "xp": "10K xp"
    },
    {
      "round": "SF",
      "title": "Semi Final",
      "points": "500",
      "xp": "15K xp"
    },
    {
      "round": "F",
      "title": "Final",
      "points": "750",
      "xp": "25K xp"
    }
  ]
}
```

## Implementierungsnotizen

- Parser: `src/lib/tournaments/tournament-parser.ts`
- Test-Fixture: `src/lib/tournaments/__fixtures__/goals-tracker-tournaments.html`
- Audit-Script: `scripts/audit-tournaments.mjs`
- Die Tests lesen nur die gespeicherte Fixture. Es gibt keine Live-Netzwerk-Calls in `npm run test`.
- Keine Produktionsintegration und keine App-Runtime-Fetches; das ist bewusst nur Audit-/Parser-Vorarbeit.
