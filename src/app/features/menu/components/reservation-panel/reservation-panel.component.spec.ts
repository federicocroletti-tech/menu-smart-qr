import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';

import type { Client } from '../../../../core/models/client.model';
import {
  ReservationApiService,
  type ReservationAvailability,
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
  reservations: { minimumPartySize: 1, maximumPartySize: 8 },
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

  beforeEach(async () => {
    getAvailability.mockReset();
    getAvailability.mockReturnValue(of(availableResponse));
    await TestBed.configureTestingModule({
      imports: [ReservationPanelComponent],
      providers: [
        {
          provide: ReservationApiService,
          useValue: { getAvailability },
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

  it('checks availability before enabling the WhatsApp request', () => {
    const component = createComponent();
    component.client = client;
    component.date = '2099-12-31';
    component.time = '20:00';
    component.partySize = 2;

    expect(component.canCheckAvailability).toBe(true);
    expect(component.canSendWhatsApp).toBe(false);

    component.checkAvailability();

    expect(getAvailability).toHaveBeenCalledWith(
      'demo',
      '2099-12-31',
      '20:00',
      2,
    );
    expect(component.availability?.available).toBe(true);
    expect(component.canSendWhatsApp).toBe(false);

    component.name = 'Ada Lovelace';
    component.phone = '+39 333 1234567';
    expect(component.canSendWhatsApp).toBe(true);

    component.resetAvailability();
    expect(component.availability).toBeNull();
    expect(component.canSendWhatsApp).toBe(false);
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

  it('does not allow a WhatsApp request when no tables are available', () => {
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
    expect(component.canSendWhatsApp).toBe(false);
  });
});
