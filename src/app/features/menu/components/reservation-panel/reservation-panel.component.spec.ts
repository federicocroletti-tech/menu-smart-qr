import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
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
    tableNames: ['Table 1'],
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
  const releaseReservationHold =
    vi.fn<ReservationApiService['releaseReservationHold']>();

  beforeEach(async () => {
    getAvailability.mockReset();
    getAvailability.mockReturnValue(of(availableResponse));
    createReservationHold.mockReset();
    createReservationHold.mockReturnValue(of({
      holdToken: 'hold-token-value-that-is-long-enough',
      expiresAt: '2099-12-31T19:07:00.000Z',
      tableIds: ['table-1'],
      tableNames: ['Table 1'],
    } satisfies ReservationHold));
    confirmReservation.mockReset();
    confirmReservation.mockReturnValue(of({
      confirmationCode: 'confirmation-code',
      status: 'confirmed',
    } satisfies ReservationConfirmation));
    releaseReservationHold.mockReset();
    releaseReservationHold.mockReturnValue(of({ status: 'cancelled_by_guest' as const }));
    await TestBed.configureTestingModule({
      imports: [ReservationPanelComponent],
      providers: [
        {
          provide: ReservationApiService,
          useValue: {
            getAvailability,
            createReservationHold,
            confirmReservation,
            releaseReservationHold,
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

  it('creates a visible hold and confirms it after the guest accepts', () => {
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
    expect(confirmReservation).not.toHaveBeenCalled();
    expect(component.hold?.tableNames).toEqual(['Table 1']);
    expect(component.remainingHoldSeconds).toBeGreaterThan(0);

    component.confirmHeldReservation();

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
    component.ngOnDestroy();
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

  it('allows same-site legal document paths but rejects protocol-relative URLs', () => {
    const component = createComponent();
    component.client = {
      ...client,
      reservations: {
        bookingTermsUrl: '/legal/demo-booking-terms.html',
        privacyNoticeUrl: '/legal/demo-privacy-notice.html',
      },
    };

    expect(component.bookingTermsUrl).toBe('/legal/demo-booking-terms.html');
    expect(component.privacyNoticeUrl).toBe('/legal/demo-privacy-notice.html');
    expect(component.hasLegalDocuments).toBe(true);

    component.client = {
      ...client,
      reservations: {
        bookingTermsUrl: '//untrusted.example/terms',
        privacyNoticeUrl: '/legal/demo-privacy-notice.html',
      },
    };

    expect(component.bookingTermsUrl).toBeNull();
    expect(component.hasLegalDocuments).toBe(false);
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

  it('lets the guest select a table and creates the matching hold', () => {
    const component = createComponent();
    component.client = client;
    component.date = '2099-12-31';
    component.time = '20:00';
    component.partySize = 2;
    component.name = 'Ada Lovelace';
    component.phone = '+39 333 1234567';
    component.acceptBookingTerms = true;
    component.acceptPrivacyNotice = true;
    component.checkAvailability();
    component.allocationMode = 'guest_selected';
    component.selectedTableSetId = 'table-set-1';

    expect(component.canSubmitReservation).toBe(true);
    component.submitReservation();

    expect(createReservationHold).toHaveBeenCalledWith(
      'demo',
      {
        date: '2099-12-31',
        time: '20:00',
        partySize: 2,
        allocationMode: 'guest_selected',
        tableIds: ['table-1'],
      },
      expect.any(String),
    );
    component.ngOnDestroy();
  });

  it('releases the table hold on the server before allowing a new selection', () => {
    const component = createComponent();
    component.client = client;
    component.date = '2099-12-31';
    component.time = '20:00';
    component.partySize = 2;
    component.name = 'Ada Lovelace';
    component.phone = '+39 333 1234567';
    component.acceptBookingTerms = true;
    component.acceptPrivacyNotice = true;
    component.availability = availableResponse;
    component.submitReservation();
    expect(component.hold).not.toBeNull();

    component.releaseHeldReservation();

    expect(releaseReservationHold).toHaveBeenCalledWith(
      'hold-token-value-that-is-long-enough',
    );
    expect(component.hold).toBeNull();
    expect(component.holdReleased).toBe(true);
    component.ngOnDestroy();
  });

  it('creates a WhatsApp reservation request when online booking is unavailable', () => {
    const component = createComponent();
    component.client = client;
    component.onlineBookingEnabled = false;
    component.date = '2099-12-31';
    component.time = '20:00';
    component.partySize = 3;
    component.name = 'Ada Lovelace';
    component.notes = 'Window seat';

    expect(component.canCheckAvailability).toBe(false);
    expect(component.showWhatsappFallbackAction).toBe(true);
    const whatsappUrl = new URL(component.whatsappReservationUrl as string);
    expect(whatsappUrl.hostname).toBe('wa.me');
    expect(whatsappUrl.searchParams.get('text')).toContain('2099-12-31');
    expect(whatsappUrl.searchParams.get('text')).toContain('Window seat');
  });

  it('ignores a stale availability response after the selection changes', () => {
    const firstResponse = new Subject<ReservationAvailability>();
    const secondResponse = new Subject<ReservationAvailability>();
    getAvailability
      .mockReturnValueOnce(firstResponse)
      .mockReturnValueOnce(secondResponse);
    const component = createComponent();
    component.client = client;
    component.date = '2099-12-31';
    component.time = '20:00';
    component.partySize = 2;

    component.checkAvailability();
    component.resetAvailability();
    component.time = '20:30';
    component.checkAvailability();

    firstResponse.next({
      ...availableResponse,
      time: '20:00',
      available: false,
      tableSets: [],
    });
    expect(component.availability).toBeNull();
    expect(component.isCheckingAvailability).toBe(true);

    secondResponse.next({ ...availableResponse, time: '20:30' });
    expect(component.availability?.time).toBe('20:30');
    expect(component.isCheckingAvailability).toBe(false);
  });

  it('treats a 404 availability response as no availability, not an unexpected error', () => {
    getAvailability.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const component = createComponent();
    component.client = client;
    component.date = '2099-12-31';
    component.time = '20:00';
    component.partySize = 2;

    component.checkAvailability();

    expect(component.availabilityErrorKey).toBe('availabilityNotFound');
    expect(component.isCheckingAvailability).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
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

  it('holds the table before sending confirmation and uses the original guest details', async () => {
    const holdRequest = new Subject<ReservationHold>();
    const confirmation = new Subject<ReservationConfirmation>();
    createReservationHold.mockReturnValue(holdRequest);
    confirmReservation.mockReturnValue(confirmation);
    const fixture = TestBed.createComponent(ReservationPanelComponent);
    const component = fixture.componentInstance;
    component.client = client;
    component.date = '2099-12-31';
    component.time = '20:00';
    component.partySize = 2;
    component.name = 'Ada Lovelace';
    component.phone = '+39 333 1234567';
    component.acceptBookingTerms = true;
    component.acceptPrivacyNotice = true;
    component.availability = availableResponse;
    component.isOpen = true;
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.reservation-submit').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isSubmitting).toBe(true);
    expect(component.canSubmitReservation).toBe(false);
    holdRequest.next({
      holdToken: 'hold-token-value-that-is-long-enough',
      expiresAt: '2099-12-31T19:07:00.000Z',
      tableIds: ['table-1'],
      tableNames: ['Table 1'],
    });
    holdRequest.complete();
    fixture.detectChanges();
    expect(component.hold?.tableNames).toEqual(['Table 1']);
    expect(component.isSubmitting).toBe(false);
    expect(confirmReservation).not.toHaveBeenCalled();

    component.name = 'Changed while pending';
    component.confirmHeldReservation();
    expect(confirmReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        guest: expect.objectContaining({ name: 'Ada Lovelace' }),
      }),
    );

    confirmation.next({
      confirmationCode: 'confirmation-code',
      status: 'confirmed',
    });
    confirmation.complete();
  });

  it('traps keyboard focus and restores it to the reservation trigger on Escape', async () => {
    const fixture = TestBed.createComponent(ReservationPanelComponent);
    fixture.componentInstance.client = client;
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector(
      '.reservation-trigger',
    ) as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]',
    );
    expect(dialog.contains(document.activeElement)).toBe(true);

    focusable[0]?.focus();
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
