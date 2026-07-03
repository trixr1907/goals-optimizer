import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface TacticsState {
  settings: Record<string, string>;
  setSetting: (id: string, value: string) => void;
  resetAll: () => void;
}

const DEFAULT_SETTINGS: Record<string, string> = {};

export const useTacticsStore = create<TacticsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      setSetting: (id, value) =>
        set((state) => ({ settings: { ...state.settings, [id]: value } })),
      resetAll: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'goals-tactics-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
