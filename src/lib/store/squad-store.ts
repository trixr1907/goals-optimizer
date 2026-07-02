import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { PlayerWithScores } from '@/lib/scraper/types';

// Delta report returned by reimportPlayers
export interface ImportDelta {
  newPlayers: PlayerWithScores[];
  updatedPlayers: Array<{ player: PlayerWithScores; changedStats: string[] }>;
  removedPlayers: PlayerWithScores[];
  unchanged: number;
}

interface SquadState {
  clubName: string;
  players: PlayerWithScores[];
  lastImportedAt: string | null;
  _hasHydrated: boolean;
  setClubName: (name: string) => void;
  importPlayers: (players: PlayerWithScores[]) => void;
  /** Re-import: merge incoming players and return a delta report */
  reimportPlayers: (incoming: PlayerWithScores[]) => ImportDelta;
  clearSquad: () => void;
  setHasHydrated: (state: boolean) => void;
}

// Numeric stat keys we track for upgrade-detection
const TRACKED_STATS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'] as const;
type TrackedStat = typeof TRACKED_STATS[number];
const THRESHOLD = 1; // minimum change to count as update

function detectChangedStats(
  prev: PlayerWithScores,
  next: PlayerWithScores,
): string[] {
  const changed: string[] = [];
  if (Math.abs(prev.overall - next.overall) >= THRESHOLD) changed.push('overall');
  for (const key of TRACKED_STATS) {
    const a = prev.stats[key as TrackedStat] ?? 0;
    const b = next.stats[key as TrackedStat] ?? 0;
    if (Math.abs(a - b) >= THRESHOLD) changed.push(key);
  }
  return changed;
}

export const useSquadStore = create<SquadState>()(
  persist(
    (set, get) => ({
      clubName: '',
      players: [],
      lastImportedAt: null,
      _hasHydrated: false,

      setClubName: (name) => set({ clubName: name }),

      importPlayers: (players) =>
        set({ players, lastImportedAt: new Date().toISOString() }),

      reimportPlayers: (incoming) => {
        const existing = get().players;
        const existingById = new Map(existing.map((p) => [p.id, p]));
        const incomingById = new Map(incoming.map((p) => [p.id, p]));

        const newPlayers: PlayerWithScores[] = [];
        const updatedPlayers: ImportDelta['updatedPlayers'] = [];
        let unchanged = 0;

        for (const next of incoming) {
          const prev = existingById.get(next.id);
          if (!prev) {
            newPlayers.push(next);
          } else {
            const changedStats = detectChangedStats(prev, next);
            if (changedStats.length > 0) {
              updatedPlayers.push({ player: next, changedStats });
            } else {
              unchanged++;
            }
          }
        }

        // Players in existing but not in incoming → removed
        const removedPlayers = existing.filter((p) => !incomingById.has(p.id));

        // Merge: keep existing untouched, overwrite updated, add new, drop removed
        const merged = [
          ...existing
            .filter((p) => incomingById.has(p.id))
            .map((p) => {
              const updated = updatedPlayers.find((u) => u.player.id === p.id);
              return updated ? updated.player : p;
            }),
          ...newPlayers,
        ];

        set({ players: merged, lastImportedAt: new Date().toISOString() });

        return { newPlayers, updatedPlayers, removedPlayers, unchanged };
      },

      clearSquad: () => set({ players: [], clubName: '', lastImportedAt: null }),

      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'goals-squad-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        clubName: state.clubName,
        players: state.players,
        lastImportedAt: state.lastImportedAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
