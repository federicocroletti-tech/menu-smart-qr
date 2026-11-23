import { TestBed } from '@angular/core/testing';

import type { Client } from '../../../../core/models/client.model';
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

describe('ReservationPanelComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReservationPanelComponent],
      providers: [{
        provide: TranslationService,
        useValue: {
          getCurrentLanguage: () => 'it',
          translate: (key: string) => key,
        },
      }],
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
});
