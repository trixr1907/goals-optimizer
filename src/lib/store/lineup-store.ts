import { create } from 'zustand';
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
  clearLineup: () => void;
}

export const useLineupStore = create<LineupState>((set) => ({
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
  clearLineup: () =>
    set((state) => {
      const lineup: Record<string, string | null> = {};
      state.slots.forEach((s, i) => {
        lineup[`${s.position}-${i}`] = null;
      });
      return { lineup, locked: new Set() };
    }),
}));
