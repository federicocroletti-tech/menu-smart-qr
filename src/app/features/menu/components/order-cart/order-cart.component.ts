import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { map } from 'rxjs';

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
  isOpen = false;

  readonly entries$;

  constructor(
    public readonly cart: OrderCartService,
    public readonly translationService: TranslationService,
  ) {
    this.entries$ = this.cart.entries$.pipe(
      map((entries) => entries as CartEntry[]),
    );
  }

  get whatsappUrl(): string {
    const entries = this.cartEntriesSnapshot;
    const lines = entries.map((entry) =>
      `${entry.quantity}x ${this.localizedName(entry.item.name)} - ${entry.item.currency} ${entry.item.price * entry.quantity}`,
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
      `${this.translationService.translate('total')}: ${entries[0]?.item.currency ?? 'EUR'} ${total.toFixed(2)}`,
    ].join('\n');

    const phone = (this.client.contacts.whatsapp ?? this.client.contacts.phone ?? '')
      .replace(/\D/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  cartEntriesSnapshot: CartEntry[] = [];

  ngOnInit(): void {
    this.entries$.subscribe((entries) => {
      this.cartEntriesSnapshot = entries;
    });
  }

  localizedName(name: CartEntry['item']['name']): string {
    const language = this.translationService.getCurrentLanguage();
    return name[language] ?? name.it ?? name.en ?? '';
  }
}
