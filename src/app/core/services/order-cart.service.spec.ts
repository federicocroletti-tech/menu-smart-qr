import type { MenuItem } from '../models/menu.model';
import { OrderCartService } from './order-cart.service';
import { vi } from 'vitest';

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

  it('restores a restaurant cart after a new service instance is created', () => {
    localStorage.removeItem('menu-smart-qr:order-cart:restaurant-one');
    const item = createItem('pizza');
    const firstVisit = new OrderCartService();
    firstVisit.setRestaurant('restaurant-one');
    firstVisit.add(item);
    firstVisit.add(item);

    const refreshedVisit = new OrderCartService();
    refreshedVisit.setRestaurant('restaurant-one');

    expect(refreshedVisit.getEntries()).toEqual([{ item, quantity: 2 }]);
    localStorage.removeItem('menu-smart-qr:order-cart:restaurant-one');
  });

  it('does not restore one restaurant cart into another restaurant', () => {
    localStorage.removeItem('menu-smart-qr:order-cart:restaurant-one');
    localStorage.removeItem('menu-smart-qr:order-cart:restaurant-two');
    const firstVisit = new OrderCartService();
    firstVisit.setRestaurant('restaurant-one');
    firstVisit.add(createItem('pizza'));

    const secondRestaurant = new OrderCartService();
    secondRestaurant.setRestaurant('restaurant-two');

    expect(secondRestaurant.getEntries()).toEqual([]);
    localStorage.removeItem('menu-smart-qr:order-cart:restaurant-one');
    localStorage.removeItem('menu-smart-qr:order-cart:restaurant-two');
  });

  it('keeps the in-memory cart available and exposes storage failures', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cart = new OrderCartService();
    cart.setRestaurant('restaurant-storage-error');
    cart.add(createItem('pizza'));

    expect(cart.getEntries()).toHaveLength(1);
    expect(cart.persistenceError).toBe(true);

    setItem.mockRestore();
    consoleError.mockRestore();
    localStorage.removeItem('menu-smart-qr:order-cart:restaurant-storage-error');
  });
});
