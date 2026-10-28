import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap } from '../scripts/runtime-bootstrap.mjs';
import { cohortStorageKey } from '../scripts/asset-route.mjs';

const assets = { entry: 'assets/game-hash.js', modules: ['assets/game-hash.js'], styles: ['assets/game-hash.css'] };

function environment(context: any, sample: string, config: unknown, failCDN = false, failStyles = false) {
  const values = new Map([[cohortStorageKey, sample]]), requests: string[] = [], links: any[] = [], modules: string[] = [];
  const app = { textContent: '', append() {} }, dataset: Record<string, string> = {};
  const bindings = {
    document: {
      documentElement: { dataset },
      getElementById: () => app,
      createElement: (tag: string) => ({ tag, remove() { this.removed = true; } }),
      head: { append: (link: any) => { links.push(link); if (link.rel === 'stylesheet') queueMicrotask(() => failStyles && link.href.startsWith('https://assets.example/') ? link.onerror() : link.onload()); } },
    },
    location: { origin: 'https://game.example', reload() {} },
    sessionStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
    navigator: { language: 'en' },
    fetch: async (url: string | URL) => {
      requests.push(String(url));
      if (url === '/api/client-config') return new Response(JSON.stringify(config), { headers: { 'Content-Type': 'application/json' } });
      if (failCDN) throw new TypeError('CDN unavailable');
      return new Response('module source', { headers: { 'Content-Type': 'text/javascript' } });
    },
  };
  for (const [name, value] of Object.entries(bindings)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    context.after(() => { if (old) Object.defineProperty(globalThis, name, old); else Reflect.deleteProperty(globalThis, name); });
  }
  return { values, requests, links, modules, dataset, importModule: async (url: string) => { modules.push(url); } };
}

test('CDN session resolves entry, CSS and favicon beneath the same release prefix', async context => {
  const env = environment(context, '0.75', { assetBaseURL: 'https://assets.example/no-warthunder/releases/r1/', originAssetRatio: 0.1 });
  await bootstrap(assets, env.importModule);
  assert.deepEqual(env.modules, ['https://assets.example/no-warthunder/releases/r1/assets/game-hash.js']);
  assert.equal(env.links[0].href, 'https://assets.example/no-warthunder/releases/r1/assets/game-hash.css');
  assert.equal(env.links[1].href, 'https://assets.example/no-warthunder/releases/r1/favicon.svg');
  assert.deepEqual(env.dataset, { assetCohort: 'cdn', assetOrigin: 'cdn' });
});

test('10% origin session never makes a CDN request', async context => {
  const env = environment(context, '0.05', { assetBaseURL: 'https://assets.example/r1/', originAssetRatio: 0.1 });
  await bootstrap(assets, env.importModule);
  assert.deepEqual(env.modules, ['https://game.example/assets/game-hash.js']);
  assert.deepEqual(env.requests, ['/api/client-config']);
  assert.deepEqual(env.dataset, { assetCohort: 'origin', assetOrigin: 'origin' });
});

test('CDN failure falls back once and remembers this release for the session', async context => {
  const env = environment(context, '0.75', { assetBaseURL: 'https://assets.example/r1/', originAssetRatio: 0.1 }, true);
  await bootstrap(assets, env.importModule);
  assert.deepEqual(env.modules, ['https://game.example/assets/game-hash.js']);
  assert.equal(env.values.get('nwt.asset-fallback:assets/game-hash.js'), '1');
  assert.deepEqual(env.dataset, { assetCohort: 'cdn', assetOrigin: 'origin' });
  await bootstrap(assets, env.importModule);
  assert.equal(env.requests.filter(url => url.startsWith('https://assets.example/')).length, 1);
});

test('malformed runtime config safely uses origin assets', async context => {
  const env = environment(context, '0.75', null);
  await bootstrap(assets, env.importModule);
  assert.deepEqual(env.modules, ['https://game.example/assets/game-hash.js']);
});

test('an application evaluation error never starts a second copy from origin', async context => {
  const env = environment(context, '0.75', { assetBaseURL: 'https://assets.example/r1/', originAssetRatio: 0.1 });
  const imports: string[] = [];
  await bootstrap(assets, async (url: string) => { imports.push(url); throw new Error('Application evaluation failed'); });
  assert.deepEqual(imports, ['https://assets.example/r1/assets/game-hash.js']);
  assert.equal(env.values.has('nwt.asset-fallback:assets/game-hash.js'), false);
});


test('CDN stylesheet failure removes its stylesheet before origin fallback', async context => {
  const env = environment(context, '0.75', { assetBaseURL: 'https://assets.example/r1/', originAssetRatio: 0.1 }, false, true);
  await bootstrap(assets, env.importModule);
  assert.deepEqual(env.modules, ['https://game.example/assets/game-hash.js']);
  assert.equal(env.links[0].removed, true);
  assert.equal(env.links[1].href, 'https://game.example/assets/game-hash.css');
});
