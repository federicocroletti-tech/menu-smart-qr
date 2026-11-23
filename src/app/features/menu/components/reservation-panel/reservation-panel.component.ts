import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { Client } from '../../../../core/models/client.model';
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

  constructor(public readonly translationService: TranslationService) {}

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

  get minimumDate(): string {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 10);
  }
}
