import type { LocalizedText, SupportedLanguage } from './i18n.model';

export interface PriceVariant {
  id: string;
  name: LocalizedText;
  price: number;
  discountedPrice?: number;
  order?: number;
}

export interface MenuItem {
  id: string;
  code?: string;
  name: LocalizedText;
  description: LocalizedText;
  price: number;
  discountedPrice?: number;
  currency: string;
  imageUrl?: string;
  imageAlt?: LocalizedText;
  allergens: string[];
  ingredients?: LocalizedText[];
  available: boolean;
  recommended: boolean;
  vegetarian: boolean;
  vegan: boolean;
  spicy: boolean;
  glutenFree: boolean;
  spicyLevel?: number;
  order: number;
  tags?: LocalizedText[];
  priceVariants?: PriceVariant[];
  notes?: LocalizedText;
}

export interface MenuCategoryConfig {
  id: string;
  name: LocalizedText;
  description?: LocalizedText;
  icon?: string;
  order: number;
  enabled: boolean;
  file?: string;
}

export interface MenuCategory extends Omit<MenuCategoryConfig, 'file'> {
  items: MenuItem[];
}

export interface MenuIndex {
  clientId: string;
  currency: string;
  language?: SupportedLanguage;
  categories: MenuCategoryConfig[];
  updatedAt?: string;
}
