export const cohortStorageKey = 'nwt.asset-cohort.v1';

/** A browser tab session keeps one draw across reloads and game rooms. */
export function chooseAssetRoute(storage, ratio, draw) {
  const fraction = Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : 0.1;
  let sample;
  try {
    const saved = storage?.getItem(cohortStorageKey);
    if (saved !== null && saved !== undefined && saved !== '') sample = Number(saved);
  } catch { /* Storage can be disabled; this page still works. */ }
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    sample = draw();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) sample = 0;
    try { storage?.setItem(cohortStorageKey, String(sample)); } catch { /* Optional persistence. */ }
  }
  return sample < fraction ? 'origin' : 'cdn';
}

export function normalizeAssetBase(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.href;
  } catch { return null; }
}
