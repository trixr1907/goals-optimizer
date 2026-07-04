import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Position } from '@/lib/scraper/types';

export interface LineupSlot {
  position: Position;
  x: number;
  y: number;
}

interface LineupState {
  formation: string;
  slots: LineupSlot[];
  lineup: Record<string, string | null>;
  locked: Set<string>;
  setFormation: (name: string, slots: LineupSlot[]) => void;
  assignPlayer: (slotKey: string, playerId: string | null) => void;
  toggleLock: (slotKey: string) => void;
  autoFill: (assignments: Record<string, string | null>) => void;
  /** Atomically set formation + initial player assignments in one store update */
  setFormationWithLineup: (name: string, slots: LineupSlot[], assignments: Record<string, string | null>) => void;
  clearLineup: () => void;
  /**
   * Remove any assignment whose playerId is not in knownIds.
   * Used after a cross-club import to drop stale orphaned player IDs
   * without wiping the entire lineup when the same club is re-imported.
   */
  purgeOrphanedAssignments: (knownIds: Set<string>) => void;
}

// Set is not JSON-serializable — persist stores locked as string[] and revives it
function reviveSet(raw: unknown): Set<string> {
  if (Array.isArray(raw)) return new Set<string>(raw as string[]);
  if (raw instanceof Set) return raw;
  return new Set<string>();
}

export const useLineupStore = create<LineupState>()(
  persist(
    (set) => ({
      formation: '4-3-3',
      slots: [],
      lineup: {},
      locked: new Set(),

      setFormation: (name, slots) => {
        const lineup: Record<string, string | null> = {};
        slots.forEach((s, i) => {
          lineup[`${s.position}-${i}`] = null;
        });
        set({ formation: name, slots, lineup, locked: new Set() });
      },

      assignPlayer: (slotKey, playerId) =>
        set((state) => {
          if (state.locked.has(slotKey)) return state;
          const lineup = { ...state.lineup };

          // A player can only appear once. When dragged from another slot,
          // remove him from the previous slot before assigning him here.
          if (playerId) {
            for (const [key, currentPlayerId] of Object.entries(lineup)) {
              if (key !== slotKey && currentPlayerId === playerId && !state.locked.has(key)) {
                lineup[key] = null;
              }
            }
          }

          lineup[slotKey] = playerId;
          return { lineup };
        }),

      toggleLock: (slotKey) =>
        set((state) => {
          const locked = new Set(state.locked);
          if (locked.has(slotKey)) locked.delete(slotKey);
          else locked.add(slotKey);
          return { locked };
        }),

      autoFill: (assignments) =>
        set((state) => {
          const lineup = { ...state.lineup, ...assignments };
          return { lineup };
        }),

      setFormationWithLineup: (name, slots, assignments) => {
        // Single atomic update — replaces both setTimeout hacks in lineup/page.tsx
        const lineup: Record<string, string | null> = {};
        slots.forEach((s, i) => {
          lineup[`${s.position}-${i}`] = null;
        });
        set({ formation: name, slots, lineup: { ...lineup, ...assignments }, locked: new Set() });
      },

      clearLineup: () =>
        set((state) => {
          const lineup: Record<string, string | null> = {};
          state.slots.forEach((s, i) => {
            lineup[`${s.position}-${i}`] = null;
          });
          return { lineup, locked: new Set() };
        }),

      purgeOrphanedAssignments: (knownIds) =>
        set((state) => {
          // Null-out any slot whose assigned player is no longer in the squad.
          // Locks on orphaned slots are also cleared — a missing player can't be locked.
          let changed = false;
          const lineup = { ...state.lineup };
          const locked = new Set(state.locked);
          for (const [key, pid] of Object.entries(lineup)) {
            if (pid && !knownIds.has(pid)) {
              lineup[key] = null;
              locked.delete(key);
              changed = true;
            }
          }
          return changed ? { lineup, locked } : state;
        }),
    }),
    {
      name: 'goals-lineup-store',
      storage: createJSONStorage(() => localStorage),
      // Persist formation + slots + lineup; locked is a Set — serialize as array
      partialize: (state) => ({
        formation: state.formation,
        slots: state.slots,
        lineup: state.lineup,
        locked: Array.from(state.locked),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Revive serialized locked array back to Set
          state.locked = reviveSet((state as unknown as Record<string, unknown>).locked);
        }
      },
    }
  )
);
