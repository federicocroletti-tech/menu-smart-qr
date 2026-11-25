import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface AvailableTableSet {
  id: string;
  tableIds: string[];
  minCapacity: number;
  standardCapacity: number;
  maxCapacity: number;
}

export interface ReservationAvailability {
  date: string;
  time: string;
  partySize: number;
  durationMinutes: number;
  available: boolean;
  tableSets: AvailableTableSet[];
}

@Injectable({
  providedIn: 'root',
})
export class ReservationApiService {
  private readonly apiBaseUrl = '/api/v1';

  constructor(private readonly http: HttpClient) {}

  getAvailability(
    restaurantId: string,
    date: string,
    time: string,
    partySize: number,
  ): Observable<ReservationAvailability> {
    const params = new HttpParams()
      .set('date', date)
      .set('time', time)
      .set('partySize', partySize);

    return this.http.get<ReservationAvailability>(
      `${this.apiBaseUrl}/restaurants/${encodeURIComponent(restaurantId)}/availability`,
      { params },
    );
  }
}
