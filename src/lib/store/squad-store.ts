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
  clubId?: string;
  clubUrl?: string;
  players: PlayerWithScores[];
  lastImportedAt: string | null;
  _hasHydrated: boolean;
  setClubName: (name: string) => void;
  setClubId: (id: string) => void;
  importPlayers: (players: PlayerWithScores[], clubUrl?: string, clubId?: string) => void;
  /** Re-import: merge incoming players and return a delta report */
  reimportPlayers: (incoming: PlayerWithScores[], clubUrl?: string, clubId?: string) => ImportDelta;
  clearSquad: () => void;
  setHasHydrated: (state: boolean) => void;
}

const THRESHOLD = 1; // minimum numeric change to count as an update

function detectChangedStats(
  prev: PlayerWithScores,
  next: PlayerWithScores,
): string[] {
  const changed: string[] = [];

  // ── Top-level player fields ────────────────────────────────────────────────
  if (Math.abs(prev.overall - next.overall) >= THRESHOLD) changed.push('overall');
  if (prev.name     !== next.name)     changed.push('name');
  if (prev.position !== next.position) changed.push('position');
  if (prev.rarity   !== next.rarity)   changed.push('rarity');

  // ── All numeric stats from PlayerStats ────────────────────────────────────
  // We iterate over the union of keys from both objects so we catch new stats
  // that weren't present in the previously stored version.
  // Double-cast through unknown: PlayerStats has no index signature,
  // but at runtime all values are numbers so this is safe.
  const prevMap = prev.stats as unknown as Record<string, number>;
  const nextMap = next.stats as unknown as Record<string, number>;

  // Union of all keys from both snapshots — catches newly-added stats too
  const allStatKeys = Array.from(
    new Set([...Object.keys(prevMap), ...Object.keys(nextMap)])
  );

  for (const key of allStatKeys) {
    const a = prevMap[key] ?? 0;
    const b = nextMap[key] ?? 0;
    // Skip non-numeric values (e.g. future string fields) gracefully
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    if (Math.abs(a - b) >= THRESHOLD) changed.push(key);
  }

  return changed;
}

export const useSquadStore = create<SquadState>()(
  persist(
    (set, get) => ({
      clubName: '',
      clubId: undefined,
      players: [],
      lastImportedAt: null,
      _hasHydrated: false,

      setClubName: (name) => set({ clubName: name }),
      setClubId: (id) => set({ clubId: id }),

      importPlayers: (players, clubUrl, clubId) =>
        set({ players, clubUrl, clubId, lastImportedAt: new Date().toISOString() }),

      reimportPlayers: (incoming, clubUrl, clubId) => {
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

        set({ players: merged, clubUrl, clubId, lastImportedAt: new Date().toISOString() });

        return { newPlayers, updatedPlayers, removedPlayers, unchanged };
      },

      clearSquad: () => set({ players: [], clubName: '', clubId: undefined, clubUrl: undefined, lastImportedAt: null }),

      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'goals-squad-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        clubName: state.clubName,
        clubId: state.clubId,
        clubUrl: state.clubUrl,
        players: state.players,
        lastImportedAt: state.lastImportedAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Migrate old granular positions → GOALS positions
          const posMap: Record<string, string> = {
            LB: 'FB', RB: 'FB',
            LWB: 'WB', RWB: 'WB',
            CDM: 'DM',
            CAM: 'AM',
            LM: 'WM', RM: 'WM',
            LW: 'WF', RW: 'WF',
          };
          state.players = state.players.map((p) => ({
            ...p,
            position: (posMap[p.position] ?? p.position) as typeof p.position,
          }));
          state.setHasHydrated(true);
        }
      },
    }
  )
);
