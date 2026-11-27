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

  it('searches accent-insensitively across ingredients, tags, notes, and dish codes', () => {
    const item = makeItem('pizza', 1, {
      code: 'P-42',
      ingredients: [{ it: 'pomodori freschi' }],
      tags: [{ it: 'specialità della casa' }],
      notes: { it: 'Impasto leggero' },
    });

    expect(filterMenuItems([item], { query: 'SPECIALITA' })).toEqual([item]);
    expect(filterMenuItems([item], { query: 'pomodori' })).toEqual([item]);
    expect(filterMenuItems([item], { query: 'p-42' })).toEqual([item]);
    expect(filterMenuItems([item], { query: 'salmone' })).toEqual([]);
  });

  it('filters unavailable dishes only when the availability filter is active', () => {
    const items = [
      makeItem('available', 1),
      makeItem('unavailable', 2, { available: false }),
    ];

    expect(filterMenuItems(items, {}).map((item) => item.id)).toEqual([
      'available',
      'unavailable',
    ]);
    expect(filterMenuItems(items, { availableOnly: true }).map((item) => item.id))
      .toEqual(['available']);
  });

  it('sorts items by order', () => {
    const sorted = sortMenuItemsByOrder([makeItem('b', 2), makeItem('a', 1)]);
    expect(sorted.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
