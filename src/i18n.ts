import { en } from './locales/en.ts';
import { zh_cn } from './locales/zh_cn.ts';
import { jp } from './locales/jp.ts';
import type { MessageKey, Messages } from './locales/en.ts';

export type { MessageKey, Messages } from './locales/en.ts';
export type Locale = 'en' | 'zh_cn' | 'jp';
export type Params = Record<string, string | number>;
export const catalogs: Record<Locale, Messages> = { en, zh_cn, jp };
export const htmlLanguages: Record<Locale, string> = { en: 'en', zh_cn: 'zh-CN', jp: 'ja' };
export const localeStorageKey = 'bcr-locale';

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  if (normalized === 'jp' || normalized === 'ja' || normalized.startsWith('ja-')) return 'jp';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  if (normalized === 'zh' || normalized === 'zh-cn' || normalized === 'zh-sg' || normalized === 'zh-hans' || normalized.startsWith('zh-hans-')) return 'zh_cn';
  return null;
}

export function resolveLocale(saved: string | null, preferred: readonly string[]): Locale {
  const stored = normalizeLocale(saved);
  if (stored) return stored;
  for (const language of preferred) { const supported = normalizeLocale(language); if (supported) return supported; }
  return 'en';
}

export function translate(locale: Locale, key: MessageKey, params: Params = {}): string {
  const text = catalogs[locale][key] ?? en[key];
  return text.replace(/\{(\w+)\}/g, (token, name: string) => params[name] === undefined ? token : String(params[name]));
}

function initialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  let saved: string | null = null;
  try { saved = window.localStorage.getItem(localeStorageKey); } catch { /* Preference storage is optional. */ }
  return resolveLocale(saved, typeof navigator === 'undefined' ? [] : navigator.languages);
}
let activeLocale = initialLocale();
export const getLocale = (): Locale => activeLocale;
export const t = (key: MessageKey, params?: Params): string => translate(activeLocale, key, params);

export function setLocale(locale: Locale): void {
  activeLocale = locale;
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(localeStorageKey, locale); } catch { /* Preference storage is optional. */ }
  }
  updateDocumentLanguage();
}

export function updateDocumentLanguage(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = htmlLanguages[activeLocale];
  document.documentElement.dataset.locale = activeLocale;
  document.title = t('app.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'));
}

/** Translate text/attributes in-place: never rebuild game canvases, inputs or dialogs. */
export function applyTranslations(root: ParentNode = document): void {
  root.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n') as MessageKey;
    let params: Params = {};
    try { params = JSON.parse(element.getAttribute('data-i18n-params') || '{}') as Params; } catch { /* Static UI metadata only. */ }
    element.textContent = t(key, params);
  });
  for (const attribute of ['aria-label', 'title', 'placeholder'] as const) {
    root.querySelectorAll(`[data-i18n-${attribute}]`).forEach(element => {
      const key = element.getAttribute(`data-i18n-${attribute}`) as MessageKey;
      element.setAttribute(attribute, t(key));
    });
  }
}
