import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlayerID } from '../src/validation.ts';

test('display IDs allow the server protocol punctuation and Unicode letters/digits', () => {
  for (const id of ['pilot', '玩家 01', 'ace._-', '...', '_-', '١٢٣', '１２３', '𐐀'.repeat(20)]) {
    assert.equal(normalizePlayerID(id), id);
  }
});

test('ID length counts code points, and trim follows Go Unicode White_Space', () => {
  assert.equal(normalizePlayerID('  pilot  '), 'pilot');
  assert.equal(normalizePlayerID('\u0085pilot\u0085'), 'pilot');
  assert.equal(normalizePlayerID('\uFEFFpilot'), null, 'Go does not trim BOM');
  assert.equal(normalizePlayerID('𐐀'.repeat(21)), null);
  assert.equal(normalizePlayerID('x'.repeat(20)), 'x'.repeat(20));
});

test('IDs reject blank, control, markup and non-decimal numeric characters', () => {
  for (const id of ['', '   ', '<script>', 'a\nb', 'a/b', '²', 'Ⅲ', 'a😀', '\ud800']) {
    assert.equal(normalizePlayerID(id), null, JSON.stringify(id));
  }
});
