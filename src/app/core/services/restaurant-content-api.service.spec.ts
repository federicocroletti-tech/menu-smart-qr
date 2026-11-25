import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RestaurantContentApiService } from './restaurant-content-api.service';

describe('RestaurantContentApiService', () => {
  let service: RestaurantContentApiService;
  let httpTestingController: HttpTestingController;
  const originalApiBaseUrl = window.menuSmartQrRuntime?.apiBaseUrl;

  beforeEach(() => {
    window.menuSmartQrRuntime = { apiBaseUrl: 'https://api.example.test/' };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        RestaurantContentApiService,
      ],
    });
    service = TestBed.inject(RestaurantContentApiService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    window.menuSmartQrRuntime = { apiBaseUrl: originalApiBaseUrl };
    httpTestingController.verify();
  });

  it('reads and caches restaurant menu data from the configured API', () => {
    let response: unknown;
    service.getRestaurantContent('restaurant id').subscribe((content) => {
      response = content;
    });
    service.getRestaurantContent('restaurant id').subscribe();

    const request = httpTestingController.expectOne(
      'https://api.example.test/api/v1/restaurants/restaurant%20id/content',
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      client: { id: 'restaurant id' },
      allergens: [],
      menuIndex: { currency: 'EUR', categories: [] },
      menuCategories: {},
    });

    expect(response).toEqual({
      client: { id: 'restaurant id' },
      allergens: [],
      menuIndex: { currency: 'EUR', categories: [] },
      menuCategories: {},
    });
  });
});
