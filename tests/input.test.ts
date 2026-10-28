import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputState } from '../src/input.ts';

test('the last pressed direction wins; releasing it restores the still-held direction', () => {
  const input = new InputState();
  input.pressKey('w'); input.pressKey('d');
  assert.deepEqual(input.read(), { move: 2, fire: false });
  assert.equal(input.pressKey('w'), false, 'keyboard autorepeat must not steal priority');
  assert.equal(input.read().move, 2);
  input.releaseKey('d'); assert.equal(input.read().move, 1);
  input.releaseKey('w'); assert.equal(input.read().move, 0);
});

test('movement and held fire are independent for keyboard and multi-touch', () => {
  const input = new InputState();
  input.pressPointer(10, 4); input.pressPointer(11);
  assert.deepEqual(input.read(), { move: 4, fire: true });
  input.releasePointer(10); assert.deepEqual(input.read(), { move: 0, fire: true });
  input.pressKey('s'); assert.deepEqual(input.read(), { move: 3, fire: true });
  input.releasePointer(11); assert.deepEqual(input.read(), { move: 3, fire: false });
  input.pressKey(' '); assert.deepEqual(input.read(), { move: 3, fire: true });
});

test('blur/reset releases every source; late pointer releases cannot resurrect inputs', () => {
  const input = new InputState();
  input.pressKey('arrowleft'); input.pressKey(' '); input.pressPointer(20, 1); input.pressPointer(21);
  input.clear(); assert.deepEqual(input.read(), { move: 0, fire: false });
  input.releasePointer(20); input.releasePointer(21); input.releaseKey(' ');
  assert.deepEqual(input.read(), { move: 0, fire: false });
});

test('multiple fire fingers and direction fingers remain independent', () => {
  const input = new InputState();
  input.pressPointer(1); input.pressPointer(2); input.pressPointer(3, 1); input.pressPointer(4, 2);
  input.releasePointer(1); input.releasePointer(4);
  assert.deepEqual(input.read(), { move: 1, fire: true });
  input.releasePointer(2); assert.deepEqual(input.read(), { move: 1, fire: false });
});

test('unrelated keys and invalid movement do not affect gameplay', () => {
  const input = new InputState();
  assert.equal(input.pressKey('enter'), false); input.pressPointer(1, 99);
  assert.deepEqual(input.read(), { move: 0, fire: false });
});
