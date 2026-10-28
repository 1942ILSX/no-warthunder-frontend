import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogs, htmlLanguages, normalizeLocale, resolveLocale, translate } from '../src/i18n.ts';
import type { Locale, MessageKey } from '../src/i18n.ts';

test('locale aliases accept saved IDs and browser language tags', () => {
  const cases: [string, Locale][] = [
    ['zh_cn', 'zh_cn'], ['zh-CN', 'zh_cn'], ['zh-Hans', 'zh_cn'], ['zh-Hans-SG', 'zh_cn'],
    ['jp', 'jp'], ['ja', 'jp'], ['ja-JP', 'jp'], [' en-US ', 'en'], ['en', 'en'],
  ];
  for (const [value, expected] of cases) assert.equal(normalizeLocale(value), expected, value);
  for (const value of [null, undefined, '', 'de-DE', 'javascript:bad']) assert.equal(normalizeLocale(value), null);
  assert.deepEqual(htmlLanguages, { en: 'en', zh_cn: 'zh-CN', jp: 'ja' });
});

test('saved selection takes priority; otherwise the first supported browser language wins', () => {
  assert.equal(resolveLocale('jp', ['zh-CN', 'en-US']), 'jp');
  assert.equal(resolveLocale('en', ['ja-JP']), 'en');
  assert.equal(resolveLocale('unsupported', ['de-DE', 'ja-JP', 'en-US']), 'jp');
  assert.equal(resolveLocale(null, ['zh-CN', 'en-US']), 'zh_cn');
  assert.equal(resolveLocale(null, ['de-DE']), 'en');
  assert.equal(resolveLocale(null, []), 'en');
});

test('every locale covers the complete catalog with matching interpolation parameters', () => {
  const keys = Object.keys(catalogs.en).sort() as MessageKey[];
  const placeholders = (value: string): string[] => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]!).sort();
  for (const [locale, catalog] of Object.entries(catalogs)) {
    assert.deepEqual(Object.keys(catalog).sort(), keys, `${locale}: missing or unexpected translations`);
    for (const key of keys) {
      assert.ok(catalog[key].trim(), `${locale}.${key}: empty translation`);
      assert.deepEqual(placeholders(catalog[key]), placeholders(catalogs.en[key]), `${locale}.${key}: parameter mismatch`);
    }
    assert.equal(catalog['app.brand'], 'NO WarThunder');
    assert.equal(catalog['app.title'], 'NO WarThunder');
  }
});

test('all ten mission briefings are translated independently of server metadata', () => {
  for (let id = 1; id <= 10; id++) {
    for (const field of ['name', 'subtitle', 'description']) {
      const key = `level.${id}.${field}` as MessageKey;
      assert.ok(catalogs.en[key]);
      for (const locale of ['zh_cn', 'jp'] as const) {
        assert.notEqual(catalogs[locale][key], catalogs.en[key], `${locale}.${key}`);
        assert.match(catalogs[locale][key], /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
      }
    }
  }
});

test('translations preserve dynamic values without interpreting replacement syntax', () => {
  for (const locale of Object.keys(catalogs) as Locale[]) {
    const mission = translate(locale, 'mission.cardLabel', { id: 10, name: '玩家 $& 01', difficulty: 5 });
    assert.ok(mission.includes('玩家 $& 01'));
    assert.ok(mission.includes('10'));
    assert.ok(mission.includes('5'));
    assert.doesNotMatch(mission, /\{\w+\}/);
    assert.ok(translate(locale, 'result.rank', { rank: 0 }).includes('0'));
  }
});
