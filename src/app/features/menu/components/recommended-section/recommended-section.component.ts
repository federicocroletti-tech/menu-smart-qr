import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import type { Allergen } from '../../../../core/models/allergen.model';
import type { MenuCategory, MenuItem } from '../../../../core/models/menu.model';
import { TranslationService } from '../../../../core/services/translation.service';
import { MenuItemCardComponent } from '../menu-item-card/menu-item-card.component';

@Component({
  selector: 'app-recommended-section',
  standalone: true,
  imports: [CommonModule, MenuItemCardComponent],
  templateUrl: './recommended-section.component.html',
  styleUrl: './recommended-section.component.scss',
})
export class RecommendedSectionComponent {
  @Input() categories: MenuCategory[] = [];
  @Input() showUnavailableItems = true;
  @Input() showAllergens = true;
  @Input() showDishCodes = true;
  @Input() showPrices = true;
  @Input() showDescriptions = true;
  @Input() allergenMap: Record<string, Allergen> = {};

  constructor(public readonly translationService: TranslationService) {}

  get recommendedItems(): MenuItem[] {
    return this.categories
      .flatMap((category) => category.items)
      .filter((item) => item.recommended)
      .filter((item) => this.showUnavailableItems || item.available);
  }
}
