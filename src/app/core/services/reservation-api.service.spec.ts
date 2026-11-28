import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  ReservationApiService,
  type ReservationAvailability,
  type ReservationCancellation,
  type ReservationConfirmation,
  type ReservationConfirmationRequest,
  type ReservationDetails,
  type ReservationHold,
  type ReservationHoldRequest,
} from './reservation-api.service';

describe('ReservationApiService', () => {
  let service: ReservationApiService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ReservationApiService,
      ],
    });
    service = TestBed.inject(ReservationApiService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  it('queries availability with the selected time and party size', () => {
    const response: ReservationAvailability = {
      date: '2099-12-31',
      time: '20:00',
      partySize: 2,
      durationMinutes: 120,
      available: true,
      tableSets: [],
    };
    let result: ReservationAvailability | undefined;

    service
      .getAvailability('restaurant id', '2099-12-31', '20:00', 2)
      .subscribe((availability) => {
        result = availability;
      });

    const request = httpTestingController.expectOne(
      (candidate) =>
        candidate.url === '/api/v1/restaurants/restaurant%20id/availability',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('date')).toBe('2099-12-31');
    expect(request.request.params.get('time')).toBe('20:00');
    expect(request.request.params.get('partySize')).toBe('2');
    request.flush(response);
    expect(result).toEqual(response);
    httpTestingController.verify();
  });

  it('creates an idempotent hold for the selected allocation mode', () => {
    const holdRequest: ReservationHoldRequest = {
      date: '2099-12-31',
      time: '20:00',
      partySize: 2,
      allocationMode: 'restaurant_assigned',
    };
    const response: ReservationHold = {
      holdToken: 'hold-token',
      expiresAt: '2099-12-31T19:05:00.000Z',
      tableIds: ['table-1'],
      tableNames: ['Table 1'],
    };
    let result: typeof response | undefined;

    service
      .createReservationHold('restaurant id', holdRequest, 'request-1')
      .subscribe((hold) => {
        result = hold;
      });

    const request = httpTestingController.expectOne(
      '/api/v1/restaurants/restaurant%20id/reservation-holds',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe('request-1');
    expect(request.request.body).toEqual(holdRequest);
    request.flush(response);
    expect(result).toEqual(response);
    httpTestingController.verify();
  });

  it('confirms a hold only with explicit terms and privacy acceptance', () => {
    const confirmationRequest: ReservationConfirmationRequest = {
      holdToken: 'hold-token',
      bookingTermsVersion: 'terms-v1',
      privacyNoticeVersion: 'privacy-v1',
      guest: {
        name: 'Ada Lovelace',
        phone: '+39 333 1234567',
      },
      acceptTerms: true,
      acceptPrivacy: true,
      marketingConsent: false,
    };
    const response: ReservationConfirmation = {
      confirmationCode: 'confirmation-code',
      status: 'confirmed',
    };
    let result: typeof response | undefined;

    service
      .confirmReservation(confirmationRequest)
      .subscribe((confirmation) => {
        result = confirmation;
      });

    const request = httpTestingController.expectOne('/api/v1/reservations');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(confirmationRequest);
    request.flush(response);
    expect(result).toEqual(response);
    httpTestingController.verify();
  });

  it('releases a temporary hold using its capability token', () => {
    let result: { status: string } | undefined;
    service.releaseReservationHold('hold-token').subscribe((value) => {
      result = value;
    });

    const request = httpTestingController.expectOne(
      '/api/v1/reservation-holds/release',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ holdToken: 'hold-token' });
    request.flush({ status: 'cancelled_by_guest' });
    expect(result).toEqual({ status: 'cancelled_by_guest' });
    httpTestingController.verify();
  });

  it('looks up and cancels a reservation using its encoded confirmation code', () => {
    let details: ReservationDetails | undefined;
    let cancellation: ReservationCancellation | undefined;

    const confirmationCode = 'confirmation-code_1234567890';
    service.getReservation(confirmationCode).subscribe((value) => {
      details = value;
    });
    const lookupRequest = httpTestingController.expectOne(
      `/api/v1/reservations/${confirmationCode}`,
    );
    expect(lookupRequest.request.method).toBe('GET');
    lookupRequest.flush({
      status: 'confirmed',
      startsAt: '2099-12-31T20:00:00.000Z',
      endsAt: '2099-12-31T22:00:00.000Z',
      partySize: 2,
      tables: ['Table 1'],
    });

    service.cancelReservation(confirmationCode).subscribe((value) => {
      cancellation = value;
    });
    const cancellationRequest = httpTestingController.expectOne(
      `/api/v1/reservations/${confirmationCode}/cancellation`,
    );
    expect(cancellationRequest.request.method).toBe('POST');
    expect(cancellationRequest.request.body).toBeNull();
    cancellationRequest.flush({
      status: 'cancelled_by_guest',
      late: false,
    });

    expect(details).toEqual({
      status: 'confirmed',
      startsAt: '2099-12-31T20:00:00.000Z',
      endsAt: '2099-12-31T22:00:00.000Z',
      partySize: 2,
      tables: ['Table 1'],
    });
    expect(cancellation).toEqual({
      status: 'cancelled_by_guest',
      late: false,
    });
    httpTestingController.verify();
  });
});
