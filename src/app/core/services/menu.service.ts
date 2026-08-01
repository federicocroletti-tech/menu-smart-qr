import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, shareReplay, switchMap } from 'rxjs';

import type {
  MenuCategory,
  MenuCategoryConfig,
  MenuIndex,
  MenuItem,
} from '../models/menu.model';
import { AppConfigService } from './app-config.service';

@Injectable({
  providedIn: 'root',
})
export class MenuService {
  private readonly menuCategories$: Observable<MenuCategory[]>;

  constructor(
    private readonly http: HttpClient,
    private readonly appConfigService: AppConfigService,
  ) {
    this.menuCategories$ = this.appConfigService.getClientAssetsBasePath().pipe(
      switchMap((basePath) =>
        this.http.get<MenuIndex>(`${basePath}/menu/index.json`).pipe(
          switchMap((index) => {
            const enabledConfigs = (index.categories ?? [])
              .filter((category) => category.enabled)
              .sort((a, b) => a.order - b.order);

            if (enabledConfigs.length === 0) {
              return of([]);
            }

            const categoryRequests = enabledConfigs.map((config) =>
              this.loadCategory(basePath, config, index.currency),
            );

            return forkJoin(categoryRequests).pipe(
              map((categories) =>
                categories
                  .filter((category): category is MenuCategory => category !== null)
                  .sort((a, b) => a.order - b.order),
              ),
            );
          }),
        ),
      ),
      catchError((error: unknown) => {
        console.error('Failed to load menu index:', error);
        return of([]);
      }),
      shareReplay(1),
    );
  }

  getMenuCategories(): Observable<MenuCategory[]> {
    return this.menuCategories$;
  }

  private loadCategory(
    basePath: string,
    config: MenuCategoryConfig,
    defaultCurrency: string,
  ): Observable<MenuCategory | null> {
    if (!config.file) {
      return of(null);
    }

    const categoryUrl = `${basePath}/menu/${config.file}`;
    return this.http.get<Partial<MenuCategory>>(categoryUrl).pipe(
      map((categoryFile) => this.toMenuCategory(config, categoryFile, defaultCurrency)),
      catchError((error: unknown) => {
        console.warn(`Menu category file missing or invalid: ${categoryUrl}`, error);
        return of(null);
      }),
    );
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
