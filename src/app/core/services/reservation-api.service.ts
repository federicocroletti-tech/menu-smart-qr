import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';

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
  tableNames?: string[];
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
  expiresAt: string | null;
  tableIds: string[];
  tableNames?: string[];
}

export interface ReservationConfirmationRequest {
  holdToken: string;
  bookingTermsVersion: string;
  privacyNoticeVersion: string;
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
  private static readonly requestTimeoutMs = 15_000;

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
    ).pipe(timeout(ReservationApiService.requestTimeoutMs));
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
    ).pipe(timeout(ReservationApiService.requestTimeoutMs));
  }

  confirmReservation(
    request: ReservationConfirmationRequest,
  ): Observable<ReservationConfirmation> {
    return this.http.post<ReservationConfirmation>(
      `${this.runtimeConfig.apiV1BaseUrl}/reservations`,
      request,
    ).pipe(timeout(ReservationApiService.requestTimeoutMs));
  }

  releaseReservationHold(holdToken: string): Observable<{ status: ReservationStatus }> {
    return this.http.post<{ status: ReservationStatus }>(
      `${this.runtimeConfig.apiV1BaseUrl}/reservation-holds/release`,
      { holdToken },
    ).pipe(timeout(ReservationApiService.requestTimeoutMs));
  }

  getReservation(confirmationCode: string): Observable<ReservationDetails> {
    return this.http.get<ReservationDetails>(
      `${this.runtimeConfig.apiV1BaseUrl}/reservations/${encodeURIComponent(confirmationCode)}`,
    ).pipe(timeout(ReservationApiService.requestTimeoutMs));
  }

  cancelReservation(
    confirmationCode: string,
  ): Observable<ReservationCancellation> {
    return this.http.post<ReservationCancellation>(
      `${this.runtimeConfig.apiV1BaseUrl}/reservations/${encodeURIComponent(confirmationCode)}/cancellation`,
      null,
    ).pipe(timeout(ReservationApiService.requestTimeoutMs));
  }
}
