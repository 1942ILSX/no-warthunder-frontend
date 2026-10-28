import { readFile, writeFile } from 'node:fs/promises';
import { chooseAssetRoute, normalizeAssetBase, cohortStorageKey } from './asset-route.mjs';
import { bootstrap } from './runtime-bootstrap.mjs';

const root = new URL('../dist/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', root), 'utf8'));
const entry = Object.values(manifest).find(item => item.isEntry && item.src === 'index.html');
if (!entry) throw new Error('Vite entry manifest is missing');
const styles = new Set(), modules = new Set();
function collect(item) {
  if (modules.has(item.file)) return;
  modules.add(item.file);
  for (const css of item.css ?? []) styles.add(css);
  for (const imported of item.imports ?? []) collect(manifest[imported]);
}
collect(entry);
const assets = { entry: entry.file, styles: [...styles], modules: [...modules] };


let html = await readFile(new URL('index.html', root), 'utf8');
html = html.replace(/\s*<script\b[^>]*\btype="module"[^>]*>[\s\S]*?<\/script>/g, '')
  .replace(/\s*<link\b[^>]*\brel="(?:stylesheet|modulepreload|icon)"[^>]*>/g, '');
const source = `const cohortStorageKey=${JSON.stringify(cohortStorageKey)};\n${chooseAssetRoute}\n${normalizeAssetBase}\n(${bootstrap})(${JSON.stringify(assets)});`;
html = html.replace('</body>', `<script type="module">${source.replaceAll('</script', '<\\/script')}</script>\n  </body>`);
await writeFile(new URL('index.html', root), html);
await writeFile(new URL('asset-manifest.json', root), JSON.stringify(assets, null, 2) + '\n');
console.log(`Production bootstrap: ${assets.modules.length} JS modules, ${assets.styles.length} stylesheets; stable session cohort.`);
