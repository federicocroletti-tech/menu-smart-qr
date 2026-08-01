export type SupportedLanguage = 'it' | 'en' | 'fr' | 'de';

export type LocalizedText = Partial<Record<SupportedLanguage, string>>;

export type TranslationValue = string | TranslationDictionary;

export interface TranslationDictionary {
  [key: string]: TranslationValue;
}

export interface I18nConfig {
  defaultLanguage: SupportedLanguage;
  availableLanguages: SupportedLanguage[];
  translations: Record<SupportedLanguage, TranslationDictionary>;
}
