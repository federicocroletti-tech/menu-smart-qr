import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';

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
  private availabilityRequestId = 0;

  constructor(
    public readonly translationService: TranslationService,
    private readonly reservationApiService: ReservationApiService,
  ) {}

  get whatsappUrl(): string {
    const phone = (this.client.contacts.whatsapp ?? this.client.contacts.phone ?? '')
      .replace(/\D/g, '');
    const message = [
      this.translationService.translate('reservationWhatsappIntro'),
      `${this.translationService.translate('name')}: ${this.name}`,
      `${this.translationService.translate('phone')}: ${this.phone}`,
      `${this.translationService.translate('date')}: ${this.date}`,
      `${this.translationService.translate('time')}: ${this.time}`,
      `${this.translationService.translate('partySize')}: ${this.partySize}`,
      this.notes ? `${this.translationService.translate('notes')}: ${this.notes}` : '',
    ].filter(Boolean).join('\n');
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

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
    const destination = (
      this.client.contacts.whatsapp ?? this.client.contacts.phone ?? ''
    ).replace(/\D/g, '');
    if (
      this.name.trim().length < 2 ||
      this.phone.replace(/\D/g, '').length < 6 ||
      !destination ||
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

  get canSendWhatsApp(): boolean {
    return this.isValid && this.availability?.available === true;
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

  resetAvailability(): void {
    this.availabilityRequestId += 1;
    this.availability = null;
    this.availabilityErrorKey = '';
    this.isCheckingAvailability = false;
  }

  get minimumDate(): string {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 10);
  }
}
