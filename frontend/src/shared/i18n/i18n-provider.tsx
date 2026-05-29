'use client';

import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';

import i18n from './config';

/**
 * Client provider that makes i18next available to the whole app and keeps the
 * <html lang> attribute in sync with the active language. Language detection
 * (cookie -> localStorage -> navigator) happens in `config.ts`; switching is
 * handled by the LanguageSwitcher and persists to the cookie.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const applyLang = (lng: string) => {
      if (typeof document !== 'undefined') {
        document.documentElement.lang = (lng || 'en').slice(0, 2);
      }
    };
    applyLang(i18n.resolvedLanguage || i18n.language || 'en');
    i18n.on('languageChanged', applyLang);
    return () => {
      i18n.off('languageChanged', applyLang);
    };
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
