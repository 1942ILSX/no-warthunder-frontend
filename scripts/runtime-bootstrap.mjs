import { chooseAssetRoute, normalizeAssetBase } from './asset-route.mjs';

/** This function is embedded after Vite builds; no asset request precedes selection. */
export async function bootstrap(assets, importModule = url => import(url)) {
  const app = document.getElementById('app');
  const language = (navigator.language || 'en').toLowerCase();
  const words = language.startsWith('zh') ? ['正在加载游戏…', '游戏加载失败，请重试。', '重试']
    : language.startsWith('ja') ? ['ゲームを読み込み中…', 'ゲームを読み込めませんでした。もう一度お試しください。', '再試行']
      : ['Loading game…', 'Unable to load the game. Please try again.', 'Retry'];
  app.textContent = words[0];
  let storage;
  try { storage = sessionStorage; } catch { /* Private browsing can disable storage. */ }
  let config = {};
  try {
    const response = await fetch('/api/client-config', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (response.ok) config = await response.json();
  } catch { /* A runtime-config outage does not prevent origin asset delivery. */ }
  if (!config || typeof config !== 'object') config = {};
  const cdnBase = normalizeAssetBase(config.assetBaseURL);
  const route = chooseAssetRoute(storage, config.originAssetRatio, () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296);
  const originBase = location.origin + '/';
  const fallbackKey = 'nwt.asset-fallback:' + assets.entry;
  let hadFailure = false;
  try { hadFailure = storage?.getItem(fallbackKey) === '1'; } catch { /* Optional persistence. */ }
  const primary = route === 'cdn' && cdnBase && !hadFailure ? cdnBase : originBase;
  document.documentElement.dataset.assetCohort = route;

  let applicationImportStarted = false;
  async function load(base) {
    const links = [];
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 8000);
    try {
      if (base !== originBase) {
        // Warm the HTTP cache using abortable requests. Timing out import()
        // itself would let a late module execute after origin fallback.
        await Promise.all(assets.modules.map(async file => {
          const response = await fetch(new URL(file, base), { mode: 'cors', credentials: 'omit', signal: abort.signal });
          if (!response.ok) throw new Error('Asset unavailable');
          await response.arrayBuffer();
        }));
      }
      if (abort.signal.aborted) throw new Error('Asset timed out');
      await Promise.all(assets.styles.map(file => new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.crossOrigin = 'anonymous'; link.href = new URL(file, base).href;
        const cancel = () => { link.remove(); reject(new Error('Asset timed out')); };
        abort.signal.addEventListener('abort', cancel, { once: true });
        link.onload = () => { abort.signal.removeEventListener('abort', cancel); resolve(); };
        link.onerror = () => { abort.signal.removeEventListener('abort', cancel); reject(new Error('Asset unavailable')); };
        links.push(link); document.head.append(link);
      })));
      clearTimeout(timer);
      document.documentElement.dataset.assetOrigin = base === originBase ? 'origin' : 'cdn';
      applicationImportStarted = true;
      await importModule(new URL(assets.entry, base).href);
      const favicon = document.createElement('link');
      favicon.rel = 'icon'; favicon.type = 'image/svg+xml'; favicon.href = new URL('favicon.svg', base).href;
      document.head.append(favicon);
    } catch (error) {
      abort.abort(); for (const link of links) link.remove(); throw error;
    } finally { clearTimeout(timer); }
  }
  try {
    try { await load(primary); }
    catch (error) {
      // Once evaluation starts, retrying another module URL could initialize
      // the application twice if its own code threw after side effects.
      if (primary === originBase || applicationImportStarted) throw error;
      try { storage?.setItem(fallbackKey, '1'); } catch { /* Optional persistence. */ }
      await load(originBase);
    }
  } catch {
    app.textContent = words[1];
    const retry = document.createElement('button'); retry.textContent = words[2];
    retry.onclick = () => location.reload(); app.append(document.createElement('br'), retry);
  }
}
