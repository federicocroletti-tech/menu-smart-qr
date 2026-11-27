import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';
import type { Observable } from 'rxjs';

import type { Client } from '../../../../core/models/client.model';
import type { CartEntry } from '../../../../core/services/order-cart.service';
import { OrderCartService } from '../../../../core/services/order-cart.service';
import { TranslationService } from '../../../../core/services/translation.service';
import { createWhatsAppUrl } from '../../../../core/utils/whatsapp.util';
import { LocalizedTextPipe } from '../../../../shared/pipes/localized-text.pipe';
import { PricePipe } from '../../../../shared/pipes/price.pipe';

@Component({
  selector: 'app-order-cart',
  standalone: true,
  imports: [CommonModule, AsyncPipe, LocalizedTextPipe, PricePipe],
  templateUrl: './order-cart.component.html',
  styleUrl: './order-cart.component.scss',
})
export class OrderCartComponent implements OnChanges {
  @Input({ required: true }) client!: Client;
  @Input() hasMobileContactBar = false;
  @ViewChild('dialog') private dialogRef?: ElementRef<HTMLElement>;
  isOpen = false;
  private returnFocusTarget: HTMLElement | null = null;

  readonly entries$: Observable<CartEntry[]>;

  constructor(
    public readonly cart: OrderCartService,
    public readonly translationService: TranslationService,
  ) {
    this.entries$ = this.cart.entries$;
  }

  ngOnChanges(): void {
    this.cart.setRestaurant(this.client.id);
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

    return createWhatsAppUrl(this.client.contacts, message);
  }

  get itemCount(): number {
    return this.cart.getEntries().reduce((count, entry) => count + entry.quantity, 0);
  }

  get totalPrice(): number {
    return this.cart.getEntries().reduce(
      (total, entry) => total + entry.item.price * entry.quantity,
      0,
    );
  }

  get totalCurrency(): string {
    return this.cart.getEntries()[0]?.item.currency ?? 'EUR';
  }

  openPanel(trigger: HTMLElement): void {
    this.returnFocusTarget = trigger;
    this.isOpen = true;
    setTimeout(() => this.focusFirstElement(), 0);
  }

  closePanel(): void {
    this.isOpen = false;
    setTimeout(() => this.returnFocusTarget?.focus(), 0);
  }

  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closePanel();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusable = this.getFocusableElements();
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }

    const dialog = this.dialogRef?.nativeElement;
    if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
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

  private focusFirstElement(): void {
    this.dialogRef?.nativeElement.querySelector<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )?.focus();
  }

  private getFocusableElements(): HTMLElement[] {
    return Array.from(
      this.dialogRef?.nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
  }
}
