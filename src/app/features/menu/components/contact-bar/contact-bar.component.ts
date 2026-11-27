import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import type { Client } from '../../../../core/models/client.model';
import { TranslationService } from '../../../../core/services/translation.service';
import { createWhatsAppUrl } from '../../../../core/utils/whatsapp.util';

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
    return createWhatsAppUrl(
      this.client.contacts,
      this.translationService.translate('infoRequestWhatsappMessage'),
    );
  }

  get phoneUrl(): string | null {
    return this.client.contacts.phone
      ? `tel:${this.client.contacts.phone.replace(/\s+/g, '')}`
      : null;
  }
}
