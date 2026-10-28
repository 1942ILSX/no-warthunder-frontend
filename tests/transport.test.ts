import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { connectGame, JSONLinesDecoder } from '../src/transport.ts';
import type { RoomReservation, ServerMessage } from '../src/types.ts';

const room: RoomReservation = {
  roomId: 'room-1', token: 'same-reservation', wsUrl: '/api/rooms/room-1/ws?token=same-reservation',
  webTransportPath: '/api/rooms/room-1/wt?token=same-reservation', difficulty: 'expert', scoreMultiplier: 1.5, policyVersion: 'v3',
};
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value) + '\n');
const welcome = { type: 'welcome', state: { tick: 0 } } as ServerMessage;

function fakes(options: { pendingReady?: boolean; rejectJoin?: boolean; blockInput?: boolean } = {}) {
  const sockets: FakeSocket[] = [], sessions: FakeTransport[] = [];
  let readyResolve: () => void = () => {}, inputResolve: () => void = () => {};
  class FakeSocket extends EventTarget {
    static OPEN = 1;
    readyState = 1; bufferedAmount = 0; sent: unknown[] = [];
    url: URL;
    constructor(url: URL) { super(); this.url = url; sockets.push(this); }
    send(value: string) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
    message(value: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
  }
  class FakeTransport {
    writes: unknown[] = []; wasClosed = false;
    ready = options.pendingReady ? new Promise<void>(resolve => { readyResolve = resolve; }) : Promise.resolve();
    private resolveClosed!: () => void;
    closed = new Promise<void>(resolve => { this.resolveClosed = resolve; });
    control!: ReadableStreamDefaultController<Uint8Array>;
    states!: ReadableStreamDefaultController<Uint8Array>;
    private incoming!: ReadableStreamDefaultController<ReadableStream<Uint8Array>>;
    private stateStream = new ReadableStream<Uint8Array>({ start: controller => { this.states = controller; } });
    incomingUnidirectionalStreams = new ReadableStream<ReadableStream<Uint8Array>>({ start: controller => {
      this.incoming = controller; controller.enqueue(this.stateStream);
    } });
    url: URL;
    constructor(url: URL) { this.url = url; sessions.push(this); }
    async createBidirectionalStream() {
      return {
        readable: new ReadableStream<Uint8Array>({ start: controller => { this.control = controller; } }),
        writable: new WritableStream<Uint8Array>({ write: async bytes => {
          const message = JSON.parse(new TextDecoder().decode(bytes));
          this.writes.push(message);
          if (message.type === 'join' && options.rejectJoin) throw new Error('Simulated write failure');
          if (message.type === 'input' && options.blockInput) await new Promise<void>(resolve => { inputResolve = resolve; });
        } }),
      };
    }
    close() { this.wasClosed = true; this.resolveClosed(); }
  }
  return {
    sockets, sessions, ready: () => readyResolve(), releaseInput: () => inputResolve(),
    options: { location: 'https://game.example/', webTransport: FakeTransport as unknown as typeof WebTransport, webSocket: FakeSocket as unknown as typeof WebSocket },
  };
}

test('NDJSON preserves fragmented UTF-8 and multiple frames, rejects truncation and oversized frames', () => {
  const decoder = new JSONLinesDecoder();
  const bytes = new TextEncoder().encode('{"name":"游戏"}\n{"tick":12}\n');
  assert.deepEqual([...decoder.push(bytes.slice(0, 12)), ...decoder.push(bytes.slice(12))], [{ name: '游戏' }, { tick: 12 }]);
  decoder.finish();
  decoder.push(new TextEncoder().encode('{'));
  assert.throws(() => decoder.finish(), /Truncated/);
  assert.throws(() => new JSONLinesDecoder().push(new Uint8Array(65537).fill(65)), /too large/);
});

test('WebTransport joins once, orders welcome before states, and acknowledges completion', async context => {
  const fake = fakes(), messages: ServerMessage[] = [], errors: Error[] = [];
  const connection = connectGame(room, { message: value => messages.push(value), error: value => errors.push(value) }, fake.options);
  context.after(() => connection.close());
  await delay(5);
  const session = fake.sessions[0];
  assert.deepEqual(session.writes, [{ type: 'join' }]);
  assert.equal(fake.sockets.length, 0);
  session.states.enqueue(encode({ type: 'state', state: { tick: 1 } }));
  await delay(1);
  assert.deepEqual(messages, []);
  session.control.enqueue(encode(welcome));
  await delay(1);
  assert.equal(connection.open, true);
  connection.send({ type: 'input', seq: 1, move: 2, fire: true });
  await delay(1);
  assert.deepEqual(session.writes[1], { type: 'input', seq: 1, move: 2, fire: true });
  session.control.enqueue(encode({ type: 'finished', result: { status: 'won' } }));
  await delay(1);
  assert.deepEqual(session.writes.at(-1), { type: 'finishedAck' });
  session.close(); await delay(1);
  assert.equal(connection.open, false);
  assert.deepEqual(errors, []);
});

test('pre-join timeout falls back to WebSocket using the same room and closes late QUIC', async context => {
  const fake = fakes({ pendingReady: true }), errors: Error[] = [];
  const connection = connectGame(room, { message() {}, error: error => errors.push(error) }, { ...fake.options, transportTimeoutMS: 5 });
  context.after(() => connection.close());
  await delay(15);
  assert.equal(fake.sockets.length, 1);
  assert.equal(String(fake.sockets[0].url), 'wss://game.example/api/rooms/room-1/ws?token=same-reservation');
  assert.equal(fake.sessions[0].wasClosed, true);
  fake.ready(); await delay(2);
  assert.deepEqual(fake.sessions[0].writes, []);
  fake.sockets[0].message(welcome);
  assert.equal(connection.open, true);
  assert.deepEqual(errors, []);
});

test('once join is sent a failure never silently starts another transport', async () => {
  const fake = fakes({ rejectJoin: true }), errors: Error[] = [];
  const connection = connectGame(room, { message() {}, error: error => errors.push(error) }, fake.options);
  await delay(5);
  assert.equal(fake.sessions[0].writes.length, 1);
  assert.equal(fake.sockets.length, 0);
  assert.equal(errors.length, 1);
  connection.close();
});

test('cancel before connection starts opens no transport', async () => {
  const fake = fakes();
  const connection = connectGame(room, { message() {}, error() { assert.fail('Canceled connection reported error'); } }, fake.options);
  connection.close(); await delay(1);
  assert.equal(fake.sessions.length, 0);
  assert.equal(fake.sockets.length, 0);
});

test('HTTP development uses the existing WebSocket path', async context => {
  const fake = fakes();
  const connection = connectGame(room, { message() {}, error() {} }, { ...fake.options, location: 'http://127.0.0.1:5173/' });
  context.after(() => connection.close());
  await delay(1);
  assert.equal(fake.sessions.length, 0);
  assert.equal(String(fake.sockets[0].url), 'ws://127.0.0.1:5173/api/rooms/room-1/ws?token=same-reservation');
});

test('slow writes retain only the newest queued complete input state', async context => {
  const fake = fakes({ blockInput: true });
  const connection = connectGame(room, { message() {}, error() {} }, fake.options);
  context.after(() => { fake.releaseInput(); connection.close(); });
  await delay(2);
  fake.sessions[0].control.enqueue(encode(welcome)); await delay(1);
  for (const seq of [1, 2, 3]) connection.send({ type: 'input', seq, move: seq, fire: false });
  await delay(1); fake.releaseInput(); await delay(1);
  assert.deepEqual(fake.sessions[0].writes.slice(1).map((value: any) => value.seq), [1, 3]);
});
