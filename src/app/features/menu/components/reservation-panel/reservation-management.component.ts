import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  ReservationApiService,
  type ReservationDetails,
} from '../../../../core/services/reservation-api.service';
import { TranslationService } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-reservation-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reservation-management.component.html',
  styleUrl: './reservation-management.component.scss',
})
export class ReservationManagementComponent {
  @Input() timeZone = 'UTC';

  confirmationCode = '';
  reservation: ReservationDetails | null = null;
  lookupErrorKey = '';
  cancellationErrorKey = '';
  cancellationNoticeKey = '';
  isLookingUp = false;
  isCancelling = false;
  confirmCancellation = false;

  constructor(
    public readonly translationService: TranslationService,
    private readonly reservationApiService: ReservationApiService,
  ) {}

  get canLookup(): boolean {
    return /^[A-Za-z0-9_-]{20,32}$/.test(this.confirmationCode.trim()) &&
      !this.isLookingUp &&
      !this.isCancelling;
  }

  get canCancel(): boolean {
    return this.reservation?.status === 'confirmed' &&
      !this.isCancelling &&
      !this.isLookingUp;
  }

  get reservationStatusKey(): string {
    return this.reservation
      ? `reservationStatus.${this.reservation.status}`
      : '';
  }

  lookupReservation(): void {
    if (!this.canLookup) {
      return;
    }

    this.isLookingUp = true;
    this.reservation = null;
    this.lookupErrorKey = '';
    this.cancellationErrorKey = '';
    this.cancellationNoticeKey = '';
    this.confirmCancellation = false;

    this.reservationApiService
      .getReservation(this.confirmationCode.trim())
      .subscribe({
        next: (reservation) => {
          this.reservation = reservation;
          this.isLookingUp = false;
        },
        error: (error: unknown) => {
          if (!(error instanceof HttpErrorResponse && error.status === 404)) {
            console.error('Failed to retrieve reservation:', error);
          }
          this.lookupErrorKey =
            error instanceof HttpErrorResponse && error.status === 404
              ? 'reservationNotFound'
              : 'reservationLookupError';
          this.isLookingUp = false;
        },
      });
  }

  cancelReservation(): void {
    if (!this.canCancel || !this.confirmCancellation) {
      return;
    }

    this.isCancelling = true;
    this.cancellationErrorKey = '';
    this.cancellationNoticeKey = '';
    this.reservationApiService
      .cancelReservation(this.confirmationCode.trim())
      .subscribe({
        next: (result) => {
          if (this.reservation) {
            this.reservation = { ...this.reservation, status: result.status };
          }
          this.cancellationNoticeKey = result.late
            ? 'reservationCancellationLate'
            : 'reservationCancellationCompleted';
          this.isCancelling = false;
          this.confirmCancellation = false;
        },
        error: (error: unknown) => {
          console.error('Failed to cancel reservation:', error);
          this.cancellationErrorKey =
            error instanceof HttpErrorResponse && error.status === 409
              ? 'reservationCancellationUnavailable'
              : 'reservationCancellationError';
          this.isCancelling = false;
        },
      });
  }

  formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return this.translationService.translate('reservationDateUnavailable');
    }

    try {
      return new Intl.DateTimeFormat(
        this.translationService.getCurrentLanguage(),
        { dateStyle: 'medium', timeStyle: 'short', timeZone: this.timeZone },
      ).format(date);
    } catch (error) {
      console.error('Unable to format reservation time:', error);
      return this.translationService.translate('reservationDateUnavailable');
    }
  }
}
