import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, serverError } from '../src/api.ts';

test('API chooses the server model tier but never submits a client score or multiplier', async context => {
  const existingWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis });
  context.after(() => {
    if (existingWindow) Object.defineProperty(globalThis, 'window', existingWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const calls: { path: string; body?: unknown }[] = [];
  context.mock.method(globalThis, 'fetch', async (path: string, options?: RequestInit) => {
    calls.push({ path, ...(options?.body ? { body: JSON.parse(String(options.body)) } : {}) });
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  await api.difficulties();
  await api.room(7, 'ace');
  await api.submit('completion-receipt', 'Pilot');
  assert.deepEqual(calls, [
    { path: '/api/difficulties' },
    { path: '/api/rooms', body: { levelId: 7, difficulty: 'ace' } },
    { path: '/api/leaderboard', body: { completionToken: 'completion-receipt', id: 'Pilot' } },
  ]);
});

test('difficulty failures have localized error codes', () => {
  assert.equal(serverError(400, { code: 'invalid_difficulty' }).key, 'error.invalidDifficulty');
  assert.equal(serverError(503, { code: 'policy_unavailable' }).key, 'error.policyUnavailable');
});
