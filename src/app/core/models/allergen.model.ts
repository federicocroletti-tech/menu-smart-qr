import type { LocalizedText } from './i18n.model';

export interface Allergen {
  id: string;
  name: LocalizedText;
  description?: LocalizedText;
  icon?: string;
}
