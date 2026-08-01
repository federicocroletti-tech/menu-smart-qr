import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { MenuFilter } from '../../../../shared/utils/menu-filter.util';
import { TranslationService } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-search-filter',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-filter.component.html',
  styleUrl: './search-filter.component.scss',
})
export class SearchFilterComponent {
  @Output() filterChange = new EventEmitter<MenuFilter>();

  filter: MenuFilter = {
    query: '',
    vegetarianOnly: false,
    veganOnly: false,
    glutenFreeOnly: false,
    spicyOnly: false,
    recommendedOnly: false,
  };

  constructor(public readonly translationService: TranslationService) {}

  emitChanges(): void {
    this.filterChange.emit({ ...this.filter });
  }
}
