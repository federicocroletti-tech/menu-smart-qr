import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';

import type { Client } from '../../../../core/models/client.model';
import {
  ReservationApiService,
  type ReservationAvailability,
} from '../../../../core/services/reservation-api.service';
import { TranslationService } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-reservation-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reservation-panel.component.html',
  styleUrl: './reservation-panel.component.scss',
})
export class ReservationPanelComponent {
  @Input({ required: true }) client!: Client;
  isOpen = false;
  name = '';
  phone = '';
  date = '';
  time = '';
  partySize = 2;
  notes = '';
  availability: ReservationAvailability | null = null;
  availabilityErrorKey = '';
  isCheckingAvailability = false;
  isSubmitting = false;
  acceptBookingTerms = false;
  acceptPrivacyNotice = false;
  confirmationCode = '';
  submissionErrorKey = '';
  private availabilityRequestId = 0;
  private idempotencyKey: string | null = null;

  constructor(
    public readonly translationService: TranslationService,
    private readonly reservationApiService: ReservationApiService,
  ) {}

  get minimumPartySize(): number {
    return this.client.reservations?.minimumPartySize ?? 1;
  }

  get maximumPartySize(): number {
    return this.client.reservations?.maximumPartySize ?? 20;
  }

  get canCheckAvailability(): boolean {
    if (
      !this.date ||
      !this.time ||
      !Number.isInteger(this.partySize) ||
      this.partySize < this.minimumPartySize ||
      this.partySize > this.maximumPartySize
    ) {
      return false;
    }

    const reservationDate = new Date(`${this.date}T${this.time}`);
    return !Number.isNaN(reservationDate.getTime()) &&
      reservationDate.getTime() > Date.now();
  }

  get isValid(): boolean {
    if (
      this.name.trim().length < 2 ||
      this.phone.replace(/\D/g, '').length < 6 ||
      !this.date ||
      !this.time ||
      !Number.isInteger(this.partySize) ||
      this.partySize < this.minimumPartySize ||
      this.partySize > this.maximumPartySize
    ) {
      return false;
    }

    const reservationDate = new Date(`${this.date}T${this.time}`);
    return !Number.isNaN(reservationDate.getTime()) &&
      reservationDate.getTime() > Date.now();
  }

  get bookingTermsUrl(): string | null {
    return this.getSafeDocumentUrl(this.client.reservations?.bookingTermsUrl);
  }

  get privacyNoticeUrl(): string | null {
    return this.getSafeDocumentUrl(this.client.reservations?.privacyNoticeUrl);
  }

  get hasLegalDocuments(): boolean {
    return this.bookingTermsUrl !== null && this.privacyNoticeUrl !== null;
  }

  get canSubmitReservation(): boolean {
    return this.isValid &&
      this.availability?.available === true &&
      this.hasLegalDocuments &&
      this.acceptBookingTerms &&
      this.acceptPrivacyNotice &&
      !this.isSubmitting &&
      !this.confirmationCode;
  }

  checkAvailability(): void {
    if (!this.canCheckAvailability || this.isCheckingAvailability) {
      return;
    }

    const requestId = ++this.availabilityRequestId;
    this.availability = null;
    this.availabilityErrorKey = '';
    this.isCheckingAvailability = true;

    this.reservationApiService
      .getAvailability(this.client.id, this.date, this.time, this.partySize)
      .subscribe({
        next: (availability) => {
          if (requestId !== this.availabilityRequestId) {
            return;
          }
          this.availability = availability;
          this.isCheckingAvailability = false;
          if (!availability.available) {
            this.availabilityErrorKey = 'availabilityNotFound';
          }
        },
        error: (error: unknown) => {
          if (requestId !== this.availabilityRequestId) {
            return;
          }
          console.error('Failed to check reservation availability:', error);
          this.availabilityErrorKey =
            error instanceof HttpErrorResponse && error.status === 404
              ? 'availabilityNotFound'
              : 'availabilityError';
          this.isCheckingAvailability = false;
        },
      });
  }

  submitReservation(): void {
    if (!this.canSubmitReservation) {
      return;
    }

    this.isSubmitting = true;
    this.submissionErrorKey = '';
    this.idempotencyKey ??= crypto.randomUUID();

    this.reservationApiService
      .createReservationHold(
        this.client.id,
        {
          date: this.date,
          time: this.time,
          partySize: this.partySize,
          allocationMode: 'restaurant_assigned',
        },
        this.idempotencyKey,
      )
      .pipe(
        switchMap((hold) =>
          this.reservationApiService.confirmReservation({
            holdToken: hold.holdToken,
            guest: {
              name: this.name.trim(),
              phone: this.phone.trim(),
              notes: this.notes.trim() || undefined,
            },
            acceptTerms: true,
            acceptPrivacy: true,
            marketingConsent: false,
          }),
        ),
      )
      .subscribe({
        next: (confirmation) => {
          this.confirmationCode = confirmation.confirmationCode;
          this.isSubmitting = false;
        },
        error: (error: unknown) => {
          console.error('Failed to save reservation:', error);
          this.submissionErrorKey = 'reservationSubmitError';
          this.isSubmitting = false;
        },
      });
  }

  resetAvailability(): void {
    this.availabilityRequestId += 1;
    this.availability = null;
    this.availabilityErrorKey = '';
    this.submissionErrorKey = '';
    this.confirmationCode = '';
    this.idempotencyKey = null;
    this.isCheckingAvailability = false;
  }

  get minimumDate(): string {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 10);
  }

  private getSafeDocumentUrl(value: string | undefined): string | null {
    if (!value) {
      return null;
    }
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:'
        ? url.href
        : null;
    } catch {
      return null;
    }
  }
}
