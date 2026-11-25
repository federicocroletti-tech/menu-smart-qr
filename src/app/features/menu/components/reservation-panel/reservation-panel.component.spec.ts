import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';

import type { Client } from '../../../../core/models/client.model';
import {
  ReservationApiService,
  type ReservationAvailability,
  type ReservationConfirmation,
  type ReservationHold,
} from '../../../../core/services/reservation-api.service';
import { TranslationService } from '../../../../core/services/translation.service';
import { ReservationPanelComponent } from './reservation-panel.component';

const client: Client = {
  id: 'demo',
  name: 'Demo',
  type: 'restaurant',
  description: { it: 'Demo' },
  theme: {},
  contacts: { whatsapp: '+39 333 1234567' },
  openingHours: [],
  seo: { title: { it: 'Demo' }, description: { it: 'Demo' } },
  settings: {
    defaultLanguage: 'it',
    enabledLanguages: ['it'],
    featureFlags: {},
  },
  notes: { it: '' },
  reservations: {
    minimumPartySize: 1,
    maximumPartySize: 8,
    bookingTermsUrl: 'https://example.test/booking-terms',
    privacyNoticeUrl: 'https://example.test/privacy',
  },
};

const availableResponse: ReservationAvailability = {
  date: '2099-12-31',
  time: '20:00',
  partySize: 2,
  durationMinutes: 120,
  available: true,
  tableSets: [{
    id: 'table-set-1',
    tableIds: ['table-1'],
    minCapacity: 1,
    standardCapacity: 2,
    maxCapacity: 4,
  }],
};

describe('ReservationPanelComponent', () => {
  const getAvailability = vi.fn<ReservationApiService['getAvailability']>();
  const createReservationHold =
    vi.fn<ReservationApiService['createReservationHold']>();
  const confirmReservation =
    vi.fn<ReservationApiService['confirmReservation']>();

  beforeEach(async () => {
    getAvailability.mockReset();
    getAvailability.mockReturnValue(of(availableResponse));
    createReservationHold.mockReset();
    createReservationHold.mockReturnValue(of({
      holdToken: 'hold-token-value-that-is-long-enough',
      expiresAt: '2099-12-31T19:07:00.000Z',
      tableIds: ['table-1'],
    } satisfies ReservationHold));
    confirmReservation.mockReset();
    confirmReservation.mockReturnValue(of({
      confirmationCode: 'confirmation-code',
      status: 'confirmed',
    } satisfies ReservationConfirmation));
    await TestBed.configureTestingModule({
      imports: [ReservationPanelComponent],
      providers: [
        {
          provide: ReservationApiService,
          useValue: {
            getAvailability,
            createReservationHold,
            confirmReservation,
          },
        },
        {
          provide: TranslationService,
          useValue: {
            getCurrentLanguage: () => 'it',
            translate: (key: string) => key,
          },
        },
      ],
    }).compileComponents();
  });

  function createComponent(): ReservationPanelComponent {
    return TestBed.createComponent(ReservationPanelComponent).componentInstance;
  }

  it('requires valid contact details, a future date and an allowed party size', () => {
    const component = createComponent();
    component.client = client;
    component.name = 'Ada Lovelace';
    component.phone = '+39 333 1234567';
    component.date = '2099-12-31';
    component.time = '20:00';
    component.partySize = 4;
    expect(component.isValid).toBe(true);

    component.partySize = 9;
    expect(component.isValid).toBe(false);
    component.partySize = 4;
    component.date = '2000-01-01';
    expect(component.isValid).toBe(false);
  });

  it('rejects short phone numbers and invalid party sizes', () => {
    const component = createComponent();
    component.client = client;
    component.name = 'Ada';
    component.phone = '123';
    component.date = '2099-12-31';
    component.time = '20:00';
    component.partySize = 2;
    expect(component.isValid).toBe(false);

    component.phone = '+39 333 1234567';
    component.partySize = 1.5;
    expect(component.isValid).toBe(false);
  });

  it('requires availability, contact details, and both consents before confirming', () => {
    const component = createComponent();
    component.client = client;
    component.date = '2099-12-31';
    component.time = '20:00';
    component.partySize = 2;

    expect(component.canCheckAvailability).toBe(true);
    expect(component.canSubmitReservation).toBe(false);

    component.checkAvailability();

    expect(getAvailability).toHaveBeenCalledWith(
      'demo',
      '2099-12-31',
      '20:00',
      2,
    );
    expect(component.availability?.available).toBe(true);
    expect(component.canSubmitReservation).toBe(false);

    component.name = 'Ada Lovelace';
    component.phone = '+39 333 1234567';
    expect(component.canSubmitReservation).toBe(false);
    component.acceptBookingTerms = true;
    component.acceptPrivacyNotice = true;
    expect(component.canSubmitReservation).toBe(true);

    component.resetAvailability();
    expect(component.availability).toBeNull();
    expect(component.canSubmitReservation).toBe(false);
  });

  it('creates a hold and confirms it in the reservation database flow', () => {
    const component = createComponent();
    component.client = client;
    component.date = '2099-12-31';
    component.time = '20:00';
    component.partySize = 2;
    component.name = 'Ada Lovelace';
    component.phone = '+39 333 1234567';
    component.notes = 'Window seat';
    component.acceptBookingTerms = true;
    component.acceptPrivacyNotice = true;
    component.availability = availableResponse;

    component.submitReservation();

    expect(createReservationHold).toHaveBeenCalledWith(
      'demo',
      {
        date: '2099-12-31',
        time: '20:00',
        partySize: 2,
        allocationMode: 'restaurant_assigned',
      },
      expect.any(String),
    );
    expect(confirmReservation).toHaveBeenCalledWith({
      holdToken: 'hold-token-value-that-is-long-enough',
      guest: {
        name: 'Ada Lovelace',
        phone: '+39 333 1234567',
        notes: 'Window seat',
      },
      acceptTerms: true,
      acceptPrivacy: true,
      marketingConsent: false,
    });
    expect(component.confirmationCode).toBe('confirmation-code');
    expect(component.canSubmitReservation).toBe(false);
  });

  it('does not submit until both legal documents are configured', () => {
    const component = createComponent();
    component.client = {
      ...client,
      reservations: { minimumPartySize: 1, maximumPartySize: 8 },
    };
    component.date = '2099-12-31';
    component.time = '20:00';
    component.partySize = 2;
    component.name = 'Ada Lovelace';
    component.phone = '+39 333 1234567';
    component.acceptBookingTerms = true;
    component.acceptPrivacyNotice = true;
    component.availability = availableResponse;

    component.submitReservation();

    expect(component.canSubmitReservation).toBe(false);
    expect(createReservationHold).not.toHaveBeenCalled();
  });

  it('does not request availability for an invalid party size', () => {
    const component = createComponent();
    component.client = client;
    component.date = '2099-12-31';
    component.time = '20:00';
    component.partySize = 9;

    expect(component.canCheckAvailability).toBe(false);
    component.checkAvailability();
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it('does not allow a database reservation when no tables are available', () => {
    getAvailability.mockReturnValue(of({
      ...availableResponse,
      available: false,
      tableSets: [],
    }));

    const component = createComponent();
    component.client = client;
    component.date = '2099-12-31';
    component.time = '20:00';
    component.partySize = 2;
    component.name = 'Ada Lovelace';
    component.phone = '+39 333 1234567';

    component.checkAvailability();

    expect(component.availabilityErrorKey).toBe('availabilityNotFound');
    expect(component.canSubmitReservation).toBe(false);
  });
});
