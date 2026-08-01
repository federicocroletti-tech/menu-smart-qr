import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

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
  @Input({ required: true }) item!: MenuItem;
  @Input() showUnavailableItems = true;
  @Input() showAllergens = true;
  @Input() showDishCodes = true;
  @Input() showPrices = true;
  @Input() showDescriptions = true;
  @Input() allergenMap: Record<string, Allergen> = {};

  constructor(public readonly translationService: TranslationService) {}

  get isUnavailableHidden(): boolean {
    return !this.showUnavailableItems && !this.item.available;
  }
}
