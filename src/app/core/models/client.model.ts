import type { LocalizedText, SupportedLanguage } from './i18n.model';

export type ClientType = 'restaurant' | 'bar' | 'pub' | 'pizzeria' | 'other';

export interface ClientTheme {
  primary?: string;
  secondary?: string;
  background?: string;
  surface?: string;
  text?: string;
  muted?: string;
  border?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  textColor?: string;
  backgroundColor?: string;
  customCssVariables?: Record<string, string>;
}

export interface ClientContacts {
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  address?: LocalizedText;
  mapsUrl?: string;
  social?: {
    facebook?: string;
    instagram?: string;
    tiktok?: string;
  };
}

export interface OpeningHourSlot {
  open: string;
  close: string;
}

export interface OpeningHourDay {
  day: string;
  closed?: boolean;
  slots?: OpeningHourSlot[];
}

export interface ClientSeo {
  title: LocalizedText;
  description: LocalizedText;
  keywords?: LocalizedText;
  ogImage?: string;
  canonicalUrl?: string;
  imageUrl?: string;
}

export interface ClientFeatureFlags {
  enableSearch?: boolean;
  enableRecommended?: boolean;
  enableCategoryNav?: boolean;
  enableAllergenList?: boolean;
  [flag: string]: boolean | undefined;
}

export interface ClientSettings {
  defaultLanguage: SupportedLanguage;
  enabledLanguages: SupportedLanguage[];
  featureFlags: ClientFeatureFlags;
}

export interface Client {
  id: string;
  name: string;
  type: ClientType;
  description: LocalizedText;
  logoUrl?: string;
  coverImageUrl?: string;
  theme: ClientTheme;
  contacts: ClientContacts;
  openingHours: OpeningHourDay[];
  seo: ClientSeo;
  settings: ClientSettings;
  notes: LocalizedText;
}
