import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import type { OpeningHourDay } from '../../../../core/models/client.model';
import { TranslationService } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-opening-hours',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './opening-hours.component.html',
  styleUrl: './opening-hours.component.scss',
})
export class OpeningHoursComponent {
  @Input() openingHours: OpeningHourDay[] = [];

  constructor(public readonly translationService: TranslationService) {}

  get orderedHours(): OpeningHourDay[] {
    const order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    return [...this.openingHours].sort(
      (a, b) => order.indexOf(a.day.toLowerCase()) - order.indexOf(b.day.toLowerCase()),
    );
  }

  getDayLabel(day: string): string {
    return this.translationService.translate(`weekday.${day.toLowerCase()}`);
  }
}
