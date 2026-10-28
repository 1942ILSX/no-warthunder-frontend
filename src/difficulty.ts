import type { Difficulty, DifficultyProfile } from './types.ts';

export const difficultyStorageKey = 'nwt-difficulty';
export const isDifficulty = (value: unknown): value is Difficulty => value === 'trainee' || value === 'expert' || value === 'ace';
export const multiplierText = (multiplier: number): string => `×${multiplier.toFixed(1)}`;

/** A saved preference can select only a tier the current backend offers. */
export function resolveDifficulty(saved: string | null, profiles: DifficultyProfile[], defaultDifficulty: Difficulty): Difficulty {
  if (isDifficulty(saved) && profiles.some(profile => profile.id === saved)) return saved;
  return profiles.some(profile => profile.id === defaultDifficulty) ? defaultDifficulty : profiles[0]!.id;
}
