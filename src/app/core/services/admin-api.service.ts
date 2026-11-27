import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import type { ReservationStatus } from './reservation-api.service';
import { RuntimeConfigService } from './runtime-config.service';

export interface RestaurantMembership {
  restaurantId: string;
  name: string;
  timeZone: string;
  role: 'owner' | 'admin' | 'staff';
}

export interface AdminReservation {
  id: string;
  status: ReservationStatus;
  startsAt: string;
  endsAt: string;
  partySize: number;
  guestName: string | null;
  guestPhone: string | null;
  tables: string[];
}

export interface AdminReservationPage {
  restaurantId: string;
  date: string;
  reservations: AdminReservation[];
  hasMore: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AdminApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly runtimeConfig: RuntimeConfigService,
  ) {}

  getRestaurants(accessToken: string): Observable<{
    restaurants: RestaurantMembership[];
  }> {
    return this.http.get<{ restaurants: RestaurantMembership[] }>(
      `${this.runtimeConfig.apiV1BaseUrl}/me/restaurants`,
      { headers: this.authorization(accessToken) },
    );
  }

  getReservations(
    restaurantId: string,
    date: string,
    accessToken: string,
  ): Observable<AdminReservationPage> {
    const params = new HttpParams().set('date', date);
    return this.http.get<AdminReservationPage>(
      `${this.runtimeConfig.apiV1BaseUrl}/admin/restaurants/${encodeURIComponent(restaurantId)}/reservations`,
      {
        headers: this.authorization(accessToken),
        params,
      },
    );
  }

  private authorization(accessToken: string): HttpHeaders {
    return new HttpHeaders().set('Authorization', `Bearer ${accessToken}`);
  }
}
