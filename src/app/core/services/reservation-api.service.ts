import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { RuntimeConfigService } from './runtime-config.service';

export type ReservationStatus =
  | 'draft'
  | 'holding'
  | 'awaiting_guarantee'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled_by_guest'
  | 'cancelled_by_restaurant'
  | 'no_show'
  | 'expired';

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

export interface ReservationHoldRequest {
  date: string;
  time: string;
  partySize: number;
  allocationMode: 'guest_selected' | 'restaurant_assigned';
  tableIds?: string[];
}

export interface ReservationHold {
  holdToken: string;
  expiresAt: string;
  tableIds: string[];
}

export interface ReservationConfirmationRequest {
  holdToken: string;
  guest: {
    name: string;
    phone: string;
    email?: string;
    notes?: string;
  };
  acceptTerms: true;
  acceptPrivacy: true;
  marketingConsent: boolean;
}

export interface ReservationConfirmation {
  confirmationCode: string;
  status: ReservationStatus;
}

export interface ReservationDetails {
  status: ReservationStatus;
  startsAt: string;
  endsAt: string;
  partySize: number;
  tables: string[];
}

export interface ReservationCancellation {
  status: ReservationStatus;
  late: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ReservationApiService {
  constructor(
    private readonly http: HttpClient,
    private readonly runtimeConfig: RuntimeConfigService,
  ) {}

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
      `${this.runtimeConfig.apiV1BaseUrl}/restaurants/${encodeURIComponent(restaurantId)}/availability`,
      { params },
    );
  }

  createReservationHold(
    restaurantId: string,
    request: ReservationHoldRequest,
    idempotencyKey: string,
  ): Observable<ReservationHold> {
    return this.http.post<ReservationHold>(
      `${this.runtimeConfig.apiV1BaseUrl}/restaurants/${encodeURIComponent(restaurantId)}/reservation-holds`,
      request,
      {
        headers: new HttpHeaders().set('Idempotency-Key', idempotencyKey),
      },
    );
  }

  confirmReservation(
    request: ReservationConfirmationRequest,
  ): Observable<ReservationConfirmation> {
    return this.http.post<ReservationConfirmation>(
      `${this.runtimeConfig.apiV1BaseUrl}/reservations`,
      request,
    );
  }

  getReservation(confirmationCode: string): Observable<ReservationDetails> {
    return this.http.get<ReservationDetails>(
      `${this.runtimeConfig.apiV1BaseUrl}/reservations/${encodeURIComponent(confirmationCode)}`,
    );
  }

  cancelReservation(
    confirmationCode: string,
  ): Observable<ReservationCancellation> {
    return this.http.post<ReservationCancellation>(
      `${this.runtimeConfig.apiV1BaseUrl}/reservations/${encodeURIComponent(confirmationCode)}/cancellation`,
      null,
    );
  }
}
