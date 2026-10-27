import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { ru } from './locales/ru';

/** Languages of the app; add one here plus its `locales/<code>` folder. */
export const LANGUAGES = [
  { code: 'en', name: 'English', locale: 'en-US' },
  { code: 'ru', name: 'Русский', locale: 'ru-RU' },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];

const KEY = 'buildkit/language';

/** Saved choice, else the browser's language if we have it, else English. */
function detect(): Language {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGUAGES.some((l) => l.code === saved)) return saved as Language;
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const tag of nav) {
    const code = tag.slice(0, 2).toLowerCase();
    if (LANGUAGES.some((l) => l.code === code)) return code as Language;
  }
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en, ru },
  lng: detect(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: Object.keys(en),
  interpolation: { escapeValue: false }, // React escapes
  returnNull: false,
});

const applyLang = (lng: string) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
};
applyLang(i18n.language);
i18n.on('languageChanged', applyLang);

export function setLanguage(code: Language): void {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* storage unavailable */
  }
  void i18n.changeLanguage(code);
}

/** BCP-47 locale for number / date formatting in the current language. */
export const currentLocale = (): string => LANGUAGES.find((l) => l.code === i18n.language)?.locale ?? 'en-US';

export default i18n;
