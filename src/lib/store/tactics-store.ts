import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { TACTICS_SETTINGS } from '@/lib/tactics/tactics-engine';

interface TacticsState {
  settings: Record<string, string>;
  setSetting: (id: string, value: string) => void;
  resetAll: () => void;
}

const DEFAULT_SETTINGS = Object.fromEntries(
  TACTICS_SETTINGS.map((s) => [s.id, s.default])
);

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
