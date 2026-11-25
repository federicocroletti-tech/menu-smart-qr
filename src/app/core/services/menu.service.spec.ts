import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import type { MenuCategory } from '../models/menu.model';
import { AppConfigService } from './app-config.service';
import { MenuService } from './menu.service';
import { RestaurantContentApiService } from './restaurant-content-api.service';

describe('MenuService', () => {
  it('builds enabled menu categories from database restaurant content', () => {
    const contentApi = {
      getRestaurantContent: () =>
        of({
          client: { id: 'demo' },
          allergens: [],
          menuIndex: {
            clientId: 'demo',
            currency: 'EUR',
            categories: [
              {
                id: 'pizza',
                name: { it: 'Pizze' },
                order: 1,
                enabled: true,
                file: 'pizze.json',
              },
              {
                id: 'hidden',
                name: { it: 'Nascosta' },
                order: 2,
                enabled: false,
                file: 'hidden.json',
              },
            ],
          },
          menuCategories: {
            'pizze.json': {
              id: 'pizza',
              items: [
                {
                  id: 'margherita',
                  name: { it: 'Margherita' },
                  description: { it: 'Pomodoro e mozzarella' },
                  price: 8,
                  currency: '',
                  allergens: [],
                  available: true,
                  recommended: false,
                  vegetarian: true,
                  vegan: false,
                  spicy: false,
                  glutenFree: false,
                  order: 1,
                },
              ],
            },
          },
        }),
    };

    TestBed.configureTestingModule({
      providers: [
        MenuService,
        {
          provide: AppConfigService,
          useValue: { getActiveClient: () => of('demo') },
        },
        {
          provide: RestaurantContentApiService,
          useValue: contentApi,
        },
      ],
    });

    const service = TestBed.inject(MenuService);
    let categories: MenuCategory[] | undefined;
    service.getMenuCategories().subscribe((value) => {
      categories = value;
    });

    expect(categories).toHaveLength(1);
    expect(categories?.[0].id).toBe('pizza');
    expect(categories?.[0].items[0].currency).toBe('EUR');
  });
});
