# GOALS Optimizer — End-to-End Smoke & Polish Audit

Stand: 2026-07-04  
Scope: lokaler Dev-Server `http://localhost:3010`, keine Codeänderungen, keine Scraper-/Import-Refactors, keine Source-Transparency UI.

## Kurzfazit

Der GOALS Optimizer läuft im Desktop-Nutzerflow grundsätzlich rund: Imports funktionieren, Squad-Seite inklusive Kaderanalyse/Filter/Suche ist nutzbar, Lineup-Optimizer/Formationsauswahl/Auto-Fill/TacticsPanel/Tactical Settings funktionieren, Development/Meta/Matchup laden ohne Runtime-Fehler.

Zwei wichtige Polish-/Flow-Punkte sind aufgefallen:

1. Der sichtbare Import-Button reagierte im Browser-Smoke nicht zuverlässig auf normalen Tool-Klick/Enter, obwohl die lokale Import-API korrekt funktioniert. Das sollte man im echten Browser gegenprüfen.
2. Auf Mobile ist die Lineup-Seite sehr dicht. Navigation und Controls sind sichtbar, aber TacticsPanel/Tactical Settings erscheinen erst nach Auto-Fill und sind bei leerer Lineup nicht im mobilen Erstflow sichtbar. Kein Blocker, aber ein klares Polish-Thema.

## Testumgebung

- Repo: `/home/ivo/projects/goals-optimizer`
- Branch: `main`
- Dev-Server: `NEXT_PUBLIC_BASE_PATH="" npm run dev -- --hostname 0.0.0.0 --port 3010`
- Lokale API: `POST http://localhost:3010/api/import`
- Browser-Runtime: Hermes Browser + Playwright Chromium für Mobile-Smoke
- Erlaubte Import-Bodies: `demo`, `txr'`, `xJuiceWrld999-`

## Verifizierte Importflows

| Flow | Ergebnis | Dauer lokal | Spieler | Hinweise |
|---|---:|---:|---:|---|
| `demo` | HTTP 200 | 264 ms | 15 | Demo-Kader lädt sauber, `source: demo` |
| `txr'` | HTTP 200 | 2606 ms | 18 | `positionSource: goals-tracker` für alle 18, keine Warnings |
| `xJuiceWrld999-` | HTTP 200 | 3515 ms | 21 | `positionSource: goals-tracker` für alle 21, keine Warnings |

API-Smoke-Ausgabe:

```json
{"clubName":"demo","status":200,"ms":264,"count":15,"source":"demo","first":"Neuer","last":"Tel","positionSources":{"none":15},"warnings":0,"error":"Demo-Kader geladen."}
{"clubName":"txr'","status":200,"ms":2606,"count":18,"source":"goalsverse","resolved":"txr'","first":"Mariadel Paez","last":"Nico da Cunha","positionSources":{"goals-tracker":18},"warnings":0,"error":null}
{"clubName":"xJuiceWrld999-","status":200,"ms":3515,"count":21,"source":"goalsverse","resolved":"xJuiceWrld999-","first":"Faye Williamson","last":"Carmelo Ferrari","positionSources":{"goals-tracker":21},"warnings":0,"error":null}
```

## Flow-Prüfung

### 1. Demo importieren

Bestätigt über lokale API:

- `POST /api/import {"clubName":"demo"}` liefert HTTP 200.
- 15 Demo-Spieler werden zurückgegeben.
- Demo-Spieler werden erwartbar ohne `positionSource` geliefert, weil es Mock-Daten sind.

UI-Hinweis:

- Der Import-Screen rendert korrekt.
- Der Button wird nach Texteingabe sichtbar enabled.
- Im Browser-Smoke hat normaler `click`/Enter über das Tool keinen Redirect/Import ausgelöst. Da API und React-Seite ansonsten laufen, ist das ein Kandidat für echte Browser-Gegenprobe statt sofortiger Fix.

### 2. `txr'` importieren

Bestätigt:

- HTTP 200, 18 Spieler.
- Alle 18 Spieler mit `positionSource: goals-tracker`.
- Keine `sourceWarnings`.
- Persistierter Kader wurde im Browser gesetzt und Seiten nutzen ihn korrekt.

### 3. `xJuiceWrld999-` importieren

Bestätigt:

- HTTP 200, 21 Spieler.
- Alle 21 Spieler mit `positionSource: goals-tracker`.
- Keine `sourceWarnings`.
- Squad-Seite zeigt Clubnamen, Stats, Kaderanalyse und Tabelleninhalt korrekt.

### 4. Squad-Seite

Bestätigt mit `txr'` und `xJuiceWrld999-`:

- Kaderliste rendert.
- Summary-Karten zeigen Spielerzahl, Ø OVR, Ø Meta, Ø Alter, Upgrades, Rarity-Mix.
- Kaderanalyse rendert Stärken, Baustellen/Empfehlungen, Schlüsselspieler.
- Filter/Suche vorhanden und funktional.
- Suche nach `Jones` reduzierte `txr'` korrekt auf 1 Treffer: Jonathan Jones, Position AM, OVR 81.
- Player-Links/Details/Chart-Buttons sind sichtbar.

Polish-Beobachtung:

- In der Accessibility-/Text-Snapshot-Ausgabe erscheinen Namen in Tabellenzellen doppelt (`Jonathan Jones Jonathan Jones`, `Kerri Leary Kerri Leary`). Visuell kann das durch Avatar-alt plus Text kommen und muss nicht doppelt sichtbar sein. Für Screenreader/Accessibility wäre das aber ein P2-Kandidat.

### 5. Lineup-Seite

Bestätigt:

- Formationsauswahl enthält alle 14 modellierten GOALS-Formationen:
  - 4-4-2
  - 4-2-3-1
  - 4-3-3
  - 4-3-3 Attack
  - 4-3-3 Defense
  - 4-1-2-1-2
  - 4-3-1-2
  - 4-2-2-2
  - 4-4-1-1
  - 3-5-2
  - 3-4-3
  - 3-4-2-1
  - 5-2-1-2
  - 5-2-3
- Wechsel auf `4-2-3-1` aktualisierte Header/Subline.
- Auto-Fill füllt 11/11 Slots.
- Teilen-Button wird nach gefüllter Lineup aktiv.
- Formation Optimizer zeigt Top-3 Empfehlungen.
- Varianten-Auswahl (`Ausgewogen`, `Offensiv`, `Defensiv`, `Gegen-Meta`) sichtbar.
- TacticsPanel rendert nach gefüllter Lineup.
- Tactical Settings sichtbar:
  - Defensive Depth
  - Build Up Play
  - Lineup-Status
  - Player Rules
  - Taktik-Tipps

Desktop Drag & Drop:

- Playwright-Drag wurde ausgeführt, Lineup blieb konsistent mit 11 Spielern.
- Nach Drag wurde der gedroppte Spieler im Zielslot sichtbar und TacticsPanel aktualisierte sich.
- Tool-Ausgabe enthielt eine dnd-kit Debug-Zeile `Draggable item ... was dropped over droppable area ...`; keine Runtime-Fehler.

Desktop-Layout:

- Nach Schließen des Onboarding-Modals sind Sidebar, Formation-Controls, Auto-Fill, Leeren, Teilen, Optimizer und Varianten sichtbar.
- Pitch beginnt im sichtbaren Bereich, Bank/Tactics liegen weiter unten. Das ist nutzbar, aber auf kleineren Viewports scroll-lastig.

### 6. Development-Seite

Bestätigt:

- Seite lädt mit persistiertem `txr'`-Kader.
- Summary-Karten sichtbar: Spieler, Spielzeit getrackt, Aging-Daten, Sofort spielen, Trainingskandidaten, Austauschkandidaten.
- Suche, Positionsfilter und Sortierung sichtbar.
- Spieler-Cards rendern GK/Feldspieler-Stats getrennt.
- Upgrade-Verlauf, Status-Select und Notizfeld sichtbar.
- Keine Runtime-Fehler im Smoke.

### 7. Matchup/Meta-Seiten

Matchup:

- Seite lädt.
- Eingabe `Gegner-ID oder Club-Name...` und Button `Analysieren` sichtbar.
- Kein Fehler im initialen Load.

Meta:

- Seite lädt mit persistiertem Kader.
- Meta Center zeigt Formation-Ranking, Beste Empfehlung, Live-Meta-Kontext und Apply-Buttons.
- Copy bleibt ehrlich: Ranking basiert auf aktuellem Squad; Live-Meta nur Kontext.

### 8. Mobile

Playwright iPhone-13-Smoke:

Bestätigt:

- Mobile Top Header sichtbar.
- Mobile Bottom Nav sichtbar mit: Import, Kader, Lineup, Dev, Matchup.
- Desktop-Sidebar ist auf Mobile ausgeblendet.
- Lineup Controls sind sichtbar:
  - Formation-Select
  - Auto-Fill
  - Leeren
  - Teilen
  - Variantenbuttons
- Pitch und Bank werden angezeigt.
- Keine Playwright `pageerror`/console-error im Mobile-Smoke.

Polish-Beobachtungen:

- `main` hat auf Mobile nur `padding-bottom: 16px`, obwohl die fixed Bottom-Nav darüberliegt. Das kann am unteren Seitenende Elemente verdecken.
- Mobile-Lineup ist sehr dicht: Der Pitch zeigt initial leere Slots und die gesamte Bank darunter; TacticsPanel ist erst nach Auto-Fill sichtbar und liegt weiter unten.
- Im Playwright-Mobile-Check war nach `window.scrollTo(0, document.body.scrollHeight)` `scrollY` weiterhin `0` bei `max: 100`; das deutet auf scrollbares Element/Viewport-Sonderfall hin. Im realen Browser sollte Mobile-Scroll gezielt gegengeprüft werden.

### 9. LocalStorage: alter Kader, Clear Squad, Re-Import

Bestätigt:

- Persistierter `txr'`-Kader wurde aus LocalStorage auf mehreren Routen geladen.
- `Wechseln`/Clear Squad setzt `players: []`, `clubName: ''`, `clubId: undefined`, `lastImportedAt: null`.
- Danach war der Import-Screen wieder sichtbar.
- Re-Import/Neuimport von `xJuiceWrld999-` nach Clear Squad funktionierte über lokale API und persistierten Store; Squad-Seite zeigte 21 Spieler.

Polish-Beobachtung:

- `clearSquad()` löscht `clubUrl` nicht. Im Store blieb nach Clear Squad noch `clubUrl: "https://goalsverse.com/p/txr"`, obwohl Spieler/Clubname geleert waren. Das ist aktuell nicht sichtbar kritisch, aber technisch inkonsistent.

## Bugs nach Priorität

### P0 broken

Keine P0-Blocker gefunden.

### P1 important

1. Import-Button/Enter im Browser-Smoke nicht zuverlässig ausgelöst
   - Bereich: `src/app/page.tsx`
   - Beobachtung: Nach Texteingabe `demo` war der Button enabled, aber normaler Tool-Klick/Enter führte nicht zu Import/Redirect; LocalStorage blieb leer. Die API funktioniert parallel korrekt.
   - Risiko: Wenn das in echtem Browser reproduzierbar ist, ist der Haupt-Onboarding-Flow gebrochen.
   - Empfehlung: Im echten Firefox/Chrome einmal manuell gegenprüfen. Falls reproduzierbar: gezielt Button/Form-Handling fixen. Keine Scraper-Änderung nötig.

2. Mobile Bottom-Nav kann unteren Content verdecken
   - Bereich: Layout/Pages mit `Sidebar`, insbesondere `lineup/page.tsx`
   - Beobachtung: Mobile Bottom-Nav ist fixed, `main` hat nur `pb-4`/16px. Bei langen Seiten kann der letzte Content hinter der Nav enden.
   - Risiko: Wichtige Buttons/letzte TacticsPanel-Elemente schwer erreichbar.
   - Empfehlung: Kleine UI-Fix-Rückfrage: mobile `main`/global content bottom padding auf ca. `pb-20` oder Safe-Area-aware Spacing erhöhen.

### P2 polish

1. Clear Squad lässt `clubUrl` im persisted Store stehen
   - Bereich: `src/lib/store/squad-store.ts`
   - Beobachtung: Nach `clearSquad()` bleibt `clubUrl` erhalten.
   - Impact: Aktuell eher intern/debug, kann aber bei zukünftiger UI zu stale Link führen.
   - Minimalfix nach Rückfrage: `clearSquad: () => set({ players: [], clubName: '', clubId: undefined, clubUrl: undefined, lastImportedAt: null })`.

2. Mobile-Lineup ist sehr dicht / Tactics weit unten
   - Bereich: `src/app/lineup/page.tsx`
   - Beobachtung: Formation Optimizer + Varianten + Pitch + Bank nehmen auf Mobile viel vertikalen Raum ein. Tactical Settings sind nicht schnell erreichbar.
   - Empfehlung: Kein großer Sprint. Später evtl. mobile Collapsible für Optimizer oder Tactics Quick Anchor.

3. Accessibility-Snapshot zeigt doppelte Spielernamen in Tabellenzellen
   - Bereich: Squad Table/Avatar alt text
   - Beobachtung: Zellen erscheinen als `Name Name` im Accessibility-Tree, vermutlich Bild-alt plus sichtbarer Name.
   - Empfehlung: Falls visuell nicht doppelt: Avatar in Tabellen ggf. `alt=""`/`aria-hidden` setzen, damit Screenreader nicht doppelt lesen.

4. Onboarding-Modal erscheint auch bei direktem Lineup-Load über persistierten Kader
   - Bereich: Onboarding/Welcome Overlay
   - Beobachtung: Beim ersten Besuch von `/lineup` lag das Welcome-Modal über dem eigentlichen Flow.
   - Impact: Nicht kaputt, aber nach einem Import/Deep-Link kann es den direkten Arbeitsfluss unterbrechen.
   - Empfehlung: Nur prüfen, ob das beabsichtigt ist. Kein Fix ohne Rückfrage.

## Nicht gemacht

- Keine Codeänderungen.
- Keine Scraper-/Import-Refactors.
- Keine Source-Transparency UI.
- Kein Commit/Push.

## Validierung

Wird nach Berichtserstellung ausgeführt:

- `npm run test`
- `npm run lint`
- `npm run build`
