import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseAssetRoute, normalizeAssetBase, cohortStorageKey } from '../scripts/asset-route.mjs';

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
}

test('10% cohort boundary and repeated page visits keep the session draw', () => {
  let origin = 0;
  for (let bucket = 0; bucket < 1000; bucket++) {
    const session = storage(), sample = (bucket + 0.5) / 1000;
    const route = chooseAssetRoute(session, 0.1, () => sample);
    if (route === 'origin') origin++;
    assert.equal(chooseAssetRoute(session, 0.1, () => { throw new Error('Must reuse session'); }), route);
  }
  assert.equal(origin, 100);
  assert.equal(chooseAssetRoute(storage(), 0.1, () => 0.1), 'cdn');
});

test('disabled or corrupted storage cannot prevent loading', () => {
  const broken = { getItem() { throw new Error('Disabled'); }, setItem() { throw new Error('Disabled'); } };
  assert.equal(chooseAssetRoute(broken, 0.1, () => 0.05), 'origin');
  const session = storage(); session.setItem(cohortStorageKey, 'NaN');
  assert.equal(chooseAssetRoute(session, 0.1, () => 0.9), 'cdn');
  assert.equal(session.getItem(cohortStorageKey), '0.9');
});

test('CDN base requires HTTPS and preserves the release prefix', () => {
  assert.equal(normalizeAssetBase('https://assets.example/no-warthunder/releases/v1'), 'https://assets.example/no-warthunder/releases/v1/');
  for (const invalid of [null, '', '/assets/', 'http://assets.example/', 'https://user:pass@assets.example/', 'https://assets.example/?token=secret', 'javascript:alert(1)']) {
    assert.equal(normalizeAssetBase(invalid), null);
  }
});
