/**
 * Internationalization (i18n) system for Cowork
 *
 * Supports English and Chinese languages.
 */

import { en, type TranslationKeys } from './en';
import { zh } from './zh';

export type Language = 'en' | 'zh';

export const LANGUAGES: { value: Language; label: string; nativeLabel: string }[] = [
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'zh', label: 'Chinese', nativeLabel: '中文' },
];

const translations: Record<Language, TranslationKeys> = {
  en,
  zh,
};

/**
 * Get translations for a specific language
 */
export function getTranslations(language: Language): TranslationKeys {
  return translations[language] || translations.en;
}

/**
 * Get a nested translation value using dot notation
 * e.g., t('appSettings.language') => 'Language'
 */
export function getNestedValue(obj: unknown, path: string): string {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path; // Return the key as fallback
    }
  }

  return typeof current === 'string' ? current : path;
}

/**
 * Detect system language and return supported language code
 */
export function detectSystemLanguage(): Language {
  if (typeof navigator !== 'undefined') {
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith('zh')) {
      return 'zh';
    }
  }
  return 'en';
}

export { en, zh };
export type { TranslationKeys };

// Re-export useTranslation hook from LanguageContext for convenience
export { useTranslation } from '../context/LanguageContext';
