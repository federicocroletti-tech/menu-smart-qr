import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { RuntimeConfigService } from './runtime-config.service';
import {
  AdminApiService,
  type RestaurantMembership,
} from './admin-api.service';

describe('AdminApiService', () => {
  let service: AdminApiService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AdminApiService,
        {
          provide: RuntimeConfigService,
          useValue: { apiV1BaseUrl: 'https://api.example.test/api/v1' },
        },
      ],
    });
    service = TestBed.inject(AdminApiService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  it('loads restaurant memberships with the authenticated access token', () => {
    const result: { restaurants: RestaurantMembership[] } = {
      restaurants: [],
    };
    let response: typeof result | undefined;

    service.getRestaurants('access-token').subscribe((value) => {
      response = value;
    });

    const request = httpTestingController.expectOne(
      'https://api.example.test/api/v1/me/restaurants',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer access-token',
    );
    request.flush(result);

    expect(response).toEqual(result);
    httpTestingController.verify();
  });

  it('requests reservations for the selected restaurant and date', () => {
    let response: unknown;

    service
      .getReservations('restaurant one', '2026-11-27', 'access-token')
      .subscribe((value) => {
        response = value;
      });

    const request = httpTestingController.expectOne(
      (candidate) =>
        candidate.url ===
        'https://api.example.test/api/v1/admin/restaurants/restaurant%20one/reservations',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('date')).toBe('2026-11-27');
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer access-token',
    );
    request.flush({
      restaurantId: 'restaurant one',
      date: '2026-11-27',
      reservations: [],
      hasMore: false,
    });

    expect(response).toEqual({
      restaurantId: 'restaurant one',
      date: '2026-11-27',
      reservations: [],
      hasMore: false,
    });
    httpTestingController.verify();
  });
});
