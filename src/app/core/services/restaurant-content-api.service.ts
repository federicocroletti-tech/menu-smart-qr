import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

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

  getRestaurantContent(restaurantId: string): Observable<RestaurantContent> {
    const cached = this.contentByRestaurantId.get(restaurantId);
    if (cached) {
      return cached;
    }

    const request = this.http
      .get<RestaurantContent>(
        `${this.runtimeConfig.apiV1BaseUrl}/restaurants/${encodeURIComponent(restaurantId)}/content`,
      )
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    this.contentByRestaurantId.set(restaurantId, request);
    return request;
  }
}
