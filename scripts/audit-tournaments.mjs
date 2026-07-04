#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const fixturePath = path.join(root, 'src/lib/tournaments/__fixtures__/goals-tracker-tournaments.html');
const reportPath = path.join(root, 'docs/tournament-requirements-audit.md');
const sourceUrl = 'https://goals-tracker.com/tournaments';

function cleanText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function compactRewardText(text) {
  return cleanText(text)
    .replace(/(\d+(?:\.\d+)?K?)\s+(XP|pts)/gi, '$1 $2')
    .replace(/\s+/g, ' ');
}

function parseTournaments(html) {
  const $ = cheerio.load(html);

  return $('section')
    .toArray()
    .map((section) => {
      const $section = $(section);
      const name = cleanText($section.find('h2').first().text());
      if (!name) return null;

      const requirements = [];
      const $requirementsHeading = $section.find('p').filter((_, el) => cleanText($(el).text()) === 'Squad requirements').first();
      $requirementsHeading.next('div').children('div').each((_, row) => {
        const spans = $(row).find('span').toArray().map((span) => cleanText($(span).text())).filter(Boolean);
        if (spans.length >= 2) requirements.push({ key: spans[0], value: spans[spans.length - 1] });
      });

      const completionReward = [];
      const $completionHeading = $section.find('p').filter((_, el) => cleanText($(el).text()) === 'Completion reward').first();
      $completionHeading.next('div').children().each((_, item) => {
        const text = compactRewardText($(item).text());
        if (text) completionReward.push(text);
      });

      const rewardsPerRound = [];
      const $roundHeading = $section.find('p').filter((_, el) => cleanText($(el).text()) === 'Rewards per round').first();
      $roundHeading.next('div').children('div').each((_, item) => {
        const $item = $(item);
        const spans = $item.find('span').toArray().map((span) => cleanText($(span).text())).filter(Boolean);
        if (spans.length > 0) {
          rewardsPerRound.push({
            round: spans[0],
            title: $item.attr('title') || undefined,
            points: spans[1],
            xp: spans[2]?.replace(/\s+/g, ' '),
          });
        }
      });

      return {
        name,
        timeLeft: cleanText($section.find('.absolute.left-3.top-3').first().text()) || null,
        mode: cleanText($section.find('.absolute.right-3.top-3').first().text()) || null,
        requirements,
        completionReward,
        rewardsPerRound,
      };
    })
    .filter(Boolean);
}

function table(rows, headers) {
  const escapeCell = (value) => String(value ?? '').replace(/\|/g, '\\|');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${headers.map((header) => escapeCell(row[header])).join(' | ')} |`),
  ].join('\n');
}

function buildReport(tournaments) {
  const requirementKeys = Array.from(new Set(tournaments.flatMap((tournament) => tournament.requirements.map((requirement) => requirement.key)))).sort();
  const summaryRows = tournaments.map((tournament) => {
    const requirementRecord = Object.fromEntries(tournament.requirements.map((requirement) => [requirement.key, requirement.value]));
    return {
      Tournament: tournament.name,
      'Time left': tournament.timeLeft ?? '-',
      Mode: tournament.mode ?? '-',
      ...Object.fromEntries(requirementKeys.map((key) => [key, requirementRecord[key] ?? '-'])),
      'Completion reward': tournament.completionReward.join(', ') || '-',
      'Round rewards': tournament.rewardsPerRound.map((reward) => `${reward.round}: ${reward.points ?? '?'} pts / ${reward.xp ?? '? xp'}`).join('; ') || '-',
    };
  });

  const headers = ['Tournament', 'Time left', 'Mode', ...requirementKeys, 'Completion reward', 'Round rewards'];
  const jsonExample = tournaments[0] ? JSON.stringify(tournaments[0], null, 2) : '{}';

  return `# Tournament Requirements Audit\n\n` +
    `Quelle: ${sourceUrl}\n\n` +
    `Stand: ${new Date().toISOString().slice(0, 10)}\n\n` +
    `## Kurzfazit\n\n` +
    `GOALS Tracker rendert die Turnierkarten serverseitig genug, um ohne Browser-Automation die aktuell sichtbaren Turnierdaten aus HTML zu lesen. Sichtbar sind Name, Restzeit, Modus, Squad-Requirements, Completion-Rewards und kompakte Rewards pro Runde. Für spätere Squad-Checks reicht die Requirements-Struktur als flexible Key/Value-Liste; harte Semantik wie OVR Max/Min sollte erst im nächsten Schritt normalisiert werden.\n\n` +
    `## Gefundene Requirements\n\n` +
    `${requirementKeys.map((key) => `- ${key}`).join('\n')}\n\n` +
    `## Aktuell extrahierte Turniere\n\n` +
    `${table(summaryRows, headers)}\n\n` +
    `## Parser-Shape für spätere Squad-Checks\n\n` +
    `\`\`\`json\n${jsonExample}\n\`\`\`\n\n` +
    `## Implementierungsnotizen\n\n` +
    `- Parser: \`src/lib/tournaments/tournament-parser.ts\`\n` +
    `- Test-Fixture: \`src/lib/tournaments/__fixtures__/goals-tracker-tournaments.html\`\n` +
    `- Audit-Script: \`scripts/audit-tournaments.mjs\`\n` +
    `- Die Tests lesen nur die gespeicherte Fixture. Es gibt keine Live-Netzwerk-Calls in \`npm run test\`.\n` +
    `- Keine Produktionsintegration und keine App-Runtime-Fetches; das ist bewusst nur Audit-/Parser-Vorarbeit.\n`;
}

const html = await readFile(fixturePath, 'utf8');
const tournaments = parseTournaments(html);
await writeFile(reportPath, buildReport(tournaments));
console.log(`Parsed ${tournaments.length} tournaments from ${path.relative(root, fixturePath)}`);
console.log(`Wrote ${path.relative(root, reportPath)}`);
