import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDifficulty, multiplierText, resolveDifficulty } from '../src/difficulty.ts';
import { translate } from '../src/i18n.ts';
import type { DifficultyProfile } from '../src/types.ts';

const profiles: DifficultyProfile[] = [
  { id: 'trainee', scoreMultiplier: 1 },
  { id: 'expert', scoreMultiplier: 1.5 },
  { id: 'ace', scoreMultiplier: 2 },
];

test('difficulty preference uses only current server tiers, otherwise the server default', () => {
  assert.equal(resolveDifficulty('ace', profiles, 'expert'), 'ace');
  for (const value of [null, '', 'invalid', 'ACE', '<script>']) {
    assert.equal(resolveDifficulty(value, profiles, 'expert'), 'expert');
  }
  assert.equal(resolveDifficulty('ace', profiles.slice(0, 2), 'expert'), 'expert');
  assert.equal(resolveDifficulty('expert', profiles.slice(0, 1), 'expert'), 'trainee');
});

test('legacy runs are never inferred as a trained tier and multipliers display consistently', () => {
  assert.equal(isDifficulty(undefined), false);
  assert.equal(isDifficulty('legacy'), false);
  assert.equal(isDifficulty('expert'), true);
  assert.deepEqual(profiles.map(profile => multiplierText(profile.scoreMultiplier)), ['×1.0', '×1.5', '×2.0']);
});

test('every locale distinguishes AI tiers and explains the server score breakdown', () => {
  for (const locale of ['en', 'zh_cn', 'jp'] as const) {
    for (const id of ['trainee', 'expert', 'ace'] as const) {
      assert.ok(translate(locale, `ai.${id}`));
      assert.ok(translate(locale, `ai.${id}Description`));
    }
    assert.equal(translate(locale, 'result.scoreBreakdown', { baseScore: '1,201', multiplier: '1.5', score: '1,801' }), 'Base score 1,201 × 1.5 → 1,801');
    assert.match(translate(locale, 'records.legacy'), /Legacy/);
  }
});
