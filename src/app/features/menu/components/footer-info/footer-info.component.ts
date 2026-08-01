import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import type { Client } from '../../../../core/models/client.model';
import { LocalizedTextPipe } from '../../../../shared/pipes/localized-text.pipe';
import { TranslationService } from '../../../../core/services/translation.service';
import { OpeningHoursComponent } from '../opening-hours/opening-hours.component';

@Component({
  selector: 'app-footer-info',
  standalone: true,
  imports: [CommonModule, LocalizedTextPipe, OpeningHoursComponent],
  templateUrl: './footer-info.component.html',
  styleUrl: './footer-info.component.scss',
})
export class FooterInfoComponent {
  @Input({ required: true }) client!: Client;
  @Input() showOpeningHours = true;

  constructor(public readonly translationService: TranslationService) {}

  get noteLines(): string[] {
    const text = this.translationService.getLocalizedValue(this.client.notes);
    return text
      .split('.')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }
}
