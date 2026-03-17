import { useState, useCallback } from 'react';
import { getLanguage, setLanguage, Language, t as translate, TranslationKey } from '@/lib/i18n';

export function useLanguage() {
  const [lang, setLang] = useState<Language>(getLanguage());

  const toggleLanguage = useCallback(() => {
    const next = lang === 'zh-TW' ? 'en' : 'zh-TW';
    setLanguage(next);
    setLang(next);
  }, [lang]);

  const t = useCallback(
    (key: TranslationKey) => translate(key, lang),
    [lang]
  );

  return { lang, toggleLanguage, t };
}
