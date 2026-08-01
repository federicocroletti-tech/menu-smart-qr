import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import type { Allergen } from '../../../../core/models/allergen.model';
import type { MenuCategory, MenuItem } from '../../../../core/models/menu.model';
import { TranslationService } from '../../../../core/services/translation.service';
import { LocalizedTextPipe } from '../../../../shared/pipes/localized-text.pipe';
import { filterMenuItems, type MenuFilter } from '../../../../shared/utils/menu-filter.util';
import { MenuItemCardComponent } from '../menu-item-card/menu-item-card.component';

@Component({
  selector: 'app-menu-section',
  standalone: true,
  imports: [CommonModule, LocalizedTextPipe, MenuItemCardComponent],
  templateUrl: './menu-section.component.html',
  styleUrl: './menu-section.component.scss',
})
export class MenuSectionComponent {
  @Input({ required: true }) category!: MenuCategory;
  @Input() filter: MenuFilter = {};
  @Input() showUnavailableItems = true;
  @Input() showAllergens = true;
  @Input() showDishCodes = true;
  @Input() showPrices = true;
  @Input() showDescriptions = true;
  @Input() allergenMap: Record<string, Allergen> = {};

  constructor(public readonly translationService: TranslationService) {}

  get filteredItems(): MenuItem[] {
    const filtered = filterMenuItems(this.category.items, this.filter);
    return this.showUnavailableItems
      ? filtered
      : filtered.filter((item) => item.available);
  }
}
