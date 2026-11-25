import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, switchMap } from 'rxjs';

import type { Client } from '../models/client.model';
import { AppConfigService } from './app-config.service';
import { RestaurantContentApiService } from './restaurant-content-api.service';

@Injectable({
  providedIn: 'root',
})
export class ClientService {
  private readonly client$: Observable<Client | null>;

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly contentApi: RestaurantContentApiService,
  ) {
    this.client$ = this.appConfigService.getActiveClient().pipe(
      switchMap((restaurantId) =>
        this.contentApi
          .getRestaurantContent(restaurantId)
          .pipe(map((content) => content.client)),
      ),
      catchError((error: unknown) => {
        console.error('Failed to load client data:', error);
        return of(null);
      }),
      shareReplay(1),
    );
  }

  getClient(): Observable<Client | null> {
    return this.client$;
  }
}
