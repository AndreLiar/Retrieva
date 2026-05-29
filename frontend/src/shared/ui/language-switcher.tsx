'use client';

import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SUPPORTED_LANGUAGES } from '@/shared/i18n/config';
import { Button } from '@/shared/ui/button';

/**
 * Compact EN | FR segmented switcher. Persists to the language cookie so the
 * choice survives reloads; sits next to the theme toggle in the headers.
 */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);

  const setLanguage = (lng: string) => {
    if (lng === current) return;
    // LanguageDetector persists the choice to cookie + localStorage (see config.ts `caches`).
    void i18n.changeLanguage(lng);
  };

  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex items-center gap-0.5 rounded-md border bg-background p-0.5"
    >
      <Languages className="mx-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {SUPPORTED_LANGUAGES.map((lng) => (
        <Button
          key={lng}
          type="button"
          size="sm"
          variant={current === lng ? 'secondary' : 'ghost'}
          aria-pressed={current === lng}
          className="h-7 px-2 text-xs font-medium"
          onClick={() => setLanguage(lng)}
        >
          {lng.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
