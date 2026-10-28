import type { Level, ScoreRecord } from './types';
import { t } from './i18n.ts';
import type { MessageKey, Params } from './i18n.ts';

export class LocalizedError extends Error {
  readonly key: MessageKey;
  readonly params: Params;
  readonly code?: string;
  constructor(key: MessageKey, params: Params = {}, code?: string) {
    super(key); this.name = 'LocalizedError'; this.key = key; this.params = params; this.code = code;
  }
}

const errorCodes: Record<string, MessageKey> = {
  not_found: 'error.notFound', origin_not_allowed: 'error.origin', invalid_level: 'error.invalidLevel',
  room_creation_failed: 'error.unavailable', server_unavailable: 'error.unavailable', rooms_full: 'error.capacity',
  run_capacity_full: 'error.capacity', room_expired: 'error.roomMissing', room_in_use: 'error.roomConnected',
  invalid_submission: 'error.invalidRequest', invalid_id: 'error.invalidID', completion_expired: 'error.tokenInvalid',
  submission_in_progress: 'error.submitting', record_save_failed: 'error.storage', method_not_allowed: 'error.method',
};
const legacyCodes: Record<string, string> = {
  'API endpoint not found': 'not_found', 'Origin is not allowed': 'origin_not_allowed',
  'Expected a valid levelId': 'invalid_level', 'Choose a level from 1 to 10': 'invalid_level',
  'Could not create room': 'room_creation_failed', 'Server is shutting down': 'server_unavailable',
  'All rooms are occupied. Try again in a moment.': 'rooms_full',
  'Run capacity is temporarily full. Please try again shortly.': 'run_capacity_full',
  'Room expired or token is invalid': 'room_expired', 'Room already has a player': 'room_in_use',
  'Expected completionToken and ID only': 'invalid_submission',
  'ID must contain 1–20 characters': 'invalid_id',
  'ID may contain letters, numbers, spaces, underscores, hyphens and periods': 'invalid_id',
  'Completion expired or was already submitted': 'completion_expired',
  'This completion is already being submitted': 'submission_in_progress',
  'Record could not be saved. Please retry.': 'record_save_failed', 'Method not allowed': 'method_not_allowed',
};
export function serverError(status: number, value: unknown): LocalizedError {
  const body = value && typeof value === 'object' ? value as { code?: unknown; error?: unknown } : {};
  const code = typeof body.code === 'string' ? body.code : typeof body.error === 'string' ? legacyCodes[body.error] : undefined;
  return new LocalizedError(code && errorCodes[code] ? errorCodes[code] : 'error.http', { status }, code);
}
export function errorText(error: unknown): string {
  return error instanceof LocalizedError ? t(error.key, error.params) : t('error.generic');
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal });
    const value = await response.json().catch(() => null);
    if (!response.ok) throw serverError(response.status, value);
    if (value === null) throw new LocalizedError('error.response');
    return value as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new LocalizedError('error.timeout');
    if (error instanceof TypeError) throw new LocalizedError('error.network');
    throw error;
  } finally { window.clearTimeout(timeout); }
}

export const api = {
  levels: () => request<{ levels: Level[] }>('/api/levels'),
  leaderboard: (levelId: number) => request<{ levelId: number; entries: ScoreRecord[] }>(`/api/leaderboard?levelId=${levelId}`),
  room: (levelId: number) => request<{ roomId: string; token: string; wsUrl: string }>('/api/rooms', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ levelId }),
  }),
  submit: (completionToken: string, id: string) => request<{ rank: number | null; recorded: boolean; entries: ScoreRecord[] }>('/api/leaderboard', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completionToken, id }),
  }),
};
