import { BehaviorSubject, of } from 'rxjs';
import { TestBed } from '@angular/core/testing';

import type { Allergen } from '../../../../core/models/allergen.model';
import type { Client } from '../../../../core/models/client.model';
import type { MenuCategory } from '../../../../core/models/menu.model';
import { AllergenService } from '../../../../core/services/allergen.service';
import { ClientService } from '../../../../core/services/client.service';
import { MenuService } from '../../../../core/services/menu.service';
import { SeoService } from '../../../../core/services/seo.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { TranslationService } from '../../../../core/services/translation.service';
import { MenuPageComponent } from './menu-page.component';

function createClient(): Client {
  return {
    id: 'demo',
    name: 'Demo',
    type: 'restaurant',
    description: { it: 'Descrizione' },
    theme: {},
    contacts: {},
    openingHours: [],
    seo: { title: { it: 'Demo' }, description: { it: 'Demo SEO' } },
    settings: {
      defaultLanguage: 'it',
      enabledLanguages: ['it', 'en', 'fr', 'de'],
      featureFlags: {},
    },
    notes: { it: 'Note' },
  };
}

describe('MenuPageComponent', () => {
  it('should stop loading when data is loaded', async () => {
    const client = createClient();
    const categories: MenuCategory[] = [];
    const allergens: Allergen[] = [];
    const language$ = new BehaviorSubject<'it' | 'en' | 'fr' | 'de'>('it');

    await TestBed.configureTestingModule({
      imports: [MenuPageComponent],
      providers: [
        { provide: ClientService, useValue: { getClient: () => of(client) } },
        { provide: MenuService, useValue: { getMenuCategories: () => of(categories) } },
        { provide: AllergenService, useValue: { getAllergens: () => of(allergens) } },
        {
          provide: TranslationService,
          useValue: {
            currentLanguage: language$.asObservable(),
            getCurrentLanguage: () => 'it',
            translate: (value: string) => value,
            getLocalizedValue: (value?: Record<string, string>) => value?.['it'] ?? '',
            getSupportedLanguages: () => ['it', 'en', 'fr', 'de'],
            setLanguage: () => {},
          },
        },
        { provide: ThemeService, useValue: { applyTheme: () => {} } },
        { provide: SeoService, useValue: { applySeo: () => {} } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MenuPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.loading).toBe(false);
    expect(fixture.componentInstance.hasError).toBe(false);
  });

  it('should switch to error state if client cannot be loaded', async () => {
    const language$ = new BehaviorSubject<'it' | 'en' | 'fr' | 'de'>('it');

    await TestBed.configureTestingModule({
      imports: [MenuPageComponent],
      providers: [
        { provide: ClientService, useValue: { getClient: () => of(null) } },
        { provide: MenuService, useValue: { getMenuCategories: () => of([]) } },
        { provide: AllergenService, useValue: { getAllergens: () => of([]) } },
        {
          provide: TranslationService,
          useValue: {
            currentLanguage: language$.asObservable(),
            getCurrentLanguage: () => 'it',
            translate: (value: string) => value,
            getLocalizedValue: (value?: Record<string, string>) => value?.['it'] ?? '',
            getSupportedLanguages: () => ['it', 'en', 'fr', 'de'],
            setLanguage: () => {},
          },
        },
        { provide: ThemeService, useValue: { applyTheme: () => {} } },
        { provide: SeoService, useValue: { applySeo: () => {} } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MenuPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.loading).toBe(false);
    expect(fixture.componentInstance.hasError).toBe(true);
  });
});
