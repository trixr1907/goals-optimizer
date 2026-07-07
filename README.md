# GOALS Optimizer

> **⚠️ Unofficial community tool** — created by [ivo-tech](https://ivo-tech.com) / trixr1907.
> Not affiliated with, endorsed by, or connected to the Goals developers (GOALS AB).

A player-focused squad optimizer for GOALS.

The app helps active GOALS players import their club, understand player fit, build stronger lineups, compare matchups, and track development priorities.

Live app: https://goals.ivo-tech.com/

## Features

- Club import from community GOALS data sources
- Squad overview with filters, player links, fit scores, and stat summaries
- Formation optimizer with pitch view and lineup persistence
- Matchup analysis against another club
- Development view for playtime, XP estimates, potential, and upgrade history
- Mobile-friendly squad and decision views

## Tech stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Zustand with localStorage persistence
- Vercel deployment

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Verification

```bash
npm run lint
npm run build
```

## Deployment

Production is deployed through Vercel from the `main` branch.

## Notes

GOALS data availability depends on external community sources. Some players may only have basic roster data when detailed match/stat data is not exposed by the source.

This project does not use official GOALS assets without permission and does not provide botting,
account-sharing, exploit, or account-automation features.
