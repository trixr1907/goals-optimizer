import { PlayerWithScores } from '@/lib/scraper/types';
import { LineupSlot } from '@/lib/store/lineup-store';

export interface ShareTextSlotPlayer {
  slot: Pick<LineupSlot, 'position'>;
  player: Pick<PlayerWithScores, 'name' | 'overall' | 'fit_scores'>;
}

export function formatLineupShareText(
  slotPlayers: ShareTextSlotPlayer[],
  hostname = 'goals.ivo-tech.com',
): string {
  const host = hostname.trim() || 'goals.ivo-tech.com';
  const lines = ['🏆 Mein optimierter GOALS Squad'];

  for (const { slot, player } of slotPlayers) {
    const fit = player.fit_scores[slot.position] ?? 0;
    lines.push(`${slot.position}: ${player.name} (OVR: ${player.overall}, Fit: ${fit.toFixed(0)})`);
  }

  lines.push(`Generiert mit ${host}`);
  return lines.join('\n');
}
