import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import {
  ReservationApiService,
  type ReservationCancellation,
  type ReservationDetails,
} from '../../../../core/services/reservation-api.service';
import { TranslationService } from '../../../../core/services/translation.service';
import { ReservationManagementComponent } from './reservation-management.component';

describe('ReservationManagementComponent', () => {
  const getReservation = vi.fn<ReservationApiService['getReservation']>();
  const cancelReservation = vi.fn<ReservationApiService['cancelReservation']>();

  beforeEach(async () => {
    getReservation.mockReset();
    cancelReservation.mockReset();
    await TestBed.configureTestingModule({
      imports: [ReservationManagementComponent],
      providers: [
        {
          provide: ReservationApiService,
          useValue: { getReservation, cancelReservation },
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

  it('retrieves a reservation by confirmation code and cancels after explicit confirmation', () => {
    const details: ReservationDetails = {
      status: 'confirmed',
      startsAt: '2099-12-31T20:00:00.000Z',
      endsAt: '2099-12-31T22:00:00.000Z',
      partySize: 2,
      tables: ['Table 3'],
    };
    const cancellation: ReservationCancellation = {
      status: 'cancelled_by_guest',
      late: false,
    };
    getReservation.mockReturnValue(of(details));
    cancelReservation.mockReturnValue(of(cancellation));
    const fixture = TestBed.createComponent(ReservationManagementComponent);
    const component = fixture.componentInstance;
    component.confirmationCode = 'Abcdefghijklmnopqrstuvwx12345678';

    component.lookupReservation();
    expect(getReservation).toHaveBeenCalledWith(component.confirmationCode);
    expect(component.reservation).toEqual(details);
    expect(component.canCancel).toBe(true);

    component.cancelReservation();
    expect(cancelReservation).not.toHaveBeenCalled();
    component.confirmCancellation = true;
    component.cancelReservation();

    expect(cancelReservation).toHaveBeenCalledWith(component.confirmationCode);
    expect(component.reservation?.status).toBe('cancelled_by_guest');
    expect(component.cancellationNoticeKey).toBe('reservationCancellationCompleted');
  });

  it('reports an invalid code without calling the API and surfaces missing reservations', () => {
    const fixture = TestBed.createComponent(ReservationManagementComponent);
    const component = fixture.componentInstance;
    component.confirmationCode = 'short';
    component.lookupReservation();

    expect(getReservation).not.toHaveBeenCalled();
    expect(component.isLookingUp).toBe(false);

    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    component.confirmationCode = 'Abcdefghijklmnopqrstuvwx12345678';
    getReservation.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );
    component.lookupReservation();

    expect(component.lookupErrorKey).toBe('reservationNotFound');
    expect(logError).not.toHaveBeenCalled();
    logError.mockRestore();
  });
});
