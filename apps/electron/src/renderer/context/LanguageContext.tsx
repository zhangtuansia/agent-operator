/**
 * Language Context
 *
 * Provides internationalization support throughout the app.
 * Manages the current language and provides translation functions.
 */

import * as React from 'react';
import {
  type Language,
  type TranslationKeys,
  getTranslations,
  getNestedValue,
  detectSystemLanguage,
} from '../i18n';

interface LanguageContextValue {
  /** Current language code */
  language: Language;
  /** Set the current language */
  setLanguage: (language: Language) => void;
  /** Get all translations for current language */
  translations: TranslationKeys;
  /** Translation function - get a specific translation by key path */
  t: (key: string) => string;
}

const LanguageContext = React.createContext<LanguageContextValue | null>(null);

interface LanguageProviderProps {
  children: React.ReactNode;
  /** Initial language (from stored config) */
  initialLanguage?: Language;
}

export function LanguageProvider({ children, initialLanguage }: LanguageProviderProps) {
  const [language, setLanguageState] = React.useState<Language>(
    initialLanguage || detectSystemLanguage()
  );

  const translations = React.useMemo(() => getTranslations(language), [language]);

  const t = React.useCallback(
    (key: string): string => getNestedValue(translations, key),
    [translations]
  );

  const setLanguage = React.useCallback(async (newLanguage: Language) => {
    setLanguageState(newLanguage);

    // Persist to config
    if (window.electronAPI?.setLanguage) {
      try {
        await window.electronAPI.setLanguage(newLanguage);
      } catch (error) {
        console.error('Failed to save language preference:', error);
      }
    }
  }, []);

  const value = React.useMemo(
    () => ({
      language,
      setLanguage,
      translations,
      t,
    }),
    [language, setLanguage, translations, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Hook to access language context
 */
export function useLanguage(): LanguageContextValue {
  const context = React.useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

/**
 * Hook to get the translation function only
 */
export function useTranslation() {
  const { t, language } = useLanguage();
  return { t, language };
}
