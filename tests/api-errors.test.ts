import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorText, serverError } from '../src/api.ts';
import { catalogs, setLocale, translate } from '../src/i18n.ts';
import type { Locale, MessageKey } from '../src/i18n.ts';

test('API codes and legacy diagnostics resolve to the same translatable errors', () => {
  const cases: [string, string, MessageKey][] = [
    ['rooms_full', 'All rooms are occupied. Try again in a moment.', 'error.capacity'],
    ['invalid_level', 'Choose a level from 1 to 10', 'error.invalidLevel'],
    ['invalid_id', 'ID must contain 1–20 characters', 'error.invalidID'],
    ['completion_expired', 'Completion expired or was already submitted', 'error.tokenInvalid'],
    ['record_save_failed', 'Record could not be saved. Please retry.', 'error.storage'],
  ];
  for (const [code, diagnostic, key] of cases) {
    const current = serverError(400, { code, error: 'Diagnostic wording can change.' });
    const legacy = serverError(400, { error: diagnostic });
    assert.equal(current.key, key);
    assert.equal(legacy.key, key);
    for (const locale of Object.keys(catalogs) as Locale[]) {
      setLocale(locale);
      assert.equal(errorText(current), translate(locale, key));
      assert.equal(errorText(legacy), translate(locale, key));
    }
  }
  setLocale('en');
});

test('unknown server messages use a localized fallback without leaking raw diagnostics', () => {
  for (const body of [null, 'Unexpected response', { code: 'future_code', error: 'INTERNAL_ONLY' }]) {
    const error = serverError(503, body);
    for (const locale of Object.keys(catalogs) as Locale[]) {
      setLocale(locale);
      assert.equal(errorText(error), translate(locale, 'error.http', { status: 503 }));
      assert.equal(errorText(new Error('INTERNAL_ONLY')), translate(locale, 'error.generic'));
    }
  }
  setLocale('en');
});
