import type { MenuCategory, MenuItem } from '../../core/models/menu.model';

export interface MenuFilter {
  query?: string;
  recommendedOnly?: boolean;
  vegetarianOnly?: boolean;
  veganOnly?: boolean;
  glutenFreeOnly?: boolean;
  spicyOnly?: boolean;
  availableOnly?: boolean;
  includeUnavailable?: boolean;
}

export function filterMenuItems(
  items: MenuItem[],
  filter: MenuFilter,
): MenuItem[] {
  const normalizedQuery = normalizeSearchText(filter.query ?? '');

  return items.filter((item) => {
    if (filter.recommendedOnly && !item.recommended) {
      return false;
    }

    if (filter.vegetarianOnly && !item.vegetarian) {
      return false;
    }

    if (filter.veganOnly && !item.vegan) {
      return false;
    }

    if (filter.glutenFreeOnly && !item.glutenFree) {
      return false;
    }

    if (filter.spicyOnly && !item.spicy) {
      return false;
    }

    if (filter.availableOnly && !item.available && !filter.includeUnavailable) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const searchableFields = [
      ...Object.values(item.name),
      ...Object.values(item.description),
      ...(item.ingredients ?? []).flatMap((ingredient) => Object.values(ingredient)),
      ...(item.tags ?? []).flatMap((tag) => Object.values(tag)),
      ...Object.values(item.notes ?? {}),
      item.code ?? '',
    ];
    return searchableFields.some(
      (entry) =>
        typeof entry === 'string' &&
        normalizeSearchText(entry).includes(normalizedQuery),
    );
  });
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}

export function sortMenuItemsByOrder(items: MenuItem[]): MenuItem[] {
  return [...items].sort((a, b) => a.order - b.order);
}

export function sortCategoriesByOrder(categories: MenuCategory[]): MenuCategory[] {
  return [...categories].sort((a, b) => a.order - b.order);
}
