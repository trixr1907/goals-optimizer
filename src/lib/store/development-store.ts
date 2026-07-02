import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type DevelopmentPriority = 'play_now' | 'train' | 'bench' | 'sell';

export interface UpgradeEntry {
  date: string;        // ISO date string
  ovrBefore: number;
  ovrAfter: number;
  label: string;       // e.g. "Silber → Gold", "Skill upgrade: Pace +3"
}

export interface PlayerDevelopmentNote {
  playerId: string;
  priority: DevelopmentPriority;
  minutesPlayed: number;
  xpEstimate: number;
  notes: string;
  upgradeHistory: UpgradeEntry[];
  updatedAt: string;
}

interface DevelopmentState {
  notesByPlayerId: Record<string, PlayerDevelopmentNote>;
  setPriority: (playerId: string, priority: DevelopmentPriority) => void;
  addMinutes: (playerId: string, minutes: number) => void;
  setNotes: (playerId: string, notes: string) => void;
  addUpgrade: (playerId: string, entry: UpgradeEntry) => void;
  resetPlayer: (playerId: string) => void;
  clearAll: () => void;
}

function createDefaultNote(playerId: string): PlayerDevelopmentNote {
  return {
    playerId,
    priority: 'train',
    minutesPlayed: 0,
    xpEstimate: 0,
    notes: '',
    upgradeHistory: [],
    updatedAt: new Date().toISOString(),
  };
}

function estimateXp(minutesPlayed: number) {
  // Conservative estimate: ~12 XP per minute equivalent for planning
  return Math.round(minutesPlayed * 12);
}

export const useDevelopmentStore = create<DevelopmentState>()(
  persist(
    (set) => ({
      notesByPlayerId: {},
      setPriority: (playerId, priority) =>
        set((state) => {
          const current = state.notesByPlayerId[playerId] ?? createDefaultNote(playerId);
          return {
            notesByPlayerId: {
              ...state.notesByPlayerId,
              [playerId]: { ...current, priority, updatedAt: new Date().toISOString() },
            },
          };
        }),
      addMinutes: (playerId, minutes) =>
        set((state) => {
          const current = state.notesByPlayerId[playerId] ?? createDefaultNote(playerId);
          const nextMinutes = Math.max(0, current.minutesPlayed + minutes);
          return {
            notesByPlayerId: {
              ...state.notesByPlayerId,
              [playerId]: {
                ...current,
                minutesPlayed: nextMinutes,
                xpEstimate: estimateXp(nextMinutes),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),
      setNotes: (playerId, notes) =>
        set((state) => {
          const current = state.notesByPlayerId[playerId] ?? createDefaultNote(playerId);
          return {
            notesByPlayerId: {
              ...state.notesByPlayerId,
              [playerId]: { ...current, notes, updatedAt: new Date().toISOString() },
            },
          };
        }),
      addUpgrade: (playerId, entry) =>
        set((state) => {
          const current = state.notesByPlayerId[playerId] ?? createDefaultNote(playerId);
          return {
            notesByPlayerId: {
              ...state.notesByPlayerId,
              [playerId]: {
                ...current,
                upgradeHistory: [entry, ...(current.upgradeHistory ?? [])].slice(0, 20), // keep last 20
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),
      resetPlayer: (playerId) =>
        set((state) => {
          const next = { ...state.notesByPlayerId };
          delete next[playerId];
          return { notesByPlayerId: next };
        }),
      clearAll: () => set({ notesByPlayerId: {} }),
    }),
    {
      name: 'goals-development-store',
      storage: createJSONStorage(() => localStorage),
      // Migration: add upgradeHistory to old entries that don't have it
      merge: (persisted: unknown, current) => {
        const p = persisted as Partial<DevelopmentState>;
        if (p?.notesByPlayerId) {
          const migrated = Object.fromEntries(
            Object.entries(p.notesByPlayerId).map(([id, note]) => [
              id,
              { ...note, upgradeHistory: note.upgradeHistory ?? [] },
            ])
          );
          return { ...current, ...{ notesByPlayerId: migrated } };
        }
        return { ...current, ...(p as Partial<DevelopmentState>) };
      },
    }
  )
);

export const PRIORITY_LABELS: Record<DevelopmentPriority, string> = {
  play_now: 'Spielen',
  train: 'Trainieren',
  bench: 'Parken',
  sell: 'Aussortieren',
};

export const PRIORITY_CLASSES: Record<DevelopmentPriority, string> = {
  play_now: 'bg-emerald-900/60 text-emerald-300 border-emerald-800',
  train: 'bg-amber-900/60 text-amber-300 border-amber-800',
  bench: 'bg-slate-800 text-slate-300 border-slate-700',
  sell: 'bg-red-950/60 text-red-300 border-red-900',
};
