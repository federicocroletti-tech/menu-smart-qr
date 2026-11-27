import { TestBed } from '@angular/core/testing';

import type { MenuItem } from '../../../../core/models/menu.model';
import { TranslationService } from '../../../../core/services/translation.service';
import { MenuItemCardComponent } from './menu-item-card.component';

const item: MenuItem = {
  id: 'dish-1',
  name: { it: 'Piatto demo' },
  description: { it: 'Descrizione' },
  price: 10,
  currency: 'EUR',
  allergens: [],
  available: true,
  recommended: false,
  vegetarian: false,
  vegan: false,
  spicy: false,
  glutenFree: false,
  order: 1,
  imageUrl: 'https://images.example.test/dish.jpg',
  imageAlt: { it: 'Piatto impiattato' },
};

describe('MenuItemCardComponent images', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuItemCardComponent],
      providers: [{
        provide: TranslationService,
        useValue: {
          translate: (key: string) => key,
          getCurrentLanguage: () => 'it',
          getLocalizedValue: (value?: { it?: string }) => value?.it ?? '',
        },
      }],
    }).compileComponents();
  });

  it('only loads configured images when enabled and reports a failed image', () => {
    const fixture = TestBed.createComponent(MenuItemCardComponent);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('showAllergens', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();

    fixture.componentRef.setInput('showImages', true);
    fixture.detectChanges();
    const image: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.alt).toBe('Piatto impiattato');

    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent)
      .toContain('dishImageUnavailable');
  });

  it('rejects unsafe image URL protocols', () => {
    const fixture = TestBed.createComponent(MenuItemCardComponent);
    fixture.componentRef.setInput('item', { ...item, imageUrl: 'javascript:alert(1)' });
    fixture.componentRef.setInput('showImages', true);
    fixture.componentRef.setInput('showAllergens', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent)
      .toContain('dishImageUnavailable');
  });
});
