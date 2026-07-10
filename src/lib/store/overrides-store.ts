'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ManualOverridesState {
  trainingValueByPlayerId: Record<string, number>;
  setTrainingValueOverride: (playerId: string, value: number) => void;
  clearTrainingValueOverride: (playerId: string) => void;
}

function clampTrainingValue(value: number): number {
  return Math.max(1, Math.min(8, Math.round(value)));
}

export const useManualOverridesStore = create<ManualOverridesState>()(
  persist(
    (set) => ({
      trainingValueByPlayerId: {},
      setTrainingValueOverride: (playerId, value) =>
        set((state) => ({
          trainingValueByPlayerId: {
            ...state.trainingValueByPlayerId,
            [playerId]: clampTrainingValue(value),
          },
        })),
      clearTrainingValueOverride: (playerId) =>
        set((state) => {
          const next = { ...state.trainingValueByPlayerId };
          delete next[playerId];
          return { trainingValueByPlayerId: next };
        }),
    }),
    {
      name: 'goals-manual-overrides',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
