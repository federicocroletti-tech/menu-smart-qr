import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';

import type { Allergen } from '../../../../core/models/allergen.model';
import type { MenuItem } from '../../../../core/models/menu.model';
import { TranslationService } from '../../../../core/services/translation.service';
import { LocalizedTextPipe } from '../../../../shared/pipes/localized-text.pipe';
import { PricePipe } from '../../../../shared/pipes/price.pipe';
import { AllergenListComponent } from '../allergen-list/allergen-list.component';

@Component({
  selector: 'app-menu-item-card',
  standalone: true,
  imports: [CommonModule, LocalizedTextPipe, PricePipe, AllergenListComponent],
  templateUrl: './menu-item-card.component.html',
  styleUrl: './menu-item-card.component.scss',
})
export class MenuItemCardComponent {
  private readonly document = inject(DOCUMENT);

  @Input({ required: true }) item!: MenuItem;
  @Input() showUnavailableItems = true;
  @Input() showAllergens = true;
  @Input() showDishCodes = true;
  @Input() showPrices = true;
  @Input() showDescriptions = true;
  @Input() showOrderButton = false;
  @Input() showImages = false;
  @Input() allergenMap: Record<string, Allergen> = {};
  @Output() addToOrder = new EventEmitter<MenuItem>();

  constructor(public readonly translationService: TranslationService) {}

  imageFailedUrl: string | null = null;
  imageLoading = true;

  get isUnavailableHidden(): boolean {
    return !this.showUnavailableItems && !this.item.available;
  }

  get safeImageUrl(): string | null {
    if (!this.showImages || !this.item.imageUrl || this.imageFailedUrl === this.item.imageUrl) {
      return null;
    }

    try {
      const url = new URL(this.item.imageUrl, this.document.baseURI);
      const baseUrl = new URL(this.document.baseURI);
      return url.protocol === 'https:' ||
        (baseUrl.protocol === 'http:' && url.protocol === 'http:') ||
        (url.protocol === baseUrl.protocol && url.origin === baseUrl.origin)
        ? url.href
        : null;
    } catch {
      return null;
    }
  }

  get imageAlt(): string {
    return this.translationService.getLocalizedValue(
      this.item.imageAlt ?? this.item.name,
    );
  }

  onImageError(): void {
    this.imageFailedUrl = this.item.imageUrl ?? null;
    this.imageLoading = false;
  }

  onImageLoad(): void {
    this.imageLoading = false;
  }
}
