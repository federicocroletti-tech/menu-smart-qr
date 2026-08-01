import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import type { Allergen } from '../../../../core/models/allergen.model';
import { LocalizedTextPipe } from '../../../../shared/pipes/localized-text.pipe';
import { TranslationService } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-allergen-list',
  standalone: true,
  imports: [CommonModule, LocalizedTextPipe],
  templateUrl: './allergen-list.component.html',
  styleUrl: './allergen-list.component.scss',
})
export class AllergenListComponent {
  @Input() allergenIds: string[] = [];
  @Input() allergenMap: Record<string, Allergen> = {};

  constructor(public readonly translationService: TranslationService) {}

  get allergens(): Allergen[] {
    return this.allergenIds
      .map((id) => this.allergenMap[id])
      .filter((allergen): allergen is Allergen => Boolean(allergen));
  }
}
