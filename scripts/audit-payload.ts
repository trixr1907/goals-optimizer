#!/usr/bin/env node
/**
 * scripts/audit-payload.ts — Sprint B: Goalsverse Payload Field Audit
 * =====================================================================
 * Liest einen gespeicherten rohen Goalsverse-Full-Spieler-Payload
 * und prüft, welche Entwicklungsfelder wirklich geliefert werden.
 *
 * Warum: Live kommen training_value 0/53, xp_next_upgrade 0/53 an.
 * Mögliche Ursachen: Feldname-Mismatch, verschachtelter Key, Null-Payload.
 * Dieses Script zeigt klar was da ist und was fehlt.
 *
 * Nutzung:
 *   npx tsx scripts/audit-payload.ts <raw-payload.json>
 *
 * Den rohen Payload erhält man z.B. mit:
 *   curl -s "https://goalsverse.com/v1/club/<clubId>" > raw-payload.json
 *
 * Oder: Goalsverse-API-Response in goalsverse-client.ts loggen und lokal speichern.
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Typdefinitionen ───────────────────────────────────────────────────────────

interface FieldCheck {
  key: string;
  description: string;
  check: (raw: unknown) => boolean;
  extract: (raw: unknown) => unknown;
}

// ── Erwartete Felder im rohen Goalsverse-Payload ──────────────────────────────

const FIELD_CHECKS: FieldCheck[] = [
  // Alter / Aging
  {
    key: 'current_age',
    description: 'Spieleralter -> player.age / aging.currentAge',
    check: (r: any) => typeof r?.current_age === 'number',
    extract: (r: any) => r?.current_age,
  },
  {
    key: 'max_potential_rating',
    description: 'Potential-Ziel -> aging.targetRating',
    check: (r: any) => typeof r?.max_potential_rating === 'number',
    extract: (r: any) => r?.max_potential_rating,
  },
  {
    key: 'upgrades_remaining',
    description: 'Upgrades verfügbar -> aging.upgradesRemaining',
    check: (r: any) => typeof r?.upgrades_remaining === 'number',
    extract: (r: any) => r?.upgrades_remaining,
  },
  // XP
  {
    key: 'current_xp',
    description: 'Aktuelles XP -> player.xp_current',
    check: (r: any) => typeof r?.current_xp === 'number',
    extract: (r: any) => r?.current_xp,
  },
  // Training Value (das kritische Feld: live 0/53)
  {
    key: 'potential.training_value',
    description: 'Training-Wert 1..8 -> player.training_value [P0-Blocker: 0/53 live]',
    check: (r: any) => typeof r?.potential?.training_value === 'number',
    extract: (r: any) => r?.potential?.training_value,
  },
  // Alternativpfade für training_value (falls umbenannt/verschoben)
  {
    key: 'training_value (top-level alternative)',
    description: 'Alternativpfad: r.training_value direkt',
    check: (r: any) => typeof r?.training_value === 'number',
    extract: (r: any) => r?.training_value,
  },
  {
    key: 'potential (ganzes Objekt)',
    description: 'Gesamtes potential-Objekt zum Inspizieren',
    check: (r: any) => r?.potential != null,
    extract: (r: any) => r?.potential,
  },
  // Upgrade-ROI (P1 — oft noch nicht gemappt)
  {
    key: 'xp_next_upgrade',
    description: 'XP bis nächstes Upgrade -> player.xp_next_upgrade [P1]',
    check: (r: any) => typeof r?.xp_next_upgrade === 'number',
    extract: (r: any) => r?.xp_next_upgrade,
  },
  {
    key: 'upgrade_count',
    description: 'Anzahl bisheriger Upgrades -> player.upgrade_count [P1]',
    check: (r: any) => typeof r?.upgrade_count === 'number',
    extract: (r: any) => r?.upgrade_count,
  },
  // Grundfelder (sollten immer da sein)
  {
    key: 'overall',
    description: 'OVR der equipped card',
    check: (r: any) => typeof r?.overall === 'number',
    extract: (r: any) => r?.overall,
  },
  {
    key: 'ovr_roles',
    description: 'Per-Position-Ratings -> roleRatings',
    check: (r: any) => Array.isArray(r?.ovr_roles),
    extract: (r: any) => Array.isArray(r?.ovr_roles) ? `[${r.ovr_roles.length} entries]` : undefined,
  },
];

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function colorGreen(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function colorRed(s: string)   { return `\x1b[31m${s}\x1b[0m`; }
function colorYellow(s: string){ return `\x1b[33m${s}\x1b[0m`; }
function colorBold(s: string)  { return `\x1b[1m${s}\x1b[0m`; }

function auditPlayer(raw: unknown, index: number, name?: string): void {
  const label = name ?? `Spieler[${index}]`;
  console.log(`\n${colorBold(`── ${label} ──`)}`);

  const present: string[] = [];
  const missing: string[] = [];

  for (const field of FIELD_CHECKS) {
    const ok = field.check(raw);
    const val = field.extract(raw);
    const status = ok ? colorGreen('✓') : colorRed('✗');
    const valStr = val !== undefined && val !== null ? `= ${JSON.stringify(val)}` : '';
    console.log(`  ${status} ${field.key.padEnd(40)} ${valStr}`);
    if (!ok && field.description.includes('[P0') || !ok && field.description.includes('Training-Wert')) {
      console.log(`     ${colorYellow('!')} ${field.description}`);
    }
    if (ok) present.push(field.key);
    else missing.push(field.key);
  }

  console.log(`\n  Vorhanden: ${colorGreen(present.length.toString())}/${FIELD_CHECKS.length}`);
  if (missing.length > 0) {
    console.log(`  Fehlend:   ${colorRed(missing.join(', '))}`);
  }
}

// ── Hauptprogramm ─────────────────────────────────────────────────────────────

function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    // Demo-Modus: zeige Beispiel-Analyse mit einem fiktiven Payload
    console.log(colorBold('\nGoalsverse Payload Field Audit — Demo-Modus'));
    console.log('Nutzung: npx tsx scripts/audit-payload.ts <raw-payload.json>\n');

    const demoPayloads = [
      {
        name: 'Full Player (mit training_value)',
        raw: {
          name: 'Test Spieler A',
          overall: 75,
          current_age: 22,
          max_potential_rating: 82,
          upgrades_remaining: 2,
          current_xp: 500000,
          ovr_roles: [{ role: 'CM', overall: 75 }],
          potential: { training_value: 6 },
        },
      },
      {
        name: 'Live-Realität (kein training_value, kein xp_next_upgrade)',
        raw: {
          name: 'Test Spieler B',
          overall: 72,
          current_age: 21,
          max_potential_rating: 73,
          upgrades_remaining: 1,
          current_xp: 255142,
          ovr_roles: [{ role: 'FB', overall: 72 }],
          potential: null,  // <- das ist der P0-Blocker
        },
      },
      {
        name: 'Basic Player (nur OVR)',
        raw: {
          name: 'Test Spieler C',
          overall: 55,
          ovr_roles: [{ role: 'AM', overall: 55 }],
        },
      },
    ];

    for (let i = 0; i < demoPayloads.length; i++) {
      auditPlayer(demoPayloads[i].raw, i, demoPayloads[i].name);
    }

    console.log(`\n${colorBold('Fazit Demo:')}`);
    console.log('  Wenn potential=null oder potential.training_value nicht existiert,');
    console.log('  landet training_value=undefined im Player-Objekt (korrekt).');
    console.log('  Das erklärt 0/53 live: Die Mehrzahl der Spieler hat kein potential-Objekt');
    console.log('  oder potential ist null in der API-Response.\n');
    return;
  }

  // Datei-Modus
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(colorRed(`Datei nicht gefunden: ${absPath}`));
    process.exit(1);
  }

  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(absPath, 'utf-8'));
  } catch (e) {
    console.error(colorRed(`JSON-Parsing-Fehler: ${e}`));
    process.exit(1);
  }

  console.log(colorBold(`\nGoalsverse Payload Field Audit`));
  console.log(`Datei: ${absPath}\n`);

  // Unterstütze: einzelner Spieler, Array von Spielern, oder squad-Wrapper
  let players: unknown[];
  if (Array.isArray(data)) {
    players = data;
  } else if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    // squad-Wrapper aus RSC-Payload
    if (Array.isArray(obj['players'])) {
      players = obj['players'] as unknown[];
    } else if (Array.isArray(obj['squad'])) {
      players = obj['squad'] as unknown[];
    } else {
      // Einzelner Spieler
      players = [data];
    }
  } else {
    console.error(colorRed('Unbekanntes Payload-Format.'));
    process.exit(1);
  }

  console.log(`${players.length} Spieler im Payload\n`);

  // Erste 5 Spieler im Detail
  const sample = players.slice(0, 5);
  for (let i = 0; i < sample.length; i++) {
    const raw = sample[i] as any;
    auditPlayer(raw, i, raw?.name ?? raw?.player_name ?? undefined);
  }

  // Aggregate über alle Spieler
  console.log(colorBold('\n── Aggregat über alle Spieler ──'));
  const counts: Record<string, number> = {};
  for (const field of FIELD_CHECKS) {
    counts[field.key] = 0;
  }
  for (const raw of players) {
    for (const field of FIELD_CHECKS) {
      if (field.check(raw)) counts[field.key]++;
    }
  }
  for (const field of FIELD_CHECKS) {
    const count = counts[field.key];
    const ratio = `${count}/${players.length}`;
    const color = count === players.length ? colorGreen : count > 0 ? colorYellow : colorRed;
    console.log(`  ${color(ratio.padEnd(8))} ${field.key}`);
  }

  console.log('\nFertig.\n');
}

main();
