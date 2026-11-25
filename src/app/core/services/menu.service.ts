import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, switchMap } from 'rxjs';

import type {
  MenuCategory,
  MenuCategoryConfig,
  MenuItem,
} from '../models/menu.model';
import { AppConfigService } from './app-config.service';
import { RestaurantContentApiService } from './restaurant-content-api.service';

@Injectable({
  providedIn: 'root',
})
export class MenuService {
  private readonly menuCategories$: Observable<MenuCategory[]>;

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly contentApi: RestaurantContentApiService,
  ) {
    this.menuCategories$ = this.appConfigService.getActiveClient().pipe(
      switchMap((restaurantId) =>
        this.contentApi.getRestaurantContent(restaurantId).pipe(
          map((content) => {
            const enabledConfigs = (content.menuIndex.categories ?? [])
              .filter((category) => category.enabled)
              .sort((a, b) => a.order - b.order);

            return enabledConfigs
              .map((config) => {
                if (!config.file) {
                  return null;
                }

                const rawCategory = content.menuCategories[config.file];
                if (!rawCategory) {
                  console.error(`Menu category is missing from restaurant content: ${config.file}`);
                  return null;
                }

                return this.toMenuCategory(
                  config,
                  rawCategory,
                  content.menuIndex.currency,
                );
              })
              .filter((category): category is MenuCategory => category !== null)
              .sort((a, b) => a.order - b.order);
          }),
        ),
      ),
      catchError((error: unknown) => {
        console.error('Failed to load restaurant menu:', error);
        return of([]);
      }),
      shareReplay(1),
    );
  }

  getMenuCategories(): Observable<MenuCategory[]> {
    return this.menuCategories$;
  }

  private toMenuCategory(
    fallbackConfig: MenuCategoryConfig,
    rawCategory: Partial<MenuCategory>,
    defaultCurrency: string,
  ): MenuCategory | null {
    const id = rawCategory.id ?? fallbackConfig.id;
    const name = rawCategory.name ?? fallbackConfig.name;
    const order = rawCategory.order ?? fallbackConfig.order;
    const enabled = rawCategory.enabled ?? fallbackConfig.enabled;

    if (!id || !name || !enabled) {
      return null;
    }

    const items = (rawCategory.items ?? [])
      .filter((item): item is MenuItem => this.isValidMenuItem(item))
      .map((item) => this.normalizeItem(item, defaultCurrency))
      .sort((a, b) => a.order - b.order);

    return {
      id,
      name,
      description: rawCategory.description ?? fallbackConfig.description,
      icon: rawCategory.icon ?? fallbackConfig.icon,
      order,
      enabled,
      items,
    };
  }

  private normalizeItem(item: MenuItem, defaultCurrency: string): MenuItem {
    return {
      ...item,
      currency: item.currency || defaultCurrency,
    };
  }

  private isValidMenuItem(item: Partial<MenuItem>): item is MenuItem {
    return Boolean(
      item.id &&
        item.name &&
        item.description &&
        typeof item.price === 'number' &&
        Array.isArray(item.allergens) &&
        typeof item.available === 'boolean' &&
        typeof item.recommended === 'boolean' &&
        typeof item.vegetarian === 'boolean' &&
        typeof item.vegan === 'boolean' &&
        typeof item.spicy === 'boolean' &&
        typeof item.glutenFree === 'boolean' &&
        typeof item.order === 'number',
    );
  }
}
