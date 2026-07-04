/**
 * Unit tests for lineup-store helper actions.
 *
 * We test the pure store logic (purgeOrphanedAssignments, clearLineup) in
 * isolation using the real Zustand store — no DOM / localStorage required
 * because Vitest runs in Node and Zustand works fine without persistence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useLineupStore } from './lineup-store';
import type { LineupSlot } from './lineup-store';

// ── helpers ──────────────────────────────────────────────────────────────────

const SLOTS: LineupSlot[] = [
  { position: 'GK', x: 50, y: 90 },
  { position: 'CB', x: 30, y: 70 },
  { position: 'CB', x: 70, y: 70 },
  { position: 'CM', x: 50, y: 50 },
  { position: 'ST', x: 50, y: 15 },
];

function slotKey(pos: string, idx: number) {
  return `${pos}-${idx}`;
}

// Reset store state before each test so tests are independent.
beforeEach(() => {
  const { setFormation } = useLineupStore.getState();
  setFormation('4-3-3', SLOTS);
  // Reset locked to empty
  useLineupStore.setState({ locked: new Set() });
});

// ── purgeOrphanedAssignments ──────────────────────────────────────────────────

describe('purgeOrphanedAssignments', () => {
  it('removes slot assignments whose playerIds are not in knownIds', () => {
    const { assignPlayer, purgeOrphanedAssignments } = useLineupStore.getState();

    // Assign players: p1 stays, p2 is "old club" player
    assignPlayer(slotKey('GK', 0), 'p1');
    assignPlayer(slotKey('CB', 1), 'p2-old');
    assignPlayer(slotKey('CM', 3), 'p3');

    // Only p1 and p3 are still in the squad
    purgeOrphanedAssignments(new Set(['p1', 'p3']));

    const { lineup } = useLineupStore.getState();
    expect(lineup[slotKey('GK', 0)]).toBe('p1');     // kept
    expect(lineup[slotKey('CB', 1)]).toBeNull();       // purged
    expect(lineup[slotKey('CM', 3)]).toBe('p3');      // kept
  });

  it('also removes the lock on a purged slot', () => {
    const { assignPlayer, toggleLock, purgeOrphanedAssignments } = useLineupStore.getState();

    assignPlayer(slotKey('ST', 4), 'p-locked-old');
    toggleLock(slotKey('ST', 4));

    // Verify locked before purge
    expect(useLineupStore.getState().locked.has(slotKey('ST', 4))).toBe(true);

    purgeOrphanedAssignments(new Set(['p1'])); // p-locked-old not in set

    const { lineup, locked } = useLineupStore.getState();
    expect(lineup[slotKey('ST', 4)]).toBeNull();
    expect(locked.has(slotKey('ST', 4))).toBe(false);
  });

  it('does nothing when all players are still known', () => {
    const { assignPlayer, purgeOrphanedAssignments } = useLineupStore.getState();

    assignPlayer(slotKey('GK', 0), 'p1');
    assignPlayer(slotKey('CB', 1), 'p2');
    const before = { ...useLineupStore.getState().lineup };

    purgeOrphanedAssignments(new Set(['p1', 'p2']));

    expect(useLineupStore.getState().lineup).toEqual(before);
  });

  it('treats empty knownIds as club switch — purges every assignment', () => {
    const { assignPlayer, purgeOrphanedAssignments } = useLineupStore.getState();

    assignPlayer(slotKey('GK', 0), 'demo-1');
    assignPlayer(slotKey('CB', 1), 'demo-2');

    purgeOrphanedAssignments(new Set());

    const { lineup } = useLineupStore.getState();
    for (const val of Object.values(lineup)) {
      expect(val).toBeNull();
    }
  });
});

// ── clearLineup ───────────────────────────────────────────────────────────────

describe('clearLineup', () => {
  it('nulls every assignment and empties locked without changing formation/slots', () => {
    const { assignPlayer, toggleLock, clearLineup } = useLineupStore.getState();

    assignPlayer(slotKey('GK', 0), 'x');
    assignPlayer(slotKey('ST', 4), 'y');
    toggleLock(slotKey('GK', 0));

    clearLineup();

    const { lineup, locked, formation, slots } = useLineupStore.getState();
    expect(Object.values(lineup).every((v) => v === null)).toBe(true);
    expect(locked.size).toBe(0);
    expect(formation).toBe('4-3-3');
    expect(slots).toHaveLength(SLOTS.length);
  });
});
