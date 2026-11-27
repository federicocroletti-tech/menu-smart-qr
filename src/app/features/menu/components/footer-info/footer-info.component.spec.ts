import { TestBed } from '@angular/core/testing';

import type { Client } from '../../../../core/models/client.model';
import { TranslationService } from '../../../../core/services/translation.service';
import { FooterInfoComponent } from './footer-info.component';

function createClient(): Client {
  return {
    id: 'demo',
    name: 'Demo',
    type: 'restaurant',
    description: { it: 'Descrizione' },
    theme: {},
    contacts: {
      address: { it: 'Via Toledo 120, Napoli' },
      mapsUrl: 'https://maps.google.com/?q=Via+Toledo+120+Napoli',
    },
    openingHours: [],
    seo: { title: { it: 'Demo' }, description: { it: 'Demo SEO' } },
    settings: {
      defaultLanguage: 'it',
      enabledLanguages: ['it', 'en', 'fr', 'de'],
      featureFlags: {},
    },
    notes: {},
  };
}

describe('FooterInfoComponent map', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterInfoComponent],
      providers: [
        {
          provide: TranslationService,
          useValue: {
            translate: (key: string) => key,
            getLocalizedValue: (value?: { it?: string }) => value?.it ?? '',
          },
        },
      ],
    }).compileComponents();
  });

  it('only loads the lazy map after the user asks to show it', () => {
    const fixture = TestBed.createComponent(FooterInfoComponent);
    fixture.componentRef.setInput('client', createClient());
    fixture.componentRef.setInput('showOpeningHours', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    const directionsLink: HTMLAnchorElement =
      fixture.nativeElement.querySelector('.directions-link');
    expect(directionsLink.href).toContain('https://maps.google.com/');
    expect(directionsLink.textContent).toContain('takeMeThere');

    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.map-toggle');
    toggle.click();
    fixture.detectChanges();

    const frame: HTMLIFrameElement = fixture.nativeElement.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('loading')).toBe('lazy');
    expect(frame.title).toBe('mapTitle');
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'mapLoading',
    );

    frame.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not render map actions when disabled or location data is absent', () => {
    const fixture = TestBed.createComponent(FooterInfoComponent);
    fixture.componentRef.setInput('client', createClient());
    fixture.componentRef.setInput('showOpeningHours', false);
    fixture.componentRef.setInput('showMap', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.map-actions')).toBeNull();

    fixture.componentRef.setInput('showMap', true);
    fixture.componentRef.setInput('client', {
      ...createClient(),
      contacts: { mapsUrl: 'javascript:alert(1)' },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.map-actions')).toBeNull();
  });

  it('announces an unavailable map when the embedded map fails to load', () => {
    const fixture = TestBed.createComponent(FooterInfoComponent);
    fixture.componentRef.setInput('client', createClient());
    fixture.componentRef.setInput('showOpeningHours', false);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.map-toggle').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('iframe').dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
      'mapError',
    );
  });
});
