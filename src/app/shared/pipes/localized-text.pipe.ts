import { Pipe, PipeTransform } from '@angular/core';

import type { LocalizedText } from '../../core/models/i18n.model';
import { TranslationService } from '../../core/services/translation.service';

@Pipe({
  name: 'localizedText',
  standalone: true,
})
export class LocalizedTextPipe implements PipeTransform {
  constructor(private readonly translationService: TranslationService) {}

  transform(value: LocalizedText | null | undefined): string {
    return this.translationService.getLocalizedValue(value ?? undefined);
  }
}
