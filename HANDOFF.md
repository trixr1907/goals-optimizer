# GOALS Squad Optimizer — Handoff

Stand: 2026-07-02
Ziel-URL: Unterseite `/goals` auf ivo-tech.com, nicht als Root-App erreichbar.

## Projekt

- Pfad: `/home/ivo/projects/goals-optimizer`
- Framework: Next.js 14 App Router, TypeScript, Tailwind, Zustand/localStorage
- Runtime: Vercel/Node, weil Live-Import API-Routen benötigt
- Base Path: `/goals`
- Wichtige Config: `next.config.js`
  - `basePath = '/goals'`
  - `NEXT_PUBLIC_BASE_PATH = '/goals'`

## Aktueller Funktionsumfang

- Kaderimport über goalsverse Live-Daten
- Suche/Resolver über `https://goalsverse.com/api/v1/search?query=...`
- Unterstützte Accountnamen mit Sonderzeichen:
  - `txr'`
  - `xJuiceWrld999-`
- Direkt-Import per goalsverse URL/UUID ebenfalls möglich
- Demo-Modus über Eingabe `demo`
- Kaderansicht mit OVR, Stats, Fit-Score, Radar-Chart
- Formation/Lineup Optimizer
- Alternatives/Variants
- Meta Center mit Live-Formation-Meta
- Development Center
- OCR-Seite existiert als Fallback/Lab, ist aktuell nicht Produktfokus

## Warum Vercel-Rewrite statt statisch in Vite kopieren?

Die App braucht API-Routen:

- `/goals/api/import`
- `/goals/api/meta`
- `/goals/api/ocr/frame`

Ein statischer Export ins Portfolio-`dist/` würde den Live-Import brechen. Deshalb wird die Next-App separat deployt und die Hauptseite routet `/goals/:path*` dorthin.

## Wichtige Dateien

- `src/lib/scraper/goalsverse-client.ts`
  - goalsverse Account-Suche
  - Sonderzeichen-/Plattform-Matching
  - Squad-Parser
  - GOALS-Positionsmapping
- `src/app/api/import/route.ts`
  - Import API, kein stiller Mock-Fallback mehr
- `src/lib/app-url.ts`
  - Prefix-Helfer für `/goals` API-/Anchor-Pfade
- `next.config.js`
  - BasePath `/goals`
- `src/app/page.tsx`
  - Start/Import UI

## goalsverse Import Details

Resolver-Reihenfolge:

1. Direkte UUID/URL/Pfad erkennen
2. Sonst `GET /api/v1/search?query=<input>`
3. Exakter Match gegen:
   - `username`
   - `external_platforms.steam.persona_name`
   - `external_platforms.playstation.online_id`
   - `external_platforms.xbox.gamertag`
   - `external_platforms.epic.display_name`
4. Danach Profilseite `/v1/club/<userId>` laden
5. `Current squad` aus HTML-Text parsen

Getestete Accounts:

- `txr'`
  - source: `goalsverse`
  - count: 18
  - erste Spieler: Paez GK 94, Pietsch RB 92, Anthony CB 66
- `xJuiceWrld999-`
  - source: `goalsverse`
  - count: 18
  - erste Spieler: Williamson GK 94, Mir CB 87, Steinert CB 90

## Bekannte Einschränkungen

- goalsverse ist keine offizielle API. HTML-Struktur kann brechen.
- Positionsmapping ist pragmatisch:
  - `FB` -> RB/LB alternierend
  - `WB` -> RWB/LWB alternierend
  - `WM` -> RM/LM alternierend
  - `WF` -> RW/LW alternierend
  - `DM` -> CDM
  - `AM` -> CAM
- OCR ist nicht priorisiert und ohne `OPENAI_API_KEY` nur manueller Fallback.
- `npm run lint` hat eine bewusste Warnung wegen `<img>` in OCR Preview.

## Verifikation zuletzt erfolgreich

Im Projektpfad `/home/ivo/projects/goals-optimizer`:

```bash
./node_modules/.bin/tsc --noEmit
npm run lint
npm run build
```

Zusätzlich lokal mit Dev-Server:

```bash
npm run dev -- --port 3002
```

Checks:

- `GET http://localhost:3002/` -> 404
- `GET http://localhost:3002/goals` -> 200
- `POST http://localhost:3002/goals/api/import` mit `{ "clubName": "txr'" }` -> 200, 18 Spieler

## Deployment-Architektur

1. GOALS-App als eigenes Vercel-Projekt deployen.
2. In `/home/ivo/projects/webseite/vercel.json` Rewrite ergänzen:

```json
{
  "source": "/goals/:path*",
  "destination": "https://<goals-vercel-domain>/goals/:path*"
}
```

3. Hauptseite `/home/ivo/projects/webseite` neu deployen.

## Falls Import online nicht geht

- Prüfen, ob Rewrite auch API-Pfade routed:
  - `/goals/api/import`
- Prüfen, ob `NEXT_PUBLIC_BASE_PATH=/goals` im GOALS-Build aktiv war.
- Prüfen, ob goalsverse erreichbar ist.
- Testcurl:

```bash
curl -s -X POST https://ivo-tech.com/goals/api/import \
  -H 'Content-Type: application/json' \
  -d '{"clubName":"txr'"'"'"'}'
```
