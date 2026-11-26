import { TestBed } from '@angular/core/testing';

import type { Client } from '../../../../core/models/client.model';
import type { MenuItem } from '../../../../core/models/menu.model';
import { OrderCartService } from '../../../../core/services/order-cart.service';
import { TranslationService } from '../../../../core/services/translation.service';
import { OrderCartComponent } from './order-cart.component';

const client: Client = {
  id: 'demo',
  name: 'Demo',
  type: 'restaurant',
  description: { it: 'Demo' },
  theme: {},
  contacts: { whatsapp: '+390000000000' },
  openingHours: [],
  seo: { title: { it: 'Demo' }, description: { it: 'Demo' } },
  settings: {
    defaultLanguage: 'it',
    enabledLanguages: ['it'],
    featureFlags: {},
  },
  notes: { it: '' },
};

const item: MenuItem = {
  id: 'pizza',
  name: { it: 'Pizza' },
  description: { it: 'Demo pizza' },
  price: 5,
  currency: 'EUR',
  allergens: [],
  available: true,
  recommended: false,
  vegetarian: false,
  vegan: false,
  spicy: false,
  glutenFree: false,
  order: 0,
};

describe('OrderCartComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderCartComponent],
      providers: [
        OrderCartService,
        {
          provide: TranslationService,
          useValue: {
            getCurrentLanguage: () => 'it',
            getLocalizedValue: (value: { it?: string }) => value.it ?? '',
            translate: (key: string) => key,
          },
        },
      ],
    }).compileComponents();
  });

  it('shows an empty state and no WhatsApp checkout after the last item is removed', () => {
    const fixture = TestBed.createComponent(OrderCartComponent);
    const cart = TestBed.inject(OrderCartService);
    fixture.componentInstance.client = client;
    fixture.componentInstance.isOpen = true;
    cart.add(item);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.checkout')).not.toBeNull();

    cart.remove(item.id);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.checkout')).toBeNull();
    expect(fixture.nativeElement.querySelector('.cart-empty')?.textContent)
      .toContain('emptyCart');
    expect(fixture.nativeElement.textContent).not.toContain('whatsappUnavailable');
  });
});
