import type { MenuCategory, MenuItem } from '../../core/models/menu.model';

export interface MenuFilter {
  query?: string;
  recommendedOnly?: boolean;
  vegetarianOnly?: boolean;
  veganOnly?: boolean;
  glutenFreeOnly?: boolean;
  spicyOnly?: boolean;
  availableOnly?: boolean;
}

export function filterMenuItems(
  items: MenuItem[],
  filter: MenuFilter,
): MenuItem[] {
  const normalizedQuery = filter.query?.trim().toLowerCase();

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

    if (filter.availableOnly && !item.available) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const names = Object.values(item.name).filter(
      (value): value is string => !!value,
    );
    const descriptions = Object.values(item.description).filter(
      (value): value is string => !!value,
    );
    return [...names, ...descriptions].some((entry) =>
      entry.toLowerCase().includes(normalizedQuery),
    );
  });
}

export function sortMenuItemsByOrder(items: MenuItem[]): MenuItem[] {
  return [...items].sort((a, b) => a.order - b.order);
}

export function sortCategoriesByOrder(categories: MenuCategory[]): MenuCategory[] {
  return [...categories].sort((a, b) => a.order - b.order);
}
