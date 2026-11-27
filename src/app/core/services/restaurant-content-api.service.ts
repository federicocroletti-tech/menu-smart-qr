import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {
  Observable,
  catchError,
  forkJoin,
  map,
  of,
  shareReplay,
  switchMap,
  throwError,
} from 'rxjs';

import type { Allergen } from '../models/allergen.model';
import type { Client } from '../models/client.model';
import type { MenuCategory, MenuIndex } from '../models/menu.model';
import { RuntimeConfigService } from './runtime-config.service';

export interface RestaurantContent {
  client: Client;
  allergens: Allergen[];
  menuIndex: MenuIndex;
  menuCategories: Record<string, Partial<MenuCategory>>;
}

@Injectable({
  providedIn: 'root',
})
export class RestaurantContentApiService {
  private readonly contentByRestaurantId = new Map<
    string,
    Observable<RestaurantContent>
  >();

  constructor(
    private readonly http: HttpClient,
    private readonly runtimeConfig: RuntimeConfigService,
  ) {}

  get isBundledContentMode(): boolean {
    return !this.runtimeConfig.isApiConfigured;
  }

  getRestaurantContent(restaurantId: string): Observable<RestaurantContent> {
    const cached = this.contentByRestaurantId.get(restaurantId);
    if (cached) {
      return cached;
    }

    const request = (
      this.isBundledContentMode
        ? this.getBundledContent(restaurantId)
        : this.http.get<RestaurantContent>(
            `${this.runtimeConfig.apiV1BaseUrl}/restaurants/${encodeURIComponent(restaurantId)}/content`,
          )
    ).pipe(
      catchError((error: unknown) => {
        this.contentByRestaurantId.delete(restaurantId);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.contentByRestaurantId.set(restaurantId, request);
    return request;
  }

  private getBundledContent(
    restaurantId: string,
  ): Observable<RestaurantContent> {
    const basePath = `assets/clients/${encodeURIComponent(restaurantId)}`;

    return forkJoin({
      client: this.http.get<Client>(`${basePath}/client.json`),
      allergens: this.http.get<Allergen[]>(`${basePath}/allergens.json`),
      menuIndex: this.http.get<MenuIndex>(`${basePath}/menu/index.json`),
    }).pipe(
      switchMap(({ client, allergens, menuIndex }) => {
        const categoryFiles = Array.from(
          new Set(
            (menuIndex.categories ?? [])
              .map((category) => category.file)
              .filter((file): file is string => Boolean(file)),
          ),
        );
        const categoryRequests = categoryFiles.map((file) =>
          this.http.get<Partial<MenuCategory>>(
            `${basePath}/menu/${encodeURIComponent(file)}`,
          ),
        );
        const categories$ = categoryRequests.length
          ? forkJoin(categoryRequests)
          : of<Partial<MenuCategory>[]>([]);

        return categories$.pipe(
          map((categories) => {
            const menuCategories: Record<string, Partial<MenuCategory>> = {};
            categoryFiles.forEach((file, index) => {
              menuCategories[file] = categories[index];
            });

            return {
              client: {
                ...client,
                settings: {
                  ...client.settings,
                  featureFlags: {
                    ...client.settings.featureFlags,
                    enableOrders: false,
                    enableReservations: false,
                  },
                },
                reservations: client.reservations
                  ? { ...client.reservations, enabled: false }
                  : undefined,
              },
              allergens,
              menuIndex,
              menuCategories,
            };
          }),
        );
      }),
    );
  }
}
