import type { MenuItem } from '../../core/models/menu.model';
import { filterMenuItems, sortMenuItemsByOrder } from './menu-filter.util';

const baseItem: Omit<MenuItem, 'id' | 'order' | 'name' | 'description'> = {
  code: 'X',
  price: 10,
  currency: 'EUR',
  allergens: [],
  available: true,
  recommended: false,
  vegetarian: false,
  vegan: false,
  spicy: false,
  glutenFree: false,
};

function makeItem(
  id: string,
  order: number,
  overrides: Partial<MenuItem> = {},
): MenuItem {
  return {
    id,
    order,
    name: { it: id },
    description: { it: `${id} description` },
    ...baseItem,
    ...overrides,
  };
}

describe('menu filter util', () => {
  it('filters by query and flags', () => {
    const items: MenuItem[] = [
      makeItem('margherita', 2, { vegetarian: true }),
      makeItem('diavola', 1, { spicy: true }),
    ];

    expect(filterMenuItems(items, { query: 'dia' }).map((x) => x.id)).toEqual(['diavola']);
    expect(filterMenuItems(items, { vegetarianOnly: true }).map((x) => x.id)).toEqual([
      'margherita',
    ]);
    expect(filterMenuItems(items, { spicyOnly: true }).map((x) => x.id)).toEqual(['diavola']);
  });

  it('sorts items by order', () => {
    const sorted = sortMenuItemsByOrder([makeItem('b', 2), makeItem('a', 1)]);
    expect(sorted.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
