/** Wire contract v2. Scores, elapsed time, collisions and outcomes belong to Go. */
export type Difficulty = 'trainee' | 'expert' | 'ace';
export type DifficultyProfile = { id: Difficulty; scoreMultiplier: number };
export type RunDifficulty = { difficulty: Difficulty; scoreMultiplier: number; policyVersion: string };
export type RoomReservation = RunDifficulty & { roomId: string; token: string; wsUrl: string };
export type Point = { x: number; y: number };
export type Level = {
  id: number; name: string; subtitle: string; description: string;
  difficulty: number; theme: string; grid: string[];
  playerSpawn: Point; base: Point; enemySpawns: Point[];
  enemyCount: number; maxActive: number;
};
export type Tank = Point & {
  id: number; dir: number; hp: number; maxHp: number;
  kind: 'player' | 'scout' | 'striker' | 'heavy'; shield: boolean;
};
export type Bullet = Point & { id: number; dir: number; owner: 'player' | 'enemy' };
export type Effect = Point & { id: number; kind: 'hit' | 'explosion' | 'spawn'; ttl: number };
export type State = {
  tick: number; timeMs: number; status: 'playing' | 'won' | 'lost';
  grid: string[]; player: Tank; enemies: Tank[]; bullets: Bullet[]; effects: Effect[];
  base: Point & { hp: number; maxHp: number };
  score: number; baseScore: number; kills: number; totalEnemies: number; enemiesRemaining: number;
  lives: number; lastInputSeq: number;
};
export type RunResult = RunDifficulty & {
  status: 'won' | 'lost'; levelId: number; score: number; baseScore: number; durationMs: number;
  kills: number; completionToken?: string;
};
export type ScoreRecord = {
  id: string; score: number; durationMs: number; completedAt: string;
  // Older scripted runs have no difficulty metadata; never imply a trained tier.
  difficulty?: Difficulty; scoreMultiplier?: number; baseScore?: number;
};
export type ServerMessage =
  | (RunDifficulty & { type: 'welcome'; roomId: string; level: Level; state: State })
  | { type: 'state'; state: State }
  | { type: 'finished'; result: RunResult }
  | { type: 'error'; error: string };
export type Input = { type: 'input'; seq: number; move: number; fire: boolean };
