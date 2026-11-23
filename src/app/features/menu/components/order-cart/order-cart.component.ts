import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import type { Observable } from 'rxjs';

import type { Client } from '../../../../core/models/client.model';
import type { CartEntry } from '../../../../core/services/order-cart.service';
import { OrderCartService } from '../../../../core/services/order-cart.service';
import { TranslationService } from '../../../../core/services/translation.service';
import { LocalizedTextPipe } from '../../../../shared/pipes/localized-text.pipe';
import { PricePipe } from '../../../../shared/pipes/price.pipe';

@Component({
  selector: 'app-order-cart',
  standalone: true,
  imports: [CommonModule, AsyncPipe, LocalizedTextPipe, PricePipe],
  templateUrl: './order-cart.component.html',
  styleUrl: './order-cart.component.scss',
})
export class OrderCartComponent {
  @Input({ required: true }) client!: Client;
  @Input() hasMobileContactBar = false;
  isOpen = false;

  readonly entries$: Observable<CartEntry[]>;

  constructor(
    public readonly cart: OrderCartService,
    public readonly translationService: TranslationService,
  ) {
    this.entries$ = this.cart.entries$;
  }

  get whatsappUrl(): string | null {
    const entries = this.cart.getEntries();
    const lines = entries.map((entry) =>
      `${entry.quantity}x ${this.localizedName(entry.item.name)} - ${this.formatPrice(entry.item.price * entry.quantity, entry.item.currency)}`,
    );
    const total = entries.reduce(
      (sum, entry) => sum + entry.item.price * entry.quantity,
      0,
    );
    const message = [
      this.translationService.translate('orderWhatsappIntro'),
      '',
      ...lines,
      '',
      `${this.translationService.translate('total')}: ${this.formatPrice(total, entries[0]?.item.currency ?? 'EUR')}`,
    ].join('\n');

    const phone = (this.client.contacts.whatsapp ?? this.client.contacts.phone ?? '')
      .replace(/\D/g, '');
    if (!phone) {
      return null;
    }
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  localizedName(name: CartEntry['item']['name']): string {
    const language = this.translationService.getCurrentLanguage();
    return name[language] ?? name.it ?? name.en ?? '';
  }

  private formatPrice(value: number, currency: string): string {
    return new Intl.NumberFormat(
      this.translationService.getCurrentLanguage(),
      { style: 'currency', currency },
    ).format(value);
  }
}
