import { Component, Input } from '@angular/core';

import type { Client } from '../../../../core/models/client.model';
import { TranslationService } from '../../../../core/services/translation.service';
import { LocalizedTextPipe } from '../../../../shared/pipes/localized-text.pipe';

@Component({
  selector: 'app-promotion-banner',
  standalone: true,
  imports: [LocalizedTextPipe],
  templateUrl: './promotion-banner.component.html',
  styleUrl: './promotion-banner.component.scss',
})
export class PromotionBannerComponent {
  @Input({ required: true }) client!: Client;

  constructor(public readonly translationService: TranslationService) {}
}
