import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import fr from './locales/fr.json';

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Cookie/localStorage key the active language is persisted under. */
export const LANGUAGE_STORAGE_KEY = 'retrieva_lang';

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        fr: { translation: fr },
      },
      fallbackLng: 'en',
      supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
      // strip region (e.g. fr-FR -> fr) so the navigator detector matches our keys
      load: 'languageOnly',
      interpolation: { escapeValue: false },
      detection: {
        order: ['cookie', 'localStorage', 'navigator'],
        lookupCookie: LANGUAGE_STORAGE_KEY,
        lookupLocalStorage: LANGUAGE_STORAGE_KEY,
        caches: ['cookie', 'localStorage'],
      },
      react: { useSuspense: false },
    });
}

export default i18n;
