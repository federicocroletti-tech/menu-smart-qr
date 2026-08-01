import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import type { Client } from '../../../../core/models/client.model';
import { LocalizedTextPipe } from '../../../../shared/pipes/localized-text.pipe';
import { TranslationService } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-restaurant-header',
  standalone: true,
  imports: [CommonModule, LocalizedTextPipe],
  templateUrl: './restaurant-header.component.html',
  styleUrl: './restaurant-header.component.scss',
})
export class RestaurantHeaderComponent {
  @Input({ required: true }) client!: Client;

  constructor(public readonly translationService: TranslationService) {}
}
