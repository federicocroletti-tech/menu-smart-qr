import { Pipe, PipeTransform } from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';

@Pipe({
  name: 'price',
  standalone: true,
})
export class PricePipe implements PipeTransform {
  constructor(private readonly translationService: TranslationService) {}

  transform(value: number | null | undefined, currency: string = 'EUR'): string {
    if (value === null || value === undefined) {
      return '';
    }

    const language = this.translationService.getCurrentLanguage();
    const locale = this.toLocale(language);
    const formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
    }).format(value);

    if (language === 'it') {
      return formatted.replace(/\u00A0/g, ' ');
    }

    return formatted;
  }

  private toLocale(language: string): string {
    switch (language) {
      case 'en':
        return 'en-US';
      case 'fr':
        return 'fr-FR';
      case 'de':
        return 'de-DE';
      case 'it':
      default:
        return 'it-IT';
    }
  }
}
