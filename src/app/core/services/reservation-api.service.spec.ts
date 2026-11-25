import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  ReservationApiService,
  type ReservationAvailability,
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

    service.getAvailability('restaurant id', '2099-12-31', '20:00', 2)
      .subscribe((availability) => {
        result = availability;
      });

    const request = httpTestingController.expectOne(
      (candidate) =>
        candidate.url ===
        '/api/v1/restaurants/restaurant%20id/availability',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('date')).toBe('2099-12-31');
    expect(request.request.params.get('time')).toBe('20:00');
    expect(request.request.params.get('partySize')).toBe('2');
    request.flush(response);
    expect(result).toEqual(response);
    httpTestingController.verify();
  });
});
