import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import type { Client } from '../../../../core/models/client.model';
import { TranslationService } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-contact-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './contact-bar.component.html',
  styleUrl: './contact-bar.component.scss',
})
export class ContactBarComponent {
  @Input({ required: true }) client!: Client;

  constructor(public readonly translationService: TranslationService) {}

  get whatsappUrl(): string | null {
    const whatsapp = this.client.contacts.whatsapp;
    if (!whatsapp) {
      return null;
    }

    const message = encodeURIComponent(
      this.translationService.translate('infoRequestWhatsappMessage'),
    );
    const phone = whatsapp.replace(/\D/g, '');
    return `https://wa.me/${phone}?text=${message}`;
  }

  get phoneUrl(): string | null {
    return this.client.contacts.phone
      ? `tel:${this.client.contacts.phone.replace(/\s+/g, '')}`
      : null;
  }
}
