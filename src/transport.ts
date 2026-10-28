import { LocalizedError } from './api.ts';
import type { Input, RoomReservation, ServerMessage } from './types.ts';

const encoder = new TextEncoder();
const maximumFrameBytes = 64 * 1024;

/** A frame may span QUIC reads, and one read may contain many frames. */
export class JSONLinesDecoder {
  private bytes = new Uint8Array(maximumFrameBytes);
  private length = 0;
  private decoder = new TextDecoder('utf-8', { fatal: true });
  push(chunk: Uint8Array): unknown[] {
    const messages: unknown[] = [];
    for (const byte of chunk) {
      if (byte === 10) {
        if (this.length) messages.push(JSON.parse(this.decoder.decode(this.bytes.subarray(0, this.length))));
        this.length = 0;
      } else {
        if (this.length === maximumFrameBytes) throw new Error('Transport frame is too large');
        this.bytes[this.length++] = byte;
      }
    }
    return messages;
  }
  finish() { if (this.length) throw new Error('Truncated transport frame'); }
}

type Handlers = { message: (message: ServerMessage) => void; error: (error: Error) => void };
export type GameConnection = { readonly open: boolean; send: (input: Input) => void; close: () => void };
type Options = {
  location?: string;
  webTransport?: typeof WebTransport;
  webSocket?: typeof WebSocket;
  transportTimeoutMS?: number;
  welcomeTimeoutMS?: number;
};

function deadline<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LocalizedError('error.connectionTimeout')), milliseconds);
  })]).finally(() => clearTimeout(timer));
}

/** One reservation, at most one joined game. Never replay join after it was sent. */
export function connectGame(room: RoomReservation, handlers: Handlers, options: Options = {}): GameConnection {
  const pageURL = options.location ?? globalThis.location.href;
  const WT = options.webTransport ?? globalThis.WebTransport;
  const WS = options.webSocket ?? globalThis.WebSocket;
  const prejoinTimeout = options.transportTimeoutMS ?? 2500;
  let closed = false, ended = false, welcomed = false, joinSent = false;
  let session: WebTransport | undefined, socket: WebSocket | undefined;
  let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  let pendingInput: Input | undefined, writing = false;
  const readers = new Set<ReadableStreamDefaultReader<Uint8Array>>();
  let incomingReader: ReadableStreamDefaultReader<ReadableStream<Uint8Array>> | undefined;
  const welcomeTimer = setTimeout(() => fail(new LocalizedError('error.connectionTimeout')), options.welcomeTimeoutMS ?? 12_000);

  function close() {
    if (closed) return;
    closed = true; clearTimeout(welcomeTimer); pendingInput = undefined;
    socket?.close(1000, 'Client leaving mission');
    session?.close({ closeCode: 0, reason: 'Client leaving mission' });
    void writer?.abort().catch(() => {});
    for (const reader of readers) void reader.cancel().catch(() => {});
    void incomingReader?.cancel().catch(() => {});
  }
  function fail(error: Error) {
    if (closed || ended) return;
    close(); handlers.error(error);
  }
  function message(value: unknown) {
    if (closed || ended) return;
    if (!value || typeof value !== 'object' || !('type' in value)) throw new Error('Invalid transport message');
    const frame = value as ServerMessage;
    if (frame.type === 'welcome') {
      if (welcomed) throw new Error('Duplicate welcome');
      welcomed = true; clearTimeout(welcomeTimer);
    } else if (frame.type === 'state' && !welcomed) {
      // Independent QUIC streams may arrive out of order; welcome has a full state.
      return;
    } else if (frame.type === 'finished') {
      ended = true; pendingInput = undefined; clearTimeout(welcomeTimer);
      // A session close can overtake bytes on other streams. Acknowledge the
      // result so the backend can close without losing the completion receipt.
      if (writer) void deadline(writer.write(encoder.encode('{"type":"finishedAck"}\n')), 1000).catch(() => {});
    }
    handlers.message(frame);
  }
  async function readStream(readable: ReadableStream<Uint8Array>, control: boolean) {
    const reader = readable.getReader(); readers.add(reader);
    const decoder = new JSONLinesDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) { decoder.finish(); break; }
        for (const frame of decoder.push(value)) message(frame);
      }
      if (control && !closed && !ended) fail(new LocalizedError('error.disconnected'));
    } catch {
      if (!closed && !ended) fail(new LocalizedError('error.invalidUpdate'));
    } finally { readers.delete(reader); reader.releaseLock(); }
  }
  async function receiveStates(candidate: WebTransport) {
    incomingReader = candidate.incomingUnidirectionalStreams.getReader();
    try {
      const first = await incomingReader.read();
      if (first.done || closed) return;
      void readStream(first.value, false);
      // The protocol allows exactly one state stream; reject unbounded fan-out.
      const extra = await incomingReader.read();
      if (!extra.done && !closed) fail(new LocalizedError('error.invalidUpdate'));
    } catch { if (!closed && !ended) fail(new LocalizedError('error.disconnected')); }
  }
  async function writeInputs() {
    if (writing || !writer) return;
    writing = true;
    try {
      while (pendingInput && !closed && !ended) {
        const input = pendingInput; pendingInput = undefined;
        await deadline(writer.write(encoder.encode(JSON.stringify(input) + '\n')), 2000);
      }
    } catch { fail(new LocalizedError('error.connection')); }
    finally { writing = false; }
  }
  function startWebSocket() {
    if (closed) return;
    const url = new URL(room.wsUrl, pageURL); url.protocol = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss:' : 'ws:';
    socket = new WS(url);
    socket.addEventListener('message', event => {
      if (closed) return;
      try { message(JSON.parse(event.data)); }
      catch { fail(new LocalizedError('error.invalidUpdate')); }
    });
    socket.addEventListener('close', () => fail(new LocalizedError('error.disconnected')));
    socket.addEventListener('error', () => fail(new LocalizedError('error.connection')));
  }
  async function start() {
    if (room.webTransportPath && new URL(pageURL).protocol === 'https:' && typeof WT === 'function') {
      let candidate: WebTransport | undefined;
      try {
        candidate = new WT(new URL(room.webTransportPath, pageURL), { congestionControl: 'low-latency' });
        session = candidate;
        const disconnected = () => { if (session === candidate && joinSent) fail(new LocalizedError('error.disconnected')); };
        void candidate.closed.then(disconnected, disconnected);
        const stream = await deadline(candidate.ready.then(() => candidate!.createBidirectionalStream()), prejoinTimeout);
        if (closed || session !== candidate) return;
        writer = stream.writable.getWriter();
        // After this point the server can start the simulation, so a failed
        // welcome must not create a second game through WebSocket fallback.
        joinSent = true;
        await deadline(writer.write(encoder.encode('{"type":"join"}\n')), 2000);
        if (closed) return;
        void readStream(stream.readable, true);
        void receiveStates(candidate);
        return;
      } catch {
        candidate?.close();
        session = undefined;
        if (closed) return;
        if (joinSent) { fail(new LocalizedError('error.connection')); return; }
      }
    }
    try { startWebSocket(); } catch { fail(new LocalizedError('error.connection')); }
  }
  queueMicrotask(() => { if (!closed) void start(); });
  return {
    get open() { return !closed && !ended && welcomed; },
    send(input) {
      if (closed || ended || !welcomed) return;
      if (socket) {
        if (socket.readyState === WS.OPEN && socket.bufferedAmount < 16 * 1024) socket.send(JSON.stringify(input));
        else if (socket.bufferedAmount >= 16 * 1024) fail(new LocalizedError('error.connection'));
      } else {
        // The newest complete input state replaces queued obsolete input.
        pendingInput = input; void writeInputs();
      }
    },
    close,
  };
}
