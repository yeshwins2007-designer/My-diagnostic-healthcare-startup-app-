/**
 * The twelve languages the product speaks.
 *
 * These are exactly the eleven Indian languages ElevenLabs Agents supports,
 * plus English — so a caller can be answered by the voice agent in the same
 * language they picked in the app, with no gap between the two surfaces.
 */

export const LOCALES = [
  { key: 'en', english: 'English', native: 'English', dir: 'ltr', script: 'Latin' },
  { key: 'hi', english: 'Hindi', native: 'हिन्दी', dir: 'ltr', script: 'Devanagari' },
  { key: 'bn', english: 'Bengali', native: 'বাংলা', dir: 'ltr', script: 'Bengali' },
  { key: 'mr', english: 'Marathi', native: 'मराठी', dir: 'ltr', script: 'Devanagari' },
  { key: 'te', english: 'Telugu', native: 'తెలుగు', dir: 'ltr', script: 'Telugu' },
  { key: 'ta', english: 'Tamil', native: 'தமிழ்', dir: 'ltr', script: 'Tamil' },
  { key: 'kn', english: 'Kannada', native: 'ಕನ್ನಡ', dir: 'ltr', script: 'Kannada' },
  { key: 'gu', english: 'Gujarati', native: 'ગુજરાતી', dir: 'ltr', script: 'Gujarati' },
  { key: 'ml', english: 'Malayalam', native: 'മലയാളം', dir: 'ltr', script: 'Malayalam' },
  { key: 'pa', english: 'Punjabi', native: 'ਪੰਜਾਬੀ', dir: 'ltr', script: 'Gurmukhi' },
  { key: 'ur', english: 'Urdu', native: 'اردو', dir: 'rtl', script: 'Arabic' },
  { key: 'as', english: 'Assamese', native: 'অসমীয়া', dir: 'ltr', script: 'Bengali' },
] as const;

export type Locale = (typeof LOCALES)[number]['key'];

export const LOCALE_KEYS = LOCALES.map((l) => l.key) as Locale[];

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (LOCALE_KEYS as string[]).includes(value);
}

export function localeMeta(key: Locale) {
  return LOCALES.find((l) => l.key === key) ?? LOCALES[0];
}

/** Urdu reads right-to-left; the layout flips rather than mirroring text. */
export function localeDir(key: Locale): 'ltr' | 'rtl' {
  return localeMeta(key).dir;
}
