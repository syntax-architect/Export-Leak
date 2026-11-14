import { dictionaries } from "./dictionaries";
import type { SupportedLocale, TranslationDictionary } from "./types";

export * from "./types";
export * from "./dictionaries";

export const DEFAULT_LOCALE: SupportedLocale = "en";

export function getDictionary(locale: SupportedLocale = DEFAULT_LOCALE): TranslationDictionary {
  return dictionaries[locale] || dictionaries[DEFAULT_LOCALE];
}

/**
 * Type-safe path accessor for nested dictionary keys
 */
export function translate<
  Section extends keyof TranslationDictionary,
  Key extends keyof TranslationDictionary[Section],
>(section: Section, key: Key, locale: SupportedLocale = DEFAULT_LOCALE): string {
  const dict = getDictionary(locale);
  return (dict[section][key] as string) || (dictionaries.en[section][key] as string);
}
