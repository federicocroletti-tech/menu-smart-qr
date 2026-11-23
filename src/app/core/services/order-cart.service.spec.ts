import type { MenuItem } from '../models/menu.model';
import { OrderCartService } from './order-cart.service';

function createItem(id: string): MenuItem {
  return {
    id,
    name: { it: id },
    description: { it: '' },
    price: 5,
    currency: 'EUR',
    allergens: [],
    available: true,
    recommended: false,
    vegetarian: false,
    vegan: false,
    spicy: false,
    glutenFree: false,
    order: 0,
  };
}

describe('OrderCartService', () => {
  it('combines repeated items and removes them by quantity', () => {
    const cart = new OrderCartService();
    const item = createItem('pizza');

    cart.add(item);
    cart.add(item);
    expect(cart.getEntries()).toEqual([{ item, quantity: 2 }]);

    cart.remove(item.id);
    expect(cart.getEntries()).toEqual([{ item, quantity: 1 }]);

    cart.remove(item.id);
    expect(cart.getEntries()).toEqual([]);
  });

  it('clears all items and ignores removal of absent items', () => {
    const cart = new OrderCartService();
    cart.add(createItem('pizza'));
    cart.remove('missing');
    expect(cart.getEntries()).toHaveLength(1);

    cart.clear();
    expect(cart.getEntries()).toEqual([]);
  });
});
